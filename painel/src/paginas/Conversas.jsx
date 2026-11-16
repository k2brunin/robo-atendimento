import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Paperclip, Pause, Play, ExternalLink, RotateCcw, ArrowLeft, Check, Search, Sparkles, Pencil } from 'lucide-react';
import { sb, urlMidia, enviarArquivo, tipoPorArquivo } from '../supabase';
import { tempoCurto, dataHora, nomeContato, formatarTelefone, linkWhatsApp, iniciais, seloEstado, ROTULOS_RESPOSTAS } from '../util';
import { mesclarConfig } from '../../../compartilhado/motor.mjs';

const FILTROS = [
  { id: 'todas', nome: 'Todas' },
  { id: 'nao_lidas', nome: 'Não lidas' },
  { id: 'quentes', nome: '🔥 Quentes' },
  { id: 'humano', nome: 'Humano/pausado' },
  { id: 'robo', nome: 'Com o robô' },
];

function Midia({ m }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let vivo = true; if (m.midia_path) urlMidia(m.midia_path).then((u) => vivo && setUrl(u)); return () => { vivo = false; }; }, [m.midia_path]);
  if (!m.midia_path) {
    if (m.tipo === 'texto') return null;
    return <div className="ajuda">[{m.tipo}{m.direcao === 'entrada' ? ' recebido' : ''}]</div>;
  }
  if (!url) return <div className="ajuda">carregando {m.tipo}...</div>;
  if (m.tipo === 'imagem' || m.tipo === 'figurinha') return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" loading="lazy" /></a>;
  if (m.tipo === 'audio') return <audio src={url} controls preload="none" />;
  if (m.tipo === 'video') return <video src={url} controls preload="metadata" />;
  return <a href={url} target="_blank" rel="noreferrer">📎 Abrir arquivo</a>;
}

function Bolha({ m }) {
  const classe = m.autor === 'sistema' ? 'sistema' : m.direcao === 'entrada' ? 'entrada' : 'saida' + (m.autor === 'robo' ? ' robo' : '');
  const quem = { robo: '🤖 robô', humano: '👤 você (celular)', painel: '👤 painel', cliente: '', sistema: '' }[m.autor];
  const mostrarTexto = m.texto && !(m.autor === 'robo' && m.midia_path); // no robô, o texto da mídia é só o nome interno
  return (
    <div className={'bolha ' + classe}>
      <Midia m={m} />
      {mostrarTexto && <div>{m.texto}</div>}
      {m.autor === 'robo' && m.midia_path && m.texto && <div className="ajuda">{m.texto}</div>}
      <div className="rodape">
        {quem && <span>{quem}</span>}
        {m.status === 'pendente' && <span>⏳ enviando...</span>}
        {m.status === 'enviando' && <span>⏳</span>}
        {m.status === 'erro' && <span style={{ color: 'var(--perigo)' }} title={m.erro}>⚠ não enviada</span>}
        <span>{tempoCurto(m.criado_em)}</span>
      </div>
    </div>
  );
}

