import { useEffect, useState } from 'react';
import { UserPlus, Trash2, KeyRound, Eye } from 'lucide-react';
import { sb } from '../supabase';
import { Interruptor } from '../componentes.jsx';

export default function Admin({ perfil, recarregarContas, trocarConta }) {
  const [perfis, setPerfis] = useState([]);
  const [contas, setContas] = useState([]);
  const [segredos, setSegredos] = useState({});
  const [novo, setNovo] = useState({ nome: '', email: '', senha: '' });
  const [msg, setMsg] = useState('');

  async function carregar() {
    const [p, c, s] = await Promise.all([
      sb.from('perfis').select('*').order('criado_em'),
      sb.from('contas').select('*'),
      sb.from('segredos_conta').select('*'),
    ]);
    setPerfis(p.data || []); setContas(c.data || []);
    setSegredos(Object.fromEntries((s.data || []).map((x) => [x.conta_id, x.gemini_chave || ''])));
  }
  useEffect(() => { carregar(); }, []);

  async function chamar(corpo) {
    const { data, error } = await sb.functions.invoke('admin-usuarios', { body: corpo });
    if (error) {
      let detalhe = error.message;
      try { const j = await error.context.json(); detalhe = j.erro || detalhe; } catch (_) { /* ignora */ }
      throw new Error(detalhe);
    }
    return data;
  }

  async function criar(e) {
    e.preventDefault(); setMsg('');
    try { await chamar({ acao: 'criar', ...novo }); setMsg('Usuário criado ✅ Envie o e-mail e a senha para ele entrar.'); setNovo({ nome: '', email: '', senha: '' }); carregar(); recarregarContas(); }
    catch (er) { setMsg('Erro: ' + er.message); }
  }
  async function trocarSenha(p) {
    const s = window.prompt(`Nova senha para ${p.email} (mínimo 6 caracteres):`);
    if (!s) return;
    try { await chamar({ acao: 'senha', id: p.id, senha: s }); alert('Senha alterada.'); } catch (er) { alert('Erro: ' + er.message); }
  }
  async function excluir(p) {
    if (!window.confirm(`Excluir ${p.email}? Todas as conversas, funis e o WhatsApp desta conta serão apagados.`)) return;
    try { await chamar({ acao: 'excluir', id: p.id }); carregar(); recarregarContas(); } catch (er) { alert('Erro: ' + er.message); }
  }
  async function aprovar(p, v) { await sb.from('perfis').update({ aprovado: v }).eq('id', p.id); carregar(); recarregarContas(); }
  async function mudarConta(id, campos) { await sb.from('contas').update(campos).eq('id', id); carregar(); recarregarContas(); }
  async function salvarChave(contaId) {
    const { error } = await sb.from('segredos_conta').upsert({ conta_id: contaId, gemini_chave: segredos[contaId] || null, atualizado_em: new Date().toISOString() });
    alert(error ? 'Erro: ' + error.message : 'Chave salva.');
  }

  return (
    <div className="pagina">
      <div className="grade" style={{ maxWidth: 1100 }}>
        <div className="cartao" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Usuários (1 usuário = 1 WhatsApp)</h3>
          <table className="tabela">
            <thead><tr><th>Usuário</th><th>Liberado</th><th>WhatsApp</th><th>IA</th><th>Chave Gemini (grátis)</th><th /></tr></thead>
            <tbody>
              {perfis.map((p) => {
                const c = contas.find((x) => x.id === p.conta_id) || {};
                return (
                  <tr key={p.id}>
                    <td><b>{p.nome}</b>{p.papel === 'admin' && <span className="selo robo" style={{ marginLeft: 6 }}>ADM</span>}<div className="ajuda">{p.email}</div></td>
                    <td>{p.papel === 'admin' ? '—' : <Interruptor valor={p.aprovado} onChange={(v) => aprovar(p, v)} />}</td>
                    <td><span className={'selo ' + (c.whatsapp_status === 'conectado' ? 'ok' : '')}>{c.whatsapp_status || '—'}</span><div className="ajuda">{c.whatsapp_numero}</div></td>
                    <td>
                      <div className="linha"><Interruptor valor={c.ia_ativa} onChange={(v) => mudarConta(c.id, { ia_ativa: v })} />
                        {c.ia_ativa && <select style={{ width: 'auto' }} value={c.ia_modo} onChange={(e) => mudarConta(c.id, { ia_modo: e.target.value })}>
                          <option value="sugerir">Só sugerir resposta</option><option value="responder">Responder dúvidas sozinha</option></select>}</div>
                    </td>
                    <td><div className="linha" style={{ flexWrap: 'nowrap' }}>
                      <input type="password" placeholder="AIza..." value={segredos[c.id] || ''} onChange={(e) => setSegredos((s) => ({ ...s, [c.id]: e.target.value }))} style={{ minWidth: 120 }} />
                      <button className="btn pequeno" onClick={() => salvarChave(c.id)}>Salvar</button></div></td>
                    <td><div className="linha" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn icone pequeno" title="Ver esta conta" onClick={() => trocarConta(c.id)}><Eye size={14} /></button>
                      <button className="btn icone pequeno" title="Trocar senha" onClick={() => trocarSenha(p)}><KeyRound size={14} /></button>
                      {p.id !== perfil.id && <button className="btn icone pequeno perigo" title="Excluir" onClick={() => excluir(p)}><Trash2 size={14} /></button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="ajuda">IA: pegue uma chave grátis em aistudio.google.com → "Get API key". "Só sugerir" mostra uma resposta pronta para você aprovar; "Responder sozinha" responde dúvidas que o robô não entendeu, usando as informações da página Configurações.</p>
        </div>

        <form className="cartao" onSubmit={criar} style={{ maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}><UserPlus size={16} /> Criar novo usuário</h3>
          {msg && <div className={msg.startsWith('Erro') ? 'erro-caixa' : 'ok-caixa'}>{msg}</div>}
          <label className="rotulo">Nome</label><input type="text" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required />
          <label className="rotulo">E-mail</label><input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} required />
          <label className="rotulo">Senha inicial</label><input type="text" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} required minLength={6} />
          <button className="btn primario" style={{ marginTop: 14 }}><UserPlus size={16} /> Criar usuário</button>
          <p className="ajuda">O usuário entra no mesmo site com esse e-mail e senha, conecta o WhatsApp dele pela página "WhatsApp" e monta os próprios funis. O robô dele roda no seu PC.</p>
        </form>
      </div>
    </div>
  );
}
