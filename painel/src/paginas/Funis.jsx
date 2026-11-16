import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Copy, Upload, MessageSquare, Mic, Video, Image, FileText, Send, RotateCcw } from 'lucide-react';
import { sb, urlMidia, enviarArquivo } from '../supabase';
import { Variacoes, Interruptor, Palavras } from '../componentes.jsx';
import { processar, mesclarConfig } from '../../../compartilhado/motor.mjs';
import { funisExemplo } from '../../../compartilhado/padroes.mjs';

const TIPOS_BLOCO = {
  texto: { nome: 'Texto', icone: MessageSquare },
  audio: { nome: 'Áudio (vai como gravado na hora)', icone: Mic },
  video: { nome: 'Vídeo', icone: Video },
  imagem: { nome: 'Imagem / banner', icone: Image },
  documento: { nome: 'Arquivo / PDF / catálogo', icone: FileText },
};
const ACEITA = { audio: 'audio/*,.ogg,.opus,.mp3,.m4a', video: 'video/*', imagem: 'image/*', documento: '*/*' };
const DEPOIS = {
  sim_nao: 'Esperar SIM ou NÃO (sim = próxima etapa)',
  resposta: 'Esperar uma resposta qualquer e salvar (ex: quantidade, endereço)',
  seguir: 'Ir direto para a próxima etapa (sem esperar)',
  quente: 'FIM: marcar lead QUENTE e chamar você',
};
const ETAPA_NOVA = () => ({ id: crypto.randomUUID().slice(0, 8), nome: 'Nova etapa', blocos: [{ tipo: 'texto', variacoes: [''] }], depois: 'sim_nao', campo: '', repergunta: [], se_nao: 'humano' });

function PreviaMidia({ bloco }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (bloco.path) urlMidia(bloco.path).then(setUrl); else setUrl(null); }, [bloco.path]);
  if (!bloco.path) return <div className="aviso-caixa" style={{ margin: 0 }}>⚠ Nenhum arquivo enviado ainda (este bloco será pulado).</div>;
  if (!url) return null;
  if (bloco.tipo === 'audio') return <audio src={url} controls preload="none" style={{ width: '100%' }} />;
  if (bloco.tipo === 'video') return <video src={url} controls preload="metadata" style={{ maxWidth: 260, maxHeight: 200 }} />;
  if (bloco.tipo === 'imagem') return <img src={url} alt="" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }} />;
  return <a href={url} target="_blank" rel="noreferrer">📎 ver arquivo</a>;
}

function Bloco({ bloco, mudar, remover, subir, descer, contaId }) {
  const Icone = TIPOS_BLOCO[bloco.tipo].icone;
  const ref = useRef(null);
  const [enviando, setEnviando] = useState(false);
  async function upload(e) {
    const arq = e.target.files?.[0]; e.target.value = '';
    if (!arq) return;
    if (arq.size > 50 * 1024 * 1024) { alert('Arquivo muito grande (máximo 50 MB).'); return; }
    setEnviando(true);
    try { const path = await enviarArquivo(contaId, 'funis', arq); mudar({ ...bloco, path, nome: bloco.nome || arq.name }); }
    catch (er) { alert('Erro no envio: ' + er.message); }
    setEnviando(false);
  }
  return (
    <div className="bloco">
      <div className="bloco-topo"><Icone size={16} /> {TIPOS_BLOCO[bloco.tipo].nome}<span className="esp" />
        <button className="btn icone pequeno" onClick={subir} title="Subir"><ArrowUp size={14} /></button>
        <button className="btn icone pequeno" onClick={descer} title="Descer"><ArrowDown size={14} /></button>
        <button className="btn icone pequeno perigo" onClick={remover} title="Remover"><Trash2 size={14} /></button>
      </div>
      {bloco.tipo === 'texto' ? <Variacoes valor={bloco.variacoes} onChange={(v) => mudar({ ...bloco, variacoes: v })} /> : (
        <div className="grade" style={{ gap: 8 }}>
          <input type="text" placeholder="Nome para você identificar (ex: Áudio apresentação)" value={bloco.nome || ''} onChange={(e) => mudar({ ...bloco, nome: e.target.value })} />
          <PreviaMidia bloco={bloco} />
          <div className="linha">
            <input type="file" ref={ref} accept={ACEITA[bloco.tipo]} style={{ display: 'none' }} onChange={upload} />
            <button className="btn pequeno" onClick={() => ref.current.click()} disabled={enviando}><Upload size={14} /> {enviando ? 'Enviando...' : bloco.path ? 'Trocar arquivo' : 'Enviar arquivo'}</button>
            {bloco.tipo === 'audio' && <span className="ajuda">Dica: use os áudios .ogg do próprio WhatsApp para parecer gravado na hora.</span>}
          </div>
          {(bloco.tipo === 'imagem' || bloco.tipo === 'video') && (
            <input type="text" placeholder="Legenda (opcional)" value={bloco.legenda || ''} onChange={(e) => mudar({ ...bloco, legenda: e.target.value })} />
          )}
        </div>
      )}
    </div>
  );
}

