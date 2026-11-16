// MOTOR DE REGRAS: decide o que o robô responde. Não fala com o WhatsApp diretamente,
// só recebe o estado do contato + o que o cliente escreveu e devolve as ações.

const { normalizar, tokens, pontuar, intencao, primeiroNome, preencher, sortear } = require('./texto');
const { CONFIG_PADRAO } = require('./padroes');

function mesclarConfig(cfg) {
  const c = { ...CONFIG_PADRAO, ...(cfg || {}) };
  c.horario = { ...CONFIG_PADRAO.horario, ...((cfg || {}).horario || {}) };
  for (const k of Object.keys(CONFIG_PADRAO)) {
    if (Array.isArray(CONFIG_PADRAO[k]) && (!Array.isArray(c[k]) || !c[k].filter(Boolean).length)) c[k] = CONFIG_PADRAO[k];
  }
  return c;
}

function dentroDoHorario(horario, agora = new Date()) {
  if (!horario || !horario.ativo) return true;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(agora);
  const get = (t) => (partes.find((p) => p.type === t) || {}).value;
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dia = dias[get('weekday')];
  const minutos = (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10);
  const [hi, mi] = String(horario.inicio || '00:00').split(':').map(Number);
  const [hf, mf] = String(horario.fim || '23:59').split(':').map(Number);
  if (Array.isArray(horario.dias) && !horario.dias.includes(dia)) return false;
  return minutos >= hi * 60 + mi && minutos < hf * 60 + mf;
}