export default function Conversas({ conta, contaId, abrirContato, limparAbrir }) {
  const [contatos, setContatos] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [funis, setFunis] = useState([]);
  const fimRef = useRef(null);
  const arquivoRef = useRef(null);
  const cfg = mesclarConfig(conta.config);

  async function carregarContatos() {
    const { data } = await sb.from('contatos').select('*').eq('conta_id', contaId).order('ultima_msg_em', { ascending: false }).limit(500);
    setContatos(data || []);
  }

  useEffect(() => {
    carregarContatos();
    sb.from('funis').select('id,nome').eq('conta_id', contaId).then(({ data }) => setFunis(data || []));
    const canal = sb.channel('contatos-' + contaId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contatos', filter: `conta_id=eq.${contaId}` }, (p) => {
        if (p.eventType === 'DELETE') { setContatos((cs) => cs.filter((c) => c.id !== p.old.id)); return; }
        setContatos((cs) => {
          const outros = cs.filter((c) => c.id !== p.new.id);
          return [p.new, ...outros].sort((a, b) => new Date(b.ultima_msg_em) - new Date(a.ultima_msg_em));
        });
      })
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [contaId]);

  useEffect(() => { if (abrirContato) { setSelecionadoId(abrirContato); limparAbrir(); } }, [abrirContato]);

  const selecionado = contatos.find((c) => c.id === selecionadoId) || null;

  useEffect(() => {
    if (!selecionadoId) { setMensagens([]); return; }
    let vivo = true;
    sb.from('mensagens').select('*').eq('contato_id', selecionadoId).order('criado_em', { ascending: false }).limit(300)
      .then(({ data }) => vivo && setMensagens((data || []).reverse()));
    sb.from('contatos').update({ nao_lidas: 0 }).eq('id', selecionadoId).then(() => {});
    const canal = sb.channel('msgs-' + selecionadoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens', filter: `contato_id=eq.${selecionadoId}` }, (p) => {
        if (p.eventType === 'INSERT') {
          setMensagens((ms) => (ms.some((m) => m.id === p.new.id) ? ms : [...ms, p.new]));
          if (p.new.direcao === 'entrada' && document.hasFocus()) sb.from('contatos').update({ nao_lidas: 0 }).eq('id', selecionadoId).then(() => {});
        } else if (p.eventType === 'UPDATE') setMensagens((ms) => ms.map((m) => (m.id === p.new.id ? p.new : m)));
      })
      .subscribe();
    return () => { vivo = false; sb.removeChannel(canal); };
  }, [selecionadoId]);

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [mensagens.length, selecionadoId]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contatos.filter((c) => {
      if (filtro === 'nao_lidas' && !c.nao_lidas) return false;
      if (filtro === 'quentes' && c.estado !== 'quente') return false;
      if (filtro === 'humano' && !(c.estado === 'humano' || c.robo_pausado)) return false;
      if (filtro === 'robo' && (c.robo_pausado || ['humano', 'quente', 'finalizado'].includes(c.estado))) return false;
      if (q && !`${c.nome || ''} ${c.nome_whatsapp || ''} ${c.telefone || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [contatos, filtro, busca]);

  async function atualizar(campos) {
    await sb.from('contatos').update(campos).eq('id', selecionado.id);
  }

  async function enviarTexto() {
    const t = texto.trim();
    if (!t || !selecionado) return;
    setEnviando(true);
    const { error } = await sb.from('mensagens').insert({ conta_id: contaId, contato_id: selecionado.id, direcao: 'saida', autor: 'painel', tipo: 'texto', texto: t, status: 'pendente' });
    if (error) alert('Erro: ' + error.message); else setTexto('');
    setEnviando(false);
  }

  async function enviarAnexo(e) {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq || !selecionado) return;
    if (arq.size > 50 * 1024 * 1024) { alert('Arquivo muito grande (máximo 50 MB).'); return; }
    setEnviando(true);
    try {
      const caminho = await enviarArquivo(contaId, 'enviadas', arq);
      await sb.from('mensagens').insert({ conta_id: contaId, contato_id: selecionado.id, direcao: 'saida', autor: 'painel',
        tipo: tipoPorArquivo(arq), texto: texto.trim() || null, midia_path: caminho, status: 'pendente' });
      setTexto('');
    } catch (er) { alert('Erro ao enviar arquivo: ' + er.message); }
    setEnviando(false);
  }

  async function editarNome() {
    const novo = window.prompt('Nome do contato:', selecionado.nome || selecionado.nome_whatsapp || '');
    if (novo !== null) await atualizar({ nome: novo.trim() || null });
  }

  async function reiniciarFunil() {
    if (!window.confirm('Reiniciar o atendimento automático deste cliente? Na próxima mensagem dele o robô começa do zero.')) return;
    await atualizar({ estado: 'novo', funil_id: null, etapa: 0, aguardando: null, tentativas: 0, robo_pausado: false, pausado_motivo: null, atendido: false, motivo_humano: null });
  }

  async function mudarFunil(funilId) {
    if (!funilId) return;
    await atualizar({ funil_id: funilId, estado: 'no_funil', etapa: 0, aguardando: 'resposta', robo_pausado: false, tentativas: 0 });
    alert('Produto alterado. O robô seguirá a partir da etapa 2 deste funil quando o cliente responder.');
  }

  const frete = selecionado?.uf ? cfg.frete_por_uf?.[selecionado.uf] : null;
  let ultimoDia = '';

  return (
    <div className={'inbox' + (selecionado ? ' com-chat' : '')}>
      <aside className="lista">
        <div className="filtros">
          <div className="linha" style={{ flexWrap: 'nowrap' }}>
            <Search size={16} style={{ color: 'var(--suave)' }} />
            <input type="text" placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="chips">
            {FILTROS.map((f) => <button key={f.id} className={'chip' + (filtro === f.id ? ' ativo' : '')} onClick={() => setFiltro(f.id)}>{f.nome}</button>)}
          </div>
        </div>
        <div className="itens">
          {!visiveis.length && <div className="vazio">Nenhuma conversa{contatos.length ? ' neste filtro' : ' ainda'}.</div>}
          {visiveis.map((c) => {
            const selo = seloEstado(c);
            return (
              <div key={c.id} className={'contato' + (c.id === selecionadoId ? ' ativo' : '')} onClick={() => setSelecionadoId(c.id)}>
                <div className="avatar">{iniciais(nomeContato(c))}</div>
                <div className="meio">
                  <div className="nome"><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeContato(c)}</span><small>{tempoCurto(c.ultima_msg_em)}</small></div>
                  <div className="previa"><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultima_msg || ''}</span>
                    {c.nao_lidas > 0 && <span className="contador">{c.nao_lidas}</span>}</div>
                  <span className={'selo ' + selo.classe} style={{ marginTop: 4 }}>{selo.rotulo}</span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="chat">
        {!selecionado ? <div className="vazio" style={{ margin: 'auto' }}>Selecione uma conversa</div> : (
          <>
            <div className="chat-topo">
              <button className="btn icone so-celular" onClick={() => setSelecionadoId(null)}><ArrowLeft size={18} /></button>
              <div className="avatar">{iniciais(nomeContato(selecionado))}</div>
              <div className="info">
                <b>{nomeContato(selecionado)} <a href="#" onClick={(e) => { e.preventDefault(); editarNome(); }} title="Editar nome"><Pencil size={12} /></a></b>
                <span>{formatarTelefone(selecionado.telefone)} {selecionado.respostas?.produto ? '· ' + selecionado.respostas.produto : ''}</span>
              </div>
              {selecionado.robo_pausado || ['humano', 'quente'].includes(selecionado.estado)
                ? <button className="btn pequeno" onClick={() => atualizar({ robo_pausado: false, pausado_motivo: null, estado: ['humano', 'quente'].includes(selecionado.estado) ? 'no_funil' : selecionado.estado })} title="O robô volta a responder este cliente"><Play size={14} /> Reativar robô</button>
                : <button className="btn pequeno" onClick={() => atualizar({ robo_pausado: true, pausado_motivo: 'Pausado no painel', pausado_em: new Date().toISOString() })}><Pause size={14} /> Pausar robô</button>}
              {linkWhatsApp(selecionado) && <a className="btn pequeno" href={linkWhatsApp(selecionado)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> WhatsApp</a>}
            </div>
            {(selecionado.robo_pausado || selecionado.estado === 'humano') && selecionado.estado !== 'quente' && (
              <div className="faixa pausado">⏸ Robô pausado para este cliente{selecionado.pausado_motivo ? ` — ${selecionado.pausado_motivo}` : ''}{selecionado.motivo_humano ? ` — ${selecionado.motivo_humano}` : ''}</div>
            )}
            {selecionado.estado === 'quente' && (
              <div className="faixa quente">🔥 Lead QUENTE — o robô parou. Assuma o atendimento e feche a venda!
                {!selecionado.atendido && <button className="btn pequeno" onClick={() => atualizar({ atendido: true })}><Check size={14} /> Marcar como atendido</button>}
              </div>
            )}
            <div className="mensagens">
              {mensagens.map((m) => {
                const dia = new Date(m.criado_em).toLocaleDateString('pt-BR');
                const sep = dia !== ultimoDia; ultimoDia = dia;
                return (<div key={m.id} style={{ display: 'contents' }}>{sep && <div className="separador">{dia}</div>}<Bolha m={m} /></div>);
              })}
              <div ref={fimRef} />
            </div>
            {selecionado.sugestao_ia && (
              <div className="sugestao"><Sparkles size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}><b>Sugestão da IA:</b> {selecionado.sugestao_ia}</div>
                <button className="btn pequeno" onClick={() => setTexto(selecionado.sugestao_ia)}>Usar</button>
                <button className="btn pequeno" onClick={() => atualizar({ sugestao_ia: null })}>Descartar</button>
              </div>
            )}
            <div className="compositor">
              <input type="file" ref={arquivoRef} style={{ display: 'none' }} onChange={enviarAnexo} />
              <button className="btn icone" title="Enviar arquivo, foto, áudio" onClick={() => arquivoRef.current.click()} disabled={enviando}><Paperclip size={18} /></button>
              <textarea placeholder="Digite uma mensagem (o robô pausa automaticamente para este cliente)" value={texto}
                onChange={(e) => setTexto(e.target.value)} rows={1}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }} />
              <button className="btn primario icone" onClick={enviarTexto} disabled={enviando || !texto.trim()} title="Enviar"><Send size={18} /></button>
            </div>
            {conta.whatsapp_status !== 'conectado' && <div className="faixa pausado">⚠ WhatsApp desconectado: as mensagens ficam na fila até reconectar.</div>}
          </>
        )}
      </section>

      {selecionado && (
        <aside className="lateral">
          <span className={'selo ' + seloEstado(selecionado).classe}>{seloEstado(selecionado).rotulo}</span>
          <h3>Respostas do cliente</h3>
          {Object.entries(selecionado.respostas || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
            <div key={k} className="campo"><small>{ROTULOS_RESPOSTAS[k] || k.replace(/_/g, ' ')}</small>{String(v)}</div>
          ))}
          {!Object.keys(selecionado.respostas || {}).filter((k) => !k.startsWith('_')).length && <div className="ajuda">Nenhuma ainda.</div>}
          {(selecionado.cep || selecionado.cidade) && (<>
            <h3>Entrega</h3>
            <div className="campo"><small>CEP / cidade</small>{selecionado.cep} {selecionado.cidade ? `— ${selecionado.cidade}/${selecionado.uf}` : ''}</div>
            {frete != null && <div className="campo"><small>Frete estimado ({selecionado.uf})</small>R$ {Number(frete).toFixed(2).replace('.', ',')} <span className="ajuda">(grátis a partir de 4 un.)</span></div>}
          </>)}
          <h3>Produto / funil</h3>
          <select value={selecionado.funil_id || ''} onChange={(e) => mudarFunil(e.target.value)}>
            <option value="">— não identificado —</option>
            {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <h3>Ações</h3>
          <div className="grade" style={{ gap: 8 }}>
            <button className="btn pequeno" onClick={reiniciarFunil}><RotateCcw size={14} /> Recomeçar atendimento do robô</button>
            {['quente', 'humano'].includes(selecionado.estado) && !selecionado.atendido && <button className="btn pequeno" onClick={() => atualizar({ atendido: true })}><Check size={14} /> Marcar como atendido</button>}
          </div>
          <h3>Informações</h3>
          <div className="campo"><small>Primeiro contato</small>{dataHora(selecionado.criado_em)}</div>
          {selecionado.quente_em && <div className="campo"><small>Ficou quente em</small>{dataHora(selecionado.quente_em)}</div>}
          <div className="campo"><small>Nome no WhatsApp</small>{selecionado.nome_whatsapp || '—'}</div>
        </aside>
      )}
    </div>
  );
}
