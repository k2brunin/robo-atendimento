// Gerencia todas as contas: liga/desliga WhatsApps, executa comandos do painel e envia mensagens pendentes.
const { sb } = require('./banco');
const { log } = require('./dados');
const { Sessao } = require('./sessao');

class Gerenciador {
  constructor() {
    this.sessoes = new Map();
    this.rodando = false;
    this.ultimoErro = null;
    this.contas = [];
  }

  async iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    log('Gerenciador iniciado.');
    // Ao ligar o PC: marca todas como desconectadas até o WhatsApp abrir de verdade
    this.loopContas();
    this.loopPendentes();
    this.loopBatimento();
  }

  async parar() {
    this.rodando = false;
    for (const s of this.sessoes.values()) await s.parar().catch(() => {});
    this.sessoes.clear();
  }

  async buscarContas() {
    const { data, error } = await sb.from('contas').select('*, perfis!inner(aprovado)').eq('perfis.aprovado', true);
    if (error) throw error;
    // remove duplicadas (uma conta pode ter mais de um perfil)
    const vistos = new Map();
    for (const c of data || []) { delete c.perfis; vistos.set(c.id, c); }
    return [...vistos.values()];
  }

  async loopContas() {
    while (this.rodando) {
      try {
        const contas = await this.buscarContas();
        this.contas = contas;
        this.ultimoErro = null;
        for (const conta of contas) {
          let s = this.sessoes.get(conta.id);
          if (!s) {
            s = new Sessao(conta);
            this.sessoes.set(conta.id, s);
            if (s.temSessaoSalva() && conta.comando !== 'desconectar') {
              s.iniciar().catch((e) => log(e));
            } else if (conta.whatsapp_status !== 'desconectado' && !conta.comando) {
              await s.status({ whatsapp_status: 'desconectado', whatsapp_qr: null });
            }
          }
          // mantém dados da conta atualizados (config, robô ativo, IA...)
          const { whatsapp_status, whatsapp_qr, ...resto } = conta;
          Object.assign(s.conta, resto);
          if (conta.comando) await this.executarComando(s, conta.comando);
        }
        // contas removidas/desaprovadas
        for (const [id, s] of this.sessoes) {
          if (!contas.find((c) => c.id === id)) { await s.parar().catch(() => {}); this.sessoes.delete(id); }
        }
      } catch (e) {
        this.ultimoErro = e.message;
        log('Erro ao ler contas:', e.message);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  async executarComando(s, comando) {
    await sb.from('contas').update({ comando: null }).eq('id', s.id);
    s.conta.comando = null;
    log(`[${s.conta.nome}] comando recebido: ${comando}`);
    if (comando === 'conectar') { if (!s.client) s.iniciar().catch((e) => log(e)); }
    else if (comando === 'desconectar') await s.parar({ sair: true });
    else if (comando === 'reiniciar') { await s.parar(); s.iniciar().catch((e) => log(e)); }
  }

  async loopPendentes() {
    while (this.rodando) {
      try {
        const ids = [...this.sessoes.values()].filter((s) => s.pronto).map((s) => s.id);
        if (ids.length) {
          const { data, error } = await sb.from('mensagens').select('*, contatos!inner(id, wa_id)')
            .in('conta_id', ids).eq('status', 'pendente').order('criado_em').limit(20);
          if (error) throw error;
          for (const m of data || []) {
            const s = this.sessoes.get(m.conta_id);
            const contato = m.contatos; delete m.contatos;
            if (s) await s.enviarDoPainel(m, contato).catch((e) => log('Erro envio painel:', e));
          }
        }
      } catch (e) { log('Erro mensagens pendentes:', e.message); }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  async loopBatimento() {
    while (this.rodando) {
      try {
        const ids = [...this.sessoes.keys()];
        if (ids.length) await sb.from('contas').update({ robo_visto_em: new Date().toISOString() }).in('id', ids);
      } catch (e) { log('Erro batimento:', e.message); }
      await new Promise((r) => setTimeout(r, 30000));
    }
  }

  resumo() {
    return [...this.sessoes.values()].map((s) => ({ nome: s.conta.nome, status: s.conta.whatsapp_status, numero: s.conta.whatsapp_numero }));
  }
}

module.exports = { Gerenciador };