function dataHoje(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

function extrairCep(texto) {
  const m = String(texto || '').match(/\b(\d{5})[-.\s]?(\d{3})\b/);
  return m ? m[1] + m[2] : null;
}

function escolherFunil(texto, funisAtivos) {
  let melhor = null;
  let melhorPontos = 0;
  for (const f of funisAtivos) {
    const p = pontuar(texto, f.palavras_chave);
    if (p > melhorPontos || (p === melhorPontos && p > 0 && (f.prioridade || 0) > (melhor.prioridade || 0))) {
      melhor = f; melhorPontos = p;
    }
  }
  return melhorPontos > 0 ? melhor : null;
}

function processar({ contato, entrada, funis, config, agora = new Date() }) {
  const cfg = mesclarConfig(config);
  const nome = primeiroNome(contato.nome || contato.nome_whatsapp);
  const texto = String(entrada.texto || '').trim();
  const temTexto = normalizar(texto).length > 0;
  const funisAtivos = (funis || []).filter((f) => f.ativo).sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0));
  const opcoes = funisAtivos.map((f, i) => `${i + 1}. ${f.nome}`).join('\n');

  const acoes = [];
  const mudancas = {};
  const res = { acoes, mudancas, evento: null, motivo: null, naoEntendeu: null };
  const vars = (funil) => ({ nome, produto: funil ? funil.nome : '', opcoes });
  const fala = (lista, funil) => {
    const t = preencher(sortear(lista), vars(funil));
    if (t) acoes.push({ tipo: 'texto', texto: t });
  };
  const respostas = { ...(contato.respostas || {}) };

  const cep = extrairCep(texto);
  if (cep && cep !== contato.cep) mudancas.cep = cep;

  const transferir = (motivo, funil) => {
    fala(cfg.msg_transferir, funil);
    Object.assign(mudancas, { estado: 'humano', aguardando: null, tentativas: 0, motivo_humano: motivo, atendido: false });
    res.evento = 'humano';
    res.motivo = motivo;
  };

  const negativo = (etapa, funil) => {
    fala(cfg.msg_negativo, funil);
    if (etapa && etapa.se_nao === 'encerrar') {
      Object.assign(mudancas, { estado: 'finalizado', aguardando: null, tentativas: 0 });
    } else {
      Object.assign(mudancas, { estado: 'humano', aguardando: null, tentativas: 0, atendido: false,
        motivo_humano: `Cliente recusou/hesitou: "${texto.slice(0, 120)}"` });
      res.evento = 'humano';
      res.motivo = mudancas.motivo_humano;
    }
  };

  // Executa a etapa i e as seguintes (enquanto forem "seguir direto").
  const entrarEtapa = (funil, i) => {
    let idx = i;
    for (let guarda = 0; guarda < 50; guarda++) {
      const etapa = (funil.etapas || [])[idx];
      if (!etapa) {
        Object.assign(mudancas, { estado: 'quente', aguardando: null, etapa: idx, quente_em: agora.toISOString(), atendido: false });
        res.evento = 'quente';
        return;
      }
      for (const b of etapa.blocos || []) {
        if (b.tipo === 'texto') fala(b.variacoes, funil);
        else if (b.path) acoes.push({ tipo: b.tipo, path: b.path, legenda: b.legenda ? preencher(b.legenda, vars(funil)) : undefined, nome: b.nome });
      }
      if (etapa.depois === 'seguir') { idx++; continue; }
      if (etapa.depois === 'quente') {
        Object.assign(mudancas, { estado: 'quente', aguardando: null, etapa: idx, quente_em: agora.toISOString(), atendido: false });
        res.evento = 'quente';
        return;
      }
      Object.assign(mudancas, { estado: 'no_funil', etapa: idx, aguardando: etapa.depois || 'resposta', tentativas: 0 });
      return;
    }
  };

  const naoEntendido = (repergunta, funil, motivoTransfer) => {
    const tent = (contato.tentativas || 0) + 1;
    if (tent >= cfg.max_tentativas) {
      transferir(motivoTransfer, funil);
      return;
    }
    res.naoEntendeu = { repergunta: repergunta ? preencher(repergunta, vars(funil)) : null };
    if (!temTexto) fala(cfg.msg_midia, funil);
    else {
      fala(cfg.msg_nao_entendi, funil);
      if (repergunta) acoes.push({ tipo: 'texto', texto: preencher(repergunta, vars(funil)) });
    }
    mudancas.tentativas = tent;
  };

  // ---------- Fora do horário (modo aviso) ----------
  const dentro = dentroDoHorario(cfg.horario, agora);
  if (!dentro && cfg.horario.fora_modo === 'aviso') {
    if (respostas._aviso_fora !== dataHoje(agora)) {
      fala(cfg.msg_fora_horario);
      respostas._aviso_fora = dataHoje(agora);
      mudancas.respostas = respostas;
    }
    return res;
  }

  let estado = contato.estado || 'novo';
  let funil = contato.funil_id ? funisAtivos.find((f) => f.id === contato.funil_id) : null;
  if (estado === 'no_funil' && !funil) estado = 'novo'; // funil apagado/pausado

  // ---------- Identificar produto ----------
  if (estado === 'novo' || estado === 'finalizado' || estado === 'identificando') {
    let escolhido = escolherFunil(texto, funisAtivos);
    if (!escolhido && estado === 'identificando') {
      const n = parseInt(normalizar(texto), 10);
      if (n >= 1 && n <= funisAtivos.length && tokens(texto).length <= 3) escolhido = funisAtivos[n - 1];
    }
    if (!escolhido && funisAtivos.length === 1) escolhido = funisAtivos[0];

    if (escolhido) {
      Object.assign(mudancas, { funil_id: escolhido.id, respostas: { ...respostas, produto: escolhido.nome }, tentativas: 0, motivo_humano: null });
      entrarEtapa(escolhido, 0);
      return res;
    }
    if (!funisAtivos.length) return res; // nada configurado: fica quieto (o humano responde)

    if (estado === 'identificando') {
      naoEntendido('Qual desses produtos te interessa?\n\n{opcoes}', null, 'Não identificou o produto');
      if (!res.evento) mudancas.estado = 'identificando';
      return res;
    }
    fala(cfg.msg_qual_produto);
    Object.assign(mudancas, { estado: 'identificando', tentativas: 0, aguardando: 'produto', funil_id: null, etapa: 0 });
    return res;
  }

  // ---------- Dentro do funil ----------
  if (estado === 'no_funil') {
    const etapa = (funil.etapas || [])[contato.etapa || 0];
    if (!etapa) { entrarEtapa(funil, contato.etapa || 0); return res; }
    const tipo = contato.aguardando || etapa.depois;
    const repergunta = (etapa.repergunta && etapa.repergunta.length) ? sortear(etapa.repergunta) : null;

    if (!temTexto) {
      naoEntendido(repergunta, funil, 'Cliente enviou áudio/mídia');
      return res;
    }

    if (tipo === 'sim_nao') {
      const int = intencao(texto, cfg.palavras_positivas, cfg.palavras_negativas, 'sim_nao');
      if (int === 'positivo') {
        if (etapa.campo) respostas[etapa.campo] = texto;
        mudancas.respostas = respostas;
        entrarEtapa(funil, (contato.etapa || 0) + 1);
        return res;
      }
      if (int === 'negativo') { mudancas.respostas = respostas; negativo(etapa, funil); return res; }
      naoEntendido(repergunta || 'Posso seguir? É só me responder *sim* ou *não* 😊', funil, `Não entendeu a resposta na etapa "${etapa.nome}"`);
      return res;
    }

    // resposta livre
    const n = normalizar(texto);
    const negUnica = (cfg.palavras_negativas || []).some((p) => normalizar(p) === n);
    const int = intencao(texto, [], cfg.palavras_negativas, 'resposta');
    if (negUnica || int === 'negativo') { negativo(etapa, funil); return res; }
    const campo = etapa.campo || `etapa_${(contato.etapa || 0) + 1}`;
    respostas[campo] = respostas[campo] && contato.aguardando === 'resposta_cont' ? `${respostas[campo]}\n${texto}` : texto;
    mudancas.respostas = respostas;
    entrarEtapa(funil, (contato.etapa || 0) + 1);
    return res;
  }

  return res; // quente / humano: robô fica quieto
}

module.exports = { processar, mesclarConfig, dentroDoHorario, extrairCep, escolherFunil, dataHoje };
