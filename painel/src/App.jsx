import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Flame, Workflow, Smartphone, Settings, Shield, LogOut } from 'lucide-react';
import { sb } from './supabase';
import { tocarAlerta, nomeContato } from './util';
import Login from './paginas/Login.jsx';
import Conversas from './paginas/Conversas.jsx';
import Fila from './paginas/Fila.jsx';
import Funis from './paginas/Funis.jsx';
import WhatsApp from './paginas/WhatsApp.jsx';
import Configuracoes from './paginas/Configuracoes.jsx';
import Admin from './paginas/Admin.jsx';

const PAGINAS = [
  { id: 'conversas', nome: 'Conversas', icone: MessageCircle },
  { id: 'fila', nome: 'Leads quentes', icone: Flame },
  { id: 'funis', nome: 'Funis', icone: Workflow },
  { id: 'whatsapp', nome: 'WhatsApp', icone: Smartphone },
  { id: 'config', nome: 'Configurações', icone: Settings },
  { id: 'admin', nome: 'Administração', icone: Shield, soAdmin: true },
];

function lerLocal(chave, padrao) { try { return localStorage.getItem(chave) || padrao; } catch (_) { return padrao; } }
function gravarLocal(chave, valor) { try { localStorage.setItem(chave, valor); } catch (_) { /* ignora */ } }

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState(null);
  const [pagina, setPagina] = useState(lerLocal('pagina', 'conversas'));
  const [abrirContato, setAbrirContato] = useState(null);
  const [toast, setToast] = useState(null);
  const [pendentesFila, setPendentesFila] = useState(0);
  const tituloOriginal = useRef(document.title);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = sb.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'PASSWORD_RECOVERY') {
        setTimeout(async () => {
          const nova = window.prompt('Digite sua NOVA senha (mínimo 6 caracteres):');
          if (nova && nova.length >= 6) {
            const { error } = await sb.auth.updateUser({ password: nova });
            window.alert(error ? 'Erro: ' + error.message : 'Senha alterada com sucesso!');
          }
        }, 300);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) { setPerfil(null); return; }
    sb.from('perfis').select('*').eq('id', sessao.user.id).maybeSingle().then(({ data }) => setPerfil(data || { aprovado: false }));
  }, [sessao]);

  const ehAdmin = perfil?.papel === 'admin' && perfil?.aprovado;

  async function carregarContas() {
    const { data } = await sb.from('contas').select('*').order('criado_em');
    setContas(data || []);
    setContaId((atual) => atual && (data || []).some((c) => c.id === atual) ? atual
      : (lerLocal('conta', '') && (data || []).some((c) => c.id === lerLocal('conta', '')) ? lerLocal('conta', '') : perfil.conta_id));
  }
  useEffect(() => { if (perfil?.aprovado) carregarContas(); }, [perfil]);

  const conta = contas.find((c) => c.id === contaId) || null;

  // Atualiza a conta em tempo real (QR Code, status...)
  useEffect(() => {
    if (!contaId) return;
    const canal = sb.channel('conta-' + contaId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contas', filter: `id=eq.${contaId}` },
        (p) => setContas((cs) => cs.map((c) => (c.id === p.new.id ? { ...c, ...p.new } : c))))
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [contaId]);

  // Alerta de lead quente / precisa de humano
  async function contarFila() {
    if (!contaId) return;
    const { count } = await sb.from('contatos').select('id', { count: 'exact', head: true })
      .eq('conta_id', contaId).in('estado', ['quente', 'humano']).eq('atendido', false);
    setPendentesFila(count || 0);
  }
  useEffect(() => {
    if (!contaId) return;
    contarFila();
    const canal = sb.channel('alerta-' + contaId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contatos', filter: `conta_id=eq.${contaId}` }, (p) => {
        const novo = p.new; const antigo = p.old || {};
        if (novo.estado !== antigo.estado || novo.atendido !== antigo.atendido) contarFila();
        if ((novo.estado === 'quente' && antigo.estado !== 'quente') || (novo.estado === 'humano' && antigo.estado !== 'humano')) {
          tocarAlerta();
          const quente = novo.estado === 'quente';
          setToast({ contato: novo, quente });
          document.title = (quente ? '🔥 Lead quente! ' : '🙋 Atendimento! ') + tituloOriginal.current;
          if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(quente ? '🔥 Novo lead quente' : '🙋 Cliente precisa de atendimento', { body: nomeContato(novo) }); } catch (_) { /* ignora */ }
          }
        }
      })
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [contaId]);

  useEffect(() => {
    const voltar = () => { document.title = tituloOriginal.current; };
    window.addEventListener('focus', voltar);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    return () => window.removeEventListener('focus', voltar);
  }, []);

  function irPara(p) { setPagina(p); gravarLocal('pagina', p); }
  function trocarConta(id) { setContaId(id); gravarLocal('conta', id); }
  function abrirConversa(contatoId) { setAbrirContato(contatoId); irPara('conversas'); setToast(null); }

  if (sessao === undefined) return <div className="vazio">Carregando...</div>;
  if (!sessao) return <Login />;
  if (!perfil) return <div className="vazio">Carregando...</div>;
  if (!perfil.aprovado) {
    return (
      <div className="login"><div className="cartao">
        <h2>Aguardando aprovação</h2>
        <p>Sua conta foi criada, mas o administrador ainda precisa liberar o acesso.</p>
        <button className="btn" onClick={() => sb.auth.signOut()}><LogOut size={16} /> Sair</button>
      </div></div>
    );
  }

  const atual = PAGINAS.find((p) => p.id === pagina && (!p.soAdmin || ehAdmin)) || PAGINAS[0];
  const props = { conta, contaId, perfil, ehAdmin, recarregarContas: carregarContas, abrirConversa };

  return (
    <div className="app">
      <nav className="menu">
        <div className="marca">💬 Atendimento</div>
        {PAGINAS.filter((p) => !p.soAdmin || ehAdmin).map((p) => (
          <button key={p.id} className={'item' + (atual.id === p.id ? ' ativo' : '')} onClick={() => irPara(p.id)}>
            <p.icone size={18} /> {p.nome}
            {p.id === 'fila' && pendentesFila > 0 && <span className="contador" style={{ background: 'var(--quente)' }}>{pendentesFila}</span>}
          </button>
        ))}
        <div className="rodape">
          <span>{perfil.email}</span>
          <button className="btn pequeno" onClick={() => sb.auth.signOut()}><LogOut size={14} /> Sair</button>
        </div>
      </nav>
      <main className="conteudo">
        <div className="topo">
          <h1>{atual.nome}</h1>
          {ehAdmin && contas.length > 1 && (
            <select style={{ width: 'auto', maxWidth: 220 }} value={contaId || ''} onChange={(e) => trocarConta(e.target.value)} title="Conta (WhatsApp) que você está vendo">
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.whatsapp_numero ? ` (${c.whatsapp_numero})` : ''}</option>)}
            </select>
          )}
          {conta && <span className={'selo ' + (conta.whatsapp_status === 'conectado' ? 'ok' : 'humano')}>WhatsApp: {conta.whatsapp_status}</span>}
        </div>
        {!conta ? <div className="vazio">Carregando conta...</div> : (
          <>
            {atual.id === 'conversas' && <Conversas {...props} abrirContato={abrirContato} limparAbrir={() => setAbrirContato(null)} />}
            {atual.id === 'fila' && <Fila {...props} />}
            {atual.id === 'funis' && <Funis {...props} />}
            {atual.id === 'whatsapp' && <WhatsApp {...props} />}
            {atual.id === 'config' && <Configuracoes {...props} />}
            {atual.id === 'admin' && ehAdmin && <Admin {...props} trocarConta={trocarConta} />}
          </>
        )}
      </main>
      {toast && (
        <div className="toast" onClick={() => abrirConversa(toast.contato.id)}>
          <b>{toast.quente ? '🔥 Novo lead QUENTE!' : '🙋 Cliente precisa de atendimento'}</b>
          <div style={{ margin: '6px 0' }}>{nomeContato(toast.contato)}</div>
          <div className="ajuda">Clique para abrir a conversa · <a onClick={(e) => { e.stopPropagation(); setToast(null); }}>fechar</a></div>
        </div>
      )}
    </div>
  );
}
