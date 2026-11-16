import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { sb } from '../supabase';
import { mesclarConfig } from '../../../compartilhado/motor.mjs';
import { Variacoes, Interruptor } from '../componentes.jsx';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MENSAGENS = [
  ['msg_qual_produto', 'Quando não sabe qual produto o cliente quer', 'Use {opcoes} para listar os produtos (funis ativos).'],
  ['msg_nao_entendi', 'Quando não entende a resposta', 'Depois disso o robô repete a pergunta da etapa.'],
  ['msg_midia', 'Quando o cliente manda áudio, foto ou figurinha', ''],
  ['msg_transferir', 'Ao passar para atendimento humano', ''],
  ['msg_negativo', 'Quando o cliente diz que não quer / vai pensar', ''],
  ['msg_fora_horario', 'Fora do horário (se escolher "só avisar")', ''],
];

export default function Configuracoes({ conta, recarregarContas }) {
  const [cfg, setCfg] = useState(() => mesclarConfig(conta.config));
  const [nome, setNome] = useState(conta.nome);
  const [salvo, setSalvo] = useState('');
  const [freteTexto, setFreteTexto] = useState('');

  useEffect(() => {
    const c = mesclarConfig(conta.config);
    setCfg(c); setNome(conta.nome);
    setFreteTexto(Object.entries(c.frete_por_uf || {}).map(([uf, v]) => `${uf}=${v}`).join('\n'));
  }, [conta.id]);

  const mudar = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const mudarHorario = (k, v) => setCfg((c) => ({ ...c, horario: { ...c.horario, [k]: v } }));

  async function salvar() {
    const frete = {};
    for (const linha of freteTexto.split('\n')) {
      const m = linha.trim().toUpperCase().match(/^([A-Z]{2})\s*[=:]\s*([\d.,]+)/);
      if (m) frete[m[1]] = Number(m[2].replace(',', '.'));
    }
    const novo = { ...cfg, frete_por_uf: frete };
    const { error } = await sb.from('contas').update({ config: novo, nome: nome.trim() || conta.nome }).eq('id', conta.id);
    setSalvo(error ? 'Erro: ' + error.message : 'Configurações salvas! ✅');
    if (!error) recarregarContas();
    setTimeout(() => setSalvo(''), 4000);
  }

  return (
    <div className="pagina">
      <div className="grade" style={{ maxWidth: 820 }}>
        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Geral</h3>
          <label className="rotulo">Nome da conta / loja</label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
          <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            <div><label className="rotulo">Esperar mensagens picadas (segundos)</label>
              <input type="number" min="2" max="30" value={cfg.buffer_segundos} onChange={(e) => mudar('buffer_segundos', Number(e.target.value))} />
              <div className="ajuda">Junta "oi" + "tudo bem?" + "vi o anúncio" numa resposta só.</div></div>
            <div><label className="rotulo">Tentativas antes de chamar humano</label>
              <input type="number" min="1" max="5" value={cfg.max_tentativas} onChange={(e) => mudar('max_tentativas', Number(e.target.value))} /></div>
            <div><label className="rotulo">Recomeçar robô após (horas parado)</label>
              <input type="number" min="0" max="720" value={cfg.retomar_horas} onChange={(e) => mudar('retomar_horas', Number(e.target.value))} />
              <div className="ajuda">Se o cliente sumir e voltar depois disso, o robô atende de novo. 0 = nunca.</div></div>
          </div>
        </div>

        <div className="cartao">
          <div className="linha" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Horário de atendimento</h3>
            <Interruptor valor={cfg.horario.ativo} onChange={(v) => mudarHorario('ativo', v)} /></div>
          {cfg.horario.ativo && (<>
            <div className="linha" style={{ marginTop: 10 }}>
              <span>Das</span><input type="time" style={{ width: 120 }} value={cfg.horario.inicio} onChange={(e) => mudarHorario('inicio', e.target.value)} />
              <span>às</span><input type="time" style={{ width: 120 }} value={cfg.horario.fim} onChange={(e) => mudarHorario('fim', e.target.value)} />
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              {DIAS.map((d, i) => (
                <button key={i} className={'chip' + (cfg.horario.dias.includes(i) ? ' ativo' : '')}
                  onClick={() => mudarHorario('dias', cfg.horario.dias.includes(i) ? cfg.horario.dias.filter((x) => x !== i) : [...cfg.horario.dias, i].sort())}>{d}</button>
              ))}
            </div>
            <label className="rotulo">Fora do horário o robô deve:</label>
            <select value={cfg.horario.fora_modo} onChange={(e) => mudarHorario('fora_modo', e.target.value)}>
              <option value="funil">Atender normalmente (recomendado: o lead fica quente esperando você)</option>
              <option value="aviso">Só avisar o horário de atendimento (1 vez por dia)</option>
            </select>
          </>)}
        </div>

        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Mensagens automáticas</h3>
          {MENSAGENS.map(([k, titulo, ajuda]) => (
            <div key={k}><label className="rotulo">{titulo}</label>{ajuda && <div className="ajuda" style={{ marginBottom: 6 }}>{ajuda}</div>}
              <Variacoes valor={cfg[k]} onChange={(v) => mudar(k, v)} /></div>
          ))}
        </div>

        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Palavras que o robô entende</h3>
          <label className="rotulo">Respostas POSITIVAS (sim, quero, pode mandar...)</label>
          <textarea rows={3} value={cfg.palavras_positivas.join(', ')} onChange={(e) => mudar('palavras_positivas', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          <label className="rotulo">Respostas NEGATIVAS (não, vou pensar, caro...)</label>
          <textarea rows={3} value={cfg.palavras_negativas.join(', ')} onChange={(e) => mudar('palavras_negativas', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          <div className="ajuda">Separe por vírgula. Acentos, maiúsculas e pequenos erros de digitação são ignorados.</div>
        </div>

        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Frete estimado por estado (só aparece para você)</h3>
          <textarea rows={4} placeholder={'RS=25\nSC=30\nSP=35'} value={freteTexto} onChange={(e) => setFreteTexto(e.target.value)} />
          <div className="ajuda">Um estado por linha. Quando o cliente manda o CEP, o painel mostra cidade/UF (via ViaCEP, grátis) e o frete estimado.</div>
        </div>

        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Informações para a IA (opcional)</h3>
          <textarea rows={8} value={cfg.base_conhecimento} onChange={(e) => mudar('base_conhecimento', e.target.value)}
            placeholder="Escreva tudo que um vendedor precisa saber: produtos, preços, diferenças, frete, pagamento, prazos..." />
          <div className="ajuda">Só é usado se o administrador ativar a IA para esta conta.</div>
        </div>

        <div className="linha" style={{ position: 'sticky', bottom: 0, background: 'var(--fundo)', padding: '10px 0' }}>
          <button className="btn primario" onClick={salvar}><Save size={16} /> Salvar configurações</button>
          {salvo && <span>{salvo}</span>}
        </div>
      </div>
    </div>
  );
}
