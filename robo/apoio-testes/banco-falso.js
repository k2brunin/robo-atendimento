// Banco em memória que imita o Supabase (só o que o robô usa) — para testes automáticos.
const crypto = require('crypto');
const tabelas = { contas: [], contatos: [], mensagens: [], funis: [], segredos_conta: [], perfis: [] };

class Consulta {
  constructor(t) { this.t = t; this.filtros = []; this.op = 'select'; this.dados = null; this.ordem = null; this.lim = null; this.retornar = false; }
  select() { if (this.op !== 'select') this.retornar = true; return this; }
  eq(c, v) { this.filtros.push((r) => r[c] === v); return this; }
  in(c, vs) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  order(c, o = {}) { this.ordem = [c, o.ascending !== false]; return this; }
  limit(n) { this.lim = n; return this; }
  insert(d) { this.op = 'insert'; this.dados = d; return this; }
  update(d) { this.op = 'update'; this.dados = d; return this; }
  upsert(d) { this.op = 'upsert'; this.dados = d; return this; }
  executar() {
    const lista = tabelas[this.t];
    if (this.op === 'insert' || this.op === 'upsert') {
      const novos = (Array.isArray(this.dados) ? this.dados : [this.dados]).map((d) => {
        if (this.op === 'upsert' && this.t === 'contatos') {
          const ex = lista.find((r) => r.conta_id === d.conta_id && r.wa_id === d.wa_id);
          if (ex) return Object.assign(ex, d);
        }
        const base = this.t === 'contatos' ? { estado: 'novo', etapa: 0, tentativas: 0, robo_pausado: false, respostas: {}, nao_lidas: 0, ultima_msg_em: new Date().toISOString() } : {};
        const r = { id: crypto.randomUUID(), status: 'ok', criado_em: new Date().toISOString(), ...base, ...d };
        lista.push(r);
        if (this.t === 'mensagens') {
          const c = tabelas.contatos.find((x) => x.id === r.contato_id);
          if (c) { c.ultima_msg_em = r.criado_em; c.ultima_msg = r.texto; }
        }
        return r;
      });
      return novos;
    }
    let res = lista.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === 'update') { res.forEach((r) => Object.assign(r, JSON.parse(JSON.stringify(this.dados)))); return res; }
    if (this.ordem) { const [c, asc] = this.ordem; res = [...res].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
    if (this.lim) res = res.slice(0, this.lim);
    return res.map((r) => JSON.parse(JSON.stringify(r)));
  }
  then(ok, falha) { try { ok({ data: this.executar(), error: null }); } catch (e) { falha ? falha(e) : ok({ data: null, error: e }); } }
  single() { const d = this.executar(); return Promise.resolve({ data: d[0] || null, error: d[0] ? null : { message: 'não encontrado' } }); }
  maybeSingle() { const d = this.executar(); return Promise.resolve({ data: d[0] || null, error: null }); }
}

const arquivos = {};
const sb = {
  from: (t) => new Consulta(t),
  storage: { from: () => ({
    upload: async (p, b) => { arquivos[p] = b; return { error: null }; },
    download: async (p) => (arquivos[p] ? { data: { arrayBuffer: async () => arquivos[p] }, error: null } : { data: null, error: { message: 'x' } }),
  }) },
};
module.exports = { sb, tabelas, arquivos };