function Simulador({ funis, config }) {
  const [msgs, setMsgs] = useState([]);
  const [contato, setContato] = useState({ estado: 'novo', nome_whatsapp: 'Maria', respostas: {}, tentativas: 0, etapa: 0 });
  const [texto, setTexto] = useState('');
  const fim = useRef(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  function enviar(t) {
    const r = processar({ contato, entrada: { texto: t }, funis, config: { ...config, horario: { ativo: false } } });
    const novo = { ...contato, ...r.mudancas };
    const respostas = r.acoes.map((a) => ({ de: 'robo', texto: a.tipo === 'texto' ? a.texto : `[${a.tipo}] ${a.nome || ''}` }));
    if (r.evento === 'quente') respostas.push({ de: 'sis', texto: '🔥 LEAD QUENTE — você seria avisado aqui' });
    if (r.evento === 'humano') respostas.push({ de: 'sis', texto: '🙋 Passou para humano: ' + (r.motivo || '') });
    if (!r.acoes.length && !r.evento) respostas.push({ de: 'sis', texto: '(robô ficou em silêncio — atendimento está com humano)' });
    setMsgs((m) => [...m, { de: 'cliente', texto: t || '[áudio]' }, ...respostas]);
    setContato(novo);
  }
  return (
    <div className="cartao simulador">
      <div className="linha" style={{ justifyContent: 'space-between' }}><b>🧪 Testar funil (simulação)</b>
        <button className="btn pequeno" onClick={() => { setMsgs([]); setContato({ estado: 'novo', nome_whatsapp: 'Maria', respostas: {}, tentativas: 0, etapa: 0 }); }}><RotateCcw size={14} /> Recomeçar</button></div>
      <div className="ajuda">Finja ser um cliente. Nada é enviado no WhatsApp. Salve antes de testar as alterações.</div>
      <div className="sim-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={'bolha ' + (m.de === 'cliente' ? 'saida' : m.de === 'sis' ? 'sistema' : 'entrada')}>{m.texto}</div>
        ))}
        <div ref={fim} />
      </div>
      <form className="linha" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); enviar(texto); setTexto(''); }}>
        <input type="text" placeholder='Ex: "oi vim pelo anúncio do papel preto"' value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className="btn primario icone"><Send size={16} /></button>
        <button type="button" className="btn icone" title="Simular áudio" onClick={() => enviar('')}><Mic size={16} /></button>
      </form>
    </div>
  );
}

