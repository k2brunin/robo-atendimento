import { useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, Check, Undo2 } from 'lucide-react';
import { sb } from '../supabase';
import { nomeContato, formatarTelefone, linkWhatsApp, dataHora, ROTULOS_RESPOSTAS } from '../util';

function Cartao({ c, abrirConversa, atualizar }) {
  const respostas = Object.entries(c.respostas || {}).filter(([k]) => !k.startsWith('_') && k !== 'produto');
  return (
    <div className="cartao lead">
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <h4>{nomeContato(c)}</h4>
        <span className={'selo ' + (c.estado === 'quente' ? 'quente' : 'humano')}>{c.estado === 'quente' ? '🔥 Quente' : '🙋 Humano'}</span>
      </div>
      <div className="ajuda">{formatarTelefone(c.telefone)} · {dataHora(c.quente_em || c.ultima_msg_em)}</div>
      <div style={{ marginTop: 6 }}><b>{c.respostas?.produto || 'Produto não identificado'}</b>{c.cidade ? ` · ${c.cidade}/${c.uf}` : ''}</div>
      {c.estado === 'humano' && c.motivo_humano && <div className="aviso-caixa" style={{ fontSize: 13 }}>{c.motivo_humano}</div>}
      {respostas.length > 0 && (
        <div className="resumo">{respostas.map(([k, v]) => <div key={k}><b>{ROTULOS_RESPOSTAS[k] || k}:</b> {String(v)}</div>)}</div>
      )}
      <div className="linha">
        <button className="btn pequeno primario" onClick={() => abrirConversa(c.id)}><MessageCircle size={14} /> Abrir conversa</button>
        {linkWhatsApp(c) && <a className="btn pequeno" href={linkWhatsApp(c)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir no WhatsApp</a>}
        {!c.atendido
          ? <button className="btn pequeno" onClick={() => atualizar(c.id, { atendido: true })}><Check size={14} /> Atendido</button>
          : <button className="btn pequeno" onClick={() => atualizar(c.id, { atendido: false })}><Undo2 size={14} /> Voltar para a fila</button>}
      </div>
    </div>
  );
}

export default function Fila({ contaId, abrirConversa }) {
  const [itens, setItens] = useState([]);
  const [verAtendidos, setVerAtendidos] = useState(false);

  async function carregar() {
    let q = sb.from('contatos').select('*').eq('conta_id', contaId).in('estado', ['quente', 'humano'])
      .order('quente_em', { ascending: false, nullsFirst: false }).order('ultima_msg_em', { ascending: false }).limit(200);
    if (!verAtendidos) q = q.eq('atendido', false);
    const { data } = await q;
    setItens(data || []);
  }
  useEffect(() => {
    carregar();
    const canal = sb.channel('fila-' + contaId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contatos', filter: `conta_id=eq.${contaId}` }, () => carregar())
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [contaId, verAtendidos]);

  async function atualizar(id, campos) { await sb.from('contatos').update(campos).eq('id', id); carregar(); }

  const quentes = itens.filter((c) => c.estado === 'quente');
  const humanos = itens.filter((c) => c.estado === 'humano');
  return (
    <div className="pagina">
      <div className="linha" style={{ marginBottom: 14 }}>
        <label className="interruptor"><input type="checkbox" checked={verAtendidos} onChange={(e) => setVerAtendidos(e.target.checked)} /><span /></label>
        <span>Mostrar também os já atendidos</span>
        <span className="ajuda" style={{ marginLeft: 'auto' }}>Um som toca quando chega lead novo (deixe esta aba aberta).</span>
      </div>
      <h3>🔥 Leads quentes — querem comprar ({quentes.length})</h3>
      {!quentes.length && <div className="vazio">Nenhum lead quente no momento.</div>}
      <div className="cartoes-fila">{quentes.map((c) => <Cartao key={c.id} c={c} abrirConversa={abrirConversa} atualizar={atualizar} />)}</div>
      <h3 style={{ marginTop: 28 }}>🙋 Precisam de atendimento humano ({humanos.length})</h3>
      <p className="ajuda">Clientes que o robô não entendeu, mandaram áudio repetidamente ou disseram "vou pensar". Vale tentar recuperar!</p>
      {!humanos.length && <div className="vazio">Ninguém aguardando.</div>}
      <div className="cartoes-fila">{humanos.map((c) => <Cartao key={c.id} c={c} abrirConversa={abrirConversa} atualizar={atualizar} />)}</div>
    </div>
  );
}