export default function Funis({ conta, contaId, recarregarContas }) {
  const [funis, setFunis] = useState([]);
  const [selId, setSelId] = useState(null);
  const [edicao, setEdicao] = useState(null);
  const [aviso, setAviso] = useState('');
  const [alterado, setAlterado] = useState(false);

  async function carregar(manterId) {
    const { data } = await sb.from('funis').select('*').eq('conta_id', contaId).order('prioridade', { ascending: false }).order('criado_em');
    setFunis(data || []);
    const id = manterId || selId || data?.[0]?.id;
    const f = (data || []).find((x) => x.id === id) || data?.[0];
    setSelId(f?.id || null); setEdicao(f ? structuredClone(f) : null); setAlterado(false);
  }
  useEffect(() => { carregar(); }, [contaId]);

  function selecionar(f) {
    if (alterado && !window.confirm('Existem alterações não salvas. Descartar?')) return;
    setSelId(f.id); setEdicao(structuredClone(f)); setAlterado(false);
  }
  const mudar = (campos) => { setEdicao((e) => ({ ...e, ...campos })); setAlterado(true); };
  const mudarEtapa = (i, campos) => mudar({ etapas: edicao.etapas.map((e, j) => (j === i ? { ...e, ...campos } : e)) });
  const mover = (lista, i, d) => { const n = [...lista]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; };

  async function salvar() {
    const { id, criado_em, ...resto } = edicao;
    const { error } = await sb.from('funis').update({ ...resto, atualizado_em: new Date().toISOString() }).eq('id', id);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    setAviso('Funil salvo ✅'); setTimeout(() => setAviso(''), 3000);
    carregar(id);
  }
  async function novo() {
    const { data, error } = await sb.from('funis').insert({ conta_id: contaId, nome: 'Novo produto', ativo: false, palavras_chave: [], etapas: [ETAPA_NOVA()] }).select().single();
    if (error) return alert(error.message);
    carregar(data.id);
  }
  async function duplicar() {
    const { id, criado_em, atualizado_em, ...resto } = edicao;
    const { data } = await sb.from('funis').insert({ ...resto, nome: resto.nome + ' (cópia)', ativo: false }).select().single();
    carregar(data.id);
  }
  async function excluir() {
    if (!window.confirm(`Excluir o funil "${edicao.nome}"? Isso não apaga as conversas.`)) return;
    await sb.from('funis').delete().eq('id', edicao.id);
    setSelId(null); carregar(null);
  }
  async function criarExemplos() {
    const exemplos = funisExemplo().map((f) => ({ ...f, conta_id: contaId }));
    const { error } = await sb.from('funis').insert(exemplos);
    if (error) return alert(error.message);
    const cfg = mesclarConfig(conta.config);
    if (!cfg.base_conhecimento) {
      await sb.from('contas').update({ config: { ...(conta.config || {}), base_conhecimento: BASE_EXEMPLO } }).eq('id', contaId);
      recarregarContas();
    }
    carregar();
  }

  return (
    <div className="pagina">
      <div className="funis">
        <div className="grade" style={{ gap: 10 }}>
          <button className="btn primario" onClick={novo}><Plus size={16} /> Novo funil / produto</button>
          {funis.map((f) => (
            <div key={f.id} className={'cartao contato' + (f.id === selId ? ' ativo' : '')} style={{ padding: 12, display: 'block' }} onClick={() => selecionar(f)}>
              <div className="linha" style={{ justifyContent: 'space-between' }}><b>{f.nome}</b><span className={'selo ' + (f.ativo ? 'ok' : '')}>{f.ativo ? 'Ativo' : 'Pausado'}</span></div>
              <div className="ajuda">{f.etapas.length} etapas · {f.palavras_chave.slice(0, 4).join(', ')}</div>
            </div>
          ))}
          {!funis.length && (
            <div className="cartao">
              <p>Nenhum funil ainda.</p>
              <button className="btn" onClick={criarExemplos}>✨ Criar funis de exemplo (papel para mechas)</button>
              <p className="ajuda">Cria os funis "Ebony" e "Papel Branco" já com textos prontos, baseados no seu atendimento. Depois é só enviar os áudios, vídeo e banners.</p>
            </div>
          )}
          {funis.length > 0 && <Simulador funis={funis} config={conta.config} />}
        </div>

        {edicao ? (
          <div>
            <div className="cartao" style={{ marginBottom: 14 }}>
              <div className="linha">
                <div style={{ flex: 1, minWidth: 200 }}><label className="rotulo" style={{ marginTop: 0 }}>Nome do produto / campanha</label>
                  <input type="text" value={edicao.nome} onChange={(e) => mudar({ nome: e.target.value })} /></div>
                <div><label className="rotulo" style={{ marginTop: 0 }}>Ativo</label><Interruptor valor={edicao.ativo} onChange={(v) => mudar({ ativo: v })} /></div>
                <div style={{ width: 110 }}><label className="rotulo" style={{ marginTop: 0 }}>Prioridade</label>
                  <input type="number" value={edicao.prioridade} onChange={(e) => mudar({ prioridade: Number(e.target.value) })} /></div>
              </div>
              <label className="rotulo">Palavras-chave que identificam este produto (separe por vírgula)</label>
              <Palavras valor={edicao.palavras_chave} onChange={(v) => mudar({ palavras_chave: v })} placeholder="papel preto, preto, ebony, anuncio 1" />
              <div className="ajuda">Dica: coloque a mensagem pré-preenchida do seu anúncio aqui. Frases com mais palavras valem mais. Se empatar, vence a maior prioridade.</div>
            </div>

            {edicao.etapas.map((et, i) => (
              <div key={et.id || i} className="etapa">
                <div className="etapa-topo">
                  <span className="num">{i + 1}</span>
                  <input type="text" value={et.nome} onChange={(e) => mudarEtapa(i, { nome: e.target.value })} style={{ fontWeight: 600 }} />
                  <button className="btn icone pequeno" onClick={() => mudar({ etapas: mover(edicao.etapas, i, -1) })}><ArrowUp size={14} /></button>
                  <button className="btn icone pequeno" onClick={() => mudar({ etapas: mover(edicao.etapas, i, 1) })}><ArrowDown size={14} /></button>
                  <button className="btn icone pequeno perigo" onClick={() => window.confirm('Remover esta etapa?') && mudar({ etapas: edicao.etapas.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                </div>
                <div className="etapa-corpo">
                  <div className="ajuda" style={{ marginBottom: 8 }}>O robô envia estes itens em ordem, com "digitando..." / "gravando áudio..." antes de cada um:</div>
                  {et.blocos.map((b, k) => (
                    <Bloco key={k} bloco={b} contaId={contaId}
                      mudar={(nb) => mudarEtapa(i, { blocos: et.blocos.map((x, z) => (z === k ? nb : x)) })}
                      remover={() => mudarEtapa(i, { blocos: et.blocos.filter((_, z) => z !== k) })}
                      subir={() => mudarEtapa(i, { blocos: mover(et.blocos, k, -1) })}
                      descer={() => mudarEtapa(i, { blocos: mover(et.blocos, k, 1) })} />
                  ))}
                  <div className="linha">
                    <span className="ajuda">Adicionar:</span>
                    {Object.entries(TIPOS_BLOCO).map(([t, v]) => (
                      <button key={t} className="btn pequeno" onClick={() => mudarEtapa(i, { blocos: [...et.blocos, t === 'texto' ? { tipo: 'texto', variacoes: [''] } : { tipo: t, path: '', nome: '' }] })}>
                        <v.icone size={14} /> {t === 'texto' ? 'Texto' : t === 'audio' ? 'Áudio' : t === 'video' ? 'Vídeo' : t === 'imagem' ? 'Imagem' : 'Arquivo'}
                      </button>
                    ))}
                  </div>
                  <label className="rotulo">Depois de enviar:</label>
                  <select value={et.depois} onChange={(e) => mudarEtapa(i, { depois: e.target.value })}>
                    {Object.entries(DEPOIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {(et.depois === 'sim_nao' || et.depois === 'resposta') && (<>
                    <label className="rotulo">Salvar a resposta como (aparece no resumo do lead)</label>
                    <input type="text" placeholder="ex: pedido, quantidade, dados_entrega" value={et.campo || ''} onChange={(e) => mudarEtapa(i, { campo: e.target.value.replace(/\s+/g, '_') })} />
                    {et.depois === 'sim_nao' && (<>
                      <label className="rotulo">Se não entender, perguntar de novo:</label>
                      <Variacoes valor={et.repergunta} linhas={1} onChange={(v) => mudarEtapa(i, { repergunta: v })} placeholder="Posso te mandar os valores?" />
                    </>)}
                    <label className="rotulo">Se o cliente disser NÃO / vou pensar:</label>
                    <select value={et.se_nao || 'humano'} onChange={(e) => mudarEtapa(i, { se_nao: e.target.value })}>
                      <option value="humano">Responder com educação e colocar na fila "precisa de humano"</option>
                      <option value="encerrar">Responder com educação e encerrar</option>
                    </select>
                  </>)}
                </div>
              </div>
            ))}
            <div className="linha" style={{ position: 'sticky', bottom: 0, background: 'var(--fundo)', padding: '10px 0' }}>
              <button className="btn" onClick={() => mudar({ etapas: [...edicao.etapas, ETAPA_NOVA()] })}><Plus size={16} /> Adicionar etapa</button>
              <button className="btn primario" onClick={salvar} disabled={!alterado}><Save size={16} /> Salvar funil</button>
              <button className="btn" onClick={duplicar}><Copy size={16} /> Duplicar</button>
              <button className="btn perigo" onClick={excluir}><Trash2 size={16} /> Excluir</button>
              {alterado && <span className="selo humano">alterações não salvas</span>}
              {aviso && <span>{aviso}</span>}
            </div>
          </div>
        ) : <div className="vazio">Crie ou selecione um funil.</div>}
      </div>
    </div>
  );
}

const BASE_EXEMPLO = `Empresa: representação e distribuição de cosméticos e ferramentas profissionais em Porto Alegre/RS (Igor), mais de 8 anos no setor da beleza. Distribuidor autorizado no RS, trabalha com o papel desde 2022.
Produto: papel para mechas REUTILIZÁVEL (ecológico, sustentável, profissional). Fábrica especializada só em papel para mechas, presente em mais de 50.000 salões.
Modelos e preços (cada pacote):
- STANDARD: 120 folhas, 53 g na composição (56 g por lâmina), espessura fina, mais flexível/maleável, permite manusear mais próximo da raiz. R$ 53,90.
- CLASSIC: 190 folhas, 90 g / 1 kg na composição, espessura espessa, mais rígido (lembra o acartonado). R$ 84,90.
- EBONY (papel preto): 50 folhas, reutilizável, alta durabilidade, resultado profissional. R$ 44,90.
Diferenciais: tecnologia Air Flow (ondinhas que ajudam a saída da oxidação, cor mais uniforme e respeita a integridade do fio); Grip System (mais aderência entre cabelo e papel, a mecha não escorrega); reutilizável: limpar com pano semiúmido sem encharcar, clientes reutilizam até 3 vezes cada lâmina.
Frete GRÁTIS para todo o Brasil a partir de 4 pacotes (pode misturar modelos). Abaixo disso, o frete é combinado com o vendedor.
Pagamento SOMENTE NA ENTREGA: o cliente recebe e só depois paga.
Descontos e frete de pedidos menores: o vendedor combina na finalização.`;
