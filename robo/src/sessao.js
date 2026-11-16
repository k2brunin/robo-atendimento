// Uma "sessão" = um número de WhatsApp conectado (uma conta do painel).
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { sb } = require('./banco');
const { pastas, log } = require('./dados');
const { BUCKET } = require('./ambiente');
const { processar, mesclarConfig } = require('../../compartilhado/motor.mjs');
const { gerarResposta } = require('./ia');
const { acharNavegador } = require('./navegador');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = (min, max) => Math.round(min + Math.random() * (max - min));

// Limite global de envios simultâneos (todas as contas) para parecer humano.
let enviosAtivos = 0;
async function vez() { while (enviosAtivos >= 3) await esperar(300); enviosAtivos++; }
function liberar() { enviosAtivos = Math.max(0, enviosAtivos - 1); }

const TIPOS_ACEITOS = {
  chat: 'texto', image: 'imagem', video: 'video', audio: 'audio', ptt: 'audio', document: 'documento',
  sticker: 'figurinha', location: 'localizacao', vcard: 'contato', multi_vcard: 'contato',
  buttons_response: 'texto', list_response: 'texto', interactive: 'texto', poll_creation: 'outro',
};
const EXTENSOES = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'image/jpeg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };

function chatIgnorado(id) {
  return !id || id.endsWith('@g.us') || id === 'status@broadcast' || id.endsWith('@broadcast') || id.endsWith('@newsletter');
}

class Sessao {
  constructor(conta) {
    this.conta = conta;
    this.id = conta.id;
    this.client = null;
    this.parando = false;
    this.pronto = false;
    this.buffers = new Map();     // chatId -> { textos, midias, timer, ultimaAntes }
    this.processando = new Set(); // chatIds em processamento
    this.enviandoBot = new Map(); // chatId -> contador de envios do robô/painel em andamento
    this.idsBot = new Set();      // ids de mensagens enviadas pelo robô/painel
    this.reinicioTimer = null;
  }

  get pastaSessao() { return path.join(pastas.sessoes, `session-${this.id}`); }
  temSessaoSalva() { return fs.existsSync(this.pastaSessao); }
  get config() { return mesclarConfig(this.conta.config); }

  async status(campos) {
    Object.assign(this.conta, campos);
    const { error } = await sb.from('contas').update(campos).eq('id', this.id);
    if (error) log('Erro ao salvar status:', error.message);
  }

  // ---------------- CONEXÃO ----------------
  async iniciar() {
    if (this.client) return;
    this.parando = false;
    clearTimeout(this.reinicioTimer);
    log(`[${this.conta.nome}] iniciando WhatsApp...`);
    await this.status({ whatsapp_status: 'iniciando', whatsapp_qr: null });

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: this.id, dataPath: pastas.sessoes }),
      puppeteer: {
        headless: true,
        executablePath: acharNavegador(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
      },
      webVersionCache: { type: 'local', path: path.join(pastas.base, 'cache-whatsapp-web') },
      qrMaxRetries: 8,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 10000,
    });
    this.client = client;

    client.on('qr', async (qr) => {
      try {
        const img = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        await this.status({ whatsapp_status: 'aguardando_qr', whatsapp_qr: img });
        log(`[${this.conta.nome}] QR Code gerado - escaneie pelo painel.`);
      } catch (e) { log('Erro QR:', e); }
    });
    client.on('authenticated', () => log(`[${this.conta.nome}] autenticado.`));
    client.on('auth_failure', async (m) => {
      log(`[${this.conta.nome}] falha de autenticação:`, m);
      await this.status({ whatsapp_status: 'erro', whatsapp_qr: null });
    });
    client.on('ready', async () => {
      this.pronto = true;
      const info = client.info || {};
      log(`[${this.conta.nome}] CONECTADO como ${info.pushname || ''} (${info.wid ? info.wid.user : '?'})`);
      await this.status({ whatsapp_status: 'conectado', whatsapp_qr: null,
        whatsapp_numero: info.wid ? info.wid.user : null, whatsapp_nome: info.pushname || null });
    });
    client.on('disconnected', async (motivo) => {
      log(`[${this.conta.nome}] desconectado:`, motivo);
      this.pronto = false;
      const c = this.client; this.client = null;
      try { await c.destroy(); } catch (_) { /* ignora */ }
      if (motivo === 'LOGOUT' || this.parando) {
        await this.status({ whatsapp_status: 'desconectado', whatsapp_qr: null });
        if (motivo === 'LOGOUT') this.apagarSessao();
        return;
      }
      await this.status({ whatsapp_status: 'iniciando', whatsapp_qr: null });
      this.reinicioTimer = setTimeout(() => this.iniciar().catch((e) => log(e)), 15000);
    });
    client.on('message', (msg) => this.aoReceber(msg).catch((e) => log(`[${this.conta.nome}] erro ao receber:`, e)));
    client.on('message_create', (msg) => this.aoCriarMinha(msg).catch((e) => log(`[${this.conta.nome}] erro msg própria:`, e)));

    try {
      await client.initialize();
    } catch (e) {
      log(`[${this.conta.nome}] erro ao iniciar:`, e.message);
      this.client = null;
      try { await client.destroy(); } catch (_) { /* ignora */ }
      if (this.parando) return;
      await this.status({ whatsapp_status: 'erro', whatsapp_qr: null });
      this.reinicioTimer = setTimeout(() => this.iniciar().catch((er) => log(er)), 30000);
    }
  }

  async parar({ sair = false } = {}) {
    this.parando = true;
    this.pronto = false;
    clearTimeout(this.reinicioTimer);
    const c = this.client; this.client = null;
    if (c) {
      if (sair) { try { await c.logout(); } catch (_) { /* ignora */ } }
      try { await c.destroy(); } catch (_) { /* ignora */ }
    }
    if (sair) this.apagarSessao();
    await this.status({ whatsapp_status: 'desconectado', whatsapp_qr: null });
  }

  apagarSessao() {
    try { fs.rmSync(this.pastaSessao, { recursive: true, force: true }); } catch (e) { log('Não apagou sessão:', e.message); }
  }

  // ---------------- CONTATOS ----------------
  async telefoneDe(chatId, contato) {
    if (chatId.endsWith('@c.us')) return chatId.split('@')[0];
    try {
      if (this.client.getContactLidAndPhone) {
        const r = await this.client.getContactLidAndPhone([chatId]);
        const pn = r && r[0] && r[0].pn;
        if (pn) return String(pn).split('@')[0];
      }
    } catch (_) { /* ignora */ }
    if (contato && contato.number && !chatId.endsWith('@lid')) return contato.number;
    return null;
  }

  async obterContato(chatId, waContato) {
    const { data: existente } = await sb.from('contatos').select('*').eq('conta_id', this.id).eq('wa_id', chatId).maybeSingle();
    const nomeWa = waContato ? (waContato.pushname || waContato.name || waContato.shortName || null) : null;
    if (existente) {
      const mud = {};
      if (nomeWa && nomeWa !== existente.nome_whatsapp) mud.nome_whatsapp = nomeWa;
      if (!existente.telefone) { const tel = await this.telefoneDe(chatId, waContato); if (tel) mud.telefone = tel; }
      if (Object.keys(mud).length) { await sb.from('contatos').update(mud).eq('id', existente.id); Object.assign(existente, mud); }
      return existente;
    }
    const telefone = await this.telefoneDe(chatId, waContato);
    const { data, error } = await sb.from('contatos')
      .upsert({ conta_id: this.id, wa_id: chatId, telefone, nome_whatsapp: nomeWa }, { onConflict: 'conta_id,wa_id' })
      .select().single();
    if (error) throw error;
    return data;
  }

  async salvarMidiaRecebida(msg, mensagemId, contatoId) {
    try {
      if (!msg.hasMedia) return;
      if (msg._data && msg._data.size && msg._data.size > 15 * 1024 * 1024) return;
      const media = await msg.downloadMedia();
      if (!media || !media.data) return;
      const mime = (media.mimetype || '').split(';')[0];
      const ext = EXTENSOES[mime] || (mime.split('/')[1] || 'bin');
      const caminho = `${this.id}/recebidas/${contatoId}/${mensagemId}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(caminho, Buffer.from(media.data, 'base64'), { contentType: mime, upsert: true });
      if (error) { log('Upload mídia recebida falhou:', error.message); return; }
      await sb.from('mensagens').update({ midia_path: caminho }).eq('id', mensagemId);
    } catch (e) { log('Não baixou mídia:', e.message); }
  }

  // ---------------- RECEBER ----------------
  async aoReceber(msg) {
    if (msg.fromMe || chatIgnorado(msg.from) || msg.isStatus || msg.broadcast) return;
    const tipo = TIPOS_ACEITOS[msg.type];
    if (!tipo) return;

    const waContato = await msg.getContact().catch(() => null);
    const contato = await this.obterContato(msg.from, waContato);
    const texto = ['texto'].includes(tipo) ? (msg.body || '') : (msg.body && tipo !== 'figurinha' && tipo !== 'audio' ? msg.body : '');

    const { data: salva, error } = await sb.from('mensagens').insert({
      conta_id: this.id, contato_id: contato.id, direcao: 'entrada', autor: 'cliente',
      tipo, texto: texto || null, wa_msg_id: msg.id._serialized,
    }).select('id').single();
    if (error) throw error;
    if (msg.hasMedia) this.salvarMidiaRecebida(msg, salva.id, contato.id);

    // Agrupa mensagens picadas (espera X segundos depois da última)
    let b = this.buffers.get(msg.from);
    if (!b) {
      b = { textos: [], midias: [], timer: null, inicio: Date.now(), ultimaAntes: contato.ultima_msg_em };
      this.buffers.set(msg.from, b);
    }
    if (texto) b.textos.push(texto);
    else b.midias.push(tipo);
    clearTimeout(b.timer);
    const espera = Math.max(1, Number(this.config.buffer_segundos) || 6) * 1000;
    const restanteMax = Math.max(500, 45000 - (Date.now() - b.inicio)); // nunca espera mais que 45s no total
    b.timer = setTimeout(() => this.processarBuffer(msg.from).catch((e) => log(`[${this.conta.nome}] erro no funil:`, e)),
      Math.min(espera, restanteMax));
  }

  async processarBuffer(chatId) {
    if (this.processando.has(chatId)) { // ainda respondendo a mensagem anterior: tenta de novo daqui a pouco
      const b = this.buffers.get(chatId);
      if (b) b.timer = setTimeout(() => this.processarBuffer(chatId).catch((e) => log(e)), 2000);
      return;
    }
    const b = this.buffers.get(chatId);
    this.buffers.delete(chatId);
    if (!b) return;
    this.processando.add(chatId);
    try {
      await this.rodarFunil(chatId, b);
    } finally {
      this.processando.delete(chatId);
    }
  }

  async rodarFunil(chatId, b) {
    if (!this.conta.robo_ativo || !this.pronto) return;
    if (this.pausadoAgora && this.pausadoAgora.has(chatId)) return; // você acabou de responder
    const { data: contato } = await sb.from('contatos').select('*').eq('conta_id', this.id).eq('wa_id', chatId).single();
    if (!contato) return;
    const cfg = this.config;

    // Conversa parada há muito tempo + cliente voltou => robô recomeça o atendimento
    const horas = Number(cfg.retomar_horas) || 0;
    const parado = b.ultimaAntes ? (Date.now() - new Date(b.ultimaAntes).getTime()) / 3600000 : 0;
    if (horas > 0 && parado >= horas && (contato.robo_pausado || ['humano', 'quente', 'finalizado'].includes(contato.estado))) {
      const reset = { robo_pausado: false, pausado_motivo: null, estado: 'novo', funil_id: null, etapa: 0,
        aguardando: null, tentativas: 0, atendido: false, motivo_humano: null };
      await sb.from('contatos').update(reset).eq('id', contato.id);
      Object.assign(contato, reset);
      log(`[${this.conta.nome}] ${contato.nome_whatsapp || chatId} voltou após ${Math.round(parado)}h - robô recomeçou.`);
    }

    if (contato.robo_pausado || ['humano', 'quente'].includes(contato.estado)) return;

    const { data: funis } = await sb.from('funis').select('*').eq('conta_id', this.id);
    const entrada = { texto: b.textos.join('\n'), midias: b.midias };
    const r = processar({ contato, entrada, funis: funis || [], config: cfg });
    let acoes = r.acoes;
    let mudancas = { ...r.mudancas };

    // ---- IA opcional ----
    if (this.conta.ia_ativa && (r.naoEntendeu || r.evento === 'humano') && entrada.texto) {
      const { data: seg } = await sb.from('segredos_conta').select('gemini_chave').eq('conta_id', this.id).maybeSingle();
      const chave = seg && seg.gemini_chave;
      if (chave) {
        const { data: hist } = await sb.from('mensagens').select('direcao,texto,tipo').eq('contato_id', contato.id)
          .order('criado_em', { ascending: false }).limit(16);
        const historico = (hist || []).reverse();
        const funil = (funis || []).find((f) => f.id === (mudancas.funil_id || contato.funil_id));
        const modo = this.conta.ia_modo;
        const resposta = await gerarResposta({ chave, modelo: cfg.ia_modelo, base: cfg.base_conhecimento,
          produto: funil && funil.nome, historico, modo });
        if (resposta && modo === 'responder' && r.naoEntendeu) {
          acoes = [{ tipo: 'texto', texto: resposta }];
          if (r.naoEntendeu.repergunta) acoes.push({ tipo: 'texto', texto: r.naoEntendeu.repergunta });
          mudancas = {}; // não conta como "não entendi"
        } else if (resposta) {
          mudancas.sugestao_ia = resposta;
        }
      }
    }

    if (mudancas.cep) Object.assign(mudancas, await buscarCep(mudancas.cep));
    if (Object.keys(mudancas).length) {
      const { error } = await sb.from('contatos').update(mudancas).eq('id', contato.id);
      if (error) log('Erro ao atualizar contato:', error.message);
    }
    if (r.evento === 'quente') log(`[${this.conta.nome}] 🔥 LEAD QUENTE: ${contato.nome_whatsapp || contato.telefone}`);
    if (r.evento === 'humano') log(`[${this.conta.nome}] 🙋 Passou para humano: ${contato.nome_whatsapp || contato.telefone} (${r.motivo})`);

    if (acoes.length) {
      try { await this.client.sendSeen(chatId); } catch (_) { /* ignora */ }
      await esperar(aleatorio(800, 2000));
      await this.enviarAcoes(chatId, contato.id, acoes, 'robo');
    }
  }

  // ---------------- ENVIAR ----------------
  async midiaDoStorage(caminho) {
    const local = path.join(pastas.cache, caminho.replace(/[\\/:*?"<>|]/g, '_'));
    let dados;
    if (fs.existsSync(local)) dados = fs.readFileSync(local);
    else {
      const { data, error } = await sb.storage.from(BUCKET).download(caminho);
      if (error) throw new Error('Mídia não encontrada no painel: ' + caminho);
      dados = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(local, dados);
    }
    const ext = path.extname(caminho).slice(1).toLowerCase();
    const mime = { ogg: 'audio/ogg; codecs=opus', opus: 'audio/ogg; codecs=opus', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
      mp4: 'video/mp4', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      gif: 'image/gif', pdf: 'application/pdf' }[ext] || 'application/octet-stream';
    return new MessageMedia(mime, dados.toString('base64'), path.basename(caminho));
  }

  marcarEnvio(chatId, delta) {
    const v = (this.enviandoBot.get(chatId) || 0) + delta;
    if (v <= 0) this.enviandoBot.delete(chatId); else this.enviandoBot.set(chatId, v);
  }

  async enviarAcoes(chatId, contatoId, acoes, autor) {
    if (!this.client) return;
    this.marcarEnvio(chatId, 1);
    await vez();
    try {
      const chat = await this.client.getChatById(chatId);
      for (const [i, a] of acoes.entries()) {
        if (!this.client || !this.pronto) break;
        if (i > 0) await esperar(aleatorio(900, 2200));
        try {
          let enviada;
          if (a.tipo === 'texto') {
            if (autor === 'robo') {
              await chat.sendStateTyping();
              await esperar(Math.min(5000, Math.max(2000, a.texto.length * 45)) + aleatorio(0, 600));
            }
            enviada = await this.client.sendMessage(chatId, a.texto);
          } else {
            const media = await this.midiaDoStorage(a.path);
            if (autor === 'robo') {
              if (a.tipo === 'audio') { await chat.sendStateRecording(); await esperar(aleatorio(3000, 6000)); }
              else { await chat.sendStateTyping(); await esperar(aleatorio(1200, 2500)); }
            }
            const opcoes = {};
            if (a.tipo === 'audio') opcoes.sendAudioAsVoice = true;
            if (a.tipo === 'documento') opcoes.sendMediaAsDocument = true;
            if (a.legenda && a.tipo !== 'audio') opcoes.caption = a.legenda;
            enviada = await this.client.sendMessage(chatId, media, opcoes);
          }
          try { await chat.clearState(); } catch (_) { /* ignora */ }
          if (enviada && enviada.id) this.idsBot.add(enviada.id._serialized);
          if (autor === 'robo') {
            await sb.from('mensagens').insert({
              conta_id: this.id, contato_id: contatoId, direcao: 'saida', autor: 'robo', tipo: a.tipo,
              texto: a.tipo === 'texto' ? a.texto : (a.legenda || a.nome || null), midia_path: a.path || null,
              wa_msg_id: enviada && enviada.id ? enviada.id._serialized : null,
            });
          }
          if (a.registroId) {
            await sb.from('mensagens').update({ status: 'ok', erro: null, wa_msg_id: enviada && enviada.id ? enviada.id._serialized : null })
              .eq('id', a.registroId);
          }
        } catch (e) {
          log(`[${this.conta.nome}] falha ao enviar ${a.tipo}:`, e.message);
          if (a.registroId) await sb.from('mensagens').update({ status: 'erro', erro: e.message.slice(0, 300) }).eq('id', a.registroId);
          else await sb.from('mensagens').insert({ conta_id: this.id, contato_id: contatoId, direcao: 'saida', autor: 'sistema',
            tipo: 'texto', status: 'erro', texto: `Falha ao enviar ${a.nome || a.tipo}`, erro: e.message.slice(0, 300) });
        }
      }
    } finally {
      liberar();
      if (this.idsBot.size > 5000) this.idsBot = new Set([...this.idsBot].slice(-2000));
      setTimeout(() => this.marcarEnvio(chatId, -1), 2500); // margem para o evento "message_create" chegar
    }
  }

  // Mensagem escrita no painel (fila "pendente")
  async enviarDoPainel(registro, contato) {
    if (!this.pronto) return;
    await sb.from('mensagens').update({ status: 'enviando' }).eq('id', registro.id);
    const acao = registro.midia_path
      ? { tipo: registro.tipo, path: registro.midia_path, legenda: registro.texto || undefined, registroId: registro.id }
      : { tipo: 'texto', texto: registro.texto || '', registroId: registro.id };
    // Atendente assumiu: pausa o robô para este contato
    const buf = this.buffers.get(contato.wa_id);
    if (buf) { clearTimeout(buf.timer); this.buffers.delete(contato.wa_id); }
    await sb.from('contatos').update({ robo_pausado: true, pausado_motivo: 'Respondido pelo painel', pausado_em: new Date().toISOString(), nao_lidas: 0 })
      .eq('id', contato.id);
    await this.enviarAcoes(contato.wa_id, contato.id, [acao], 'painel');
  }

  // Mensagem enviada por MIM (celular / WhatsApp Web) => pausa o robô para esse contato
  async aoCriarMinha(msg) {
    if (!msg.fromMe) return;
    const chatId = msg.to;
    if (chatIgnorado(chatId)) return;
    // Se o robô não está enviando nada para esse cliente, a mensagem com certeza é sua:
    // cancela na hora a resposta automática que estava esperando.
    if (!this.enviandoBot.has(chatId) && !this.processando.has(chatId)) {
      const b0 = this.buffers.get(chatId);
      if (b0) { clearTimeout(b0.timer); this.buffers.delete(chatId); }
      this.pausadoAgora = this.pausadoAgora || new Set();
      this.pausadoAgora.add(chatId);
      setTimeout(() => this.pausadoAgora.delete(chatId), 5000);
    }
    await esperar(1200); // dá tempo do robô registrar o id da própria mensagem
    const id = msg.id._serialized;
    if (this.idsBot.has(id) || this.enviandoBot.has(chatId)) return;
    const tipo = TIPOS_ACEITOS[msg.type];
    if (!tipo) return;
    const { data: ja } = await sb.from('mensagens').select('id').eq('conta_id', this.id).eq('wa_msg_id', id).maybeSingle();
    if (ja) return;
    const waContato = await this.client.getContactById(chatId).catch(() => null);
    const contato = await this.obterContato(chatId, waContato);
    await sb.from('mensagens').insert({ conta_id: this.id, contato_id: contato.id, direcao: 'saida', autor: 'humano', tipo,
      texto: msg.body || null, wa_msg_id: id });
    const buf = this.buffers.get(chatId);
    if (buf) { clearTimeout(buf.timer); this.buffers.delete(chatId); }
    if (!contato.robo_pausado) {
      await sb.from('contatos').update({ robo_pausado: true, pausado_motivo: 'Você respondeu pelo WhatsApp', pausado_em: new Date().toISOString(), nao_lidas: 0 })
        .eq('id', contato.id);
      log(`[${this.conta.nome}] Você respondeu ${contato.nome_whatsapp || chatId} - robô pausado para esse contato.`);
    }
  }
}

async function buscarCep(cep) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (j && !j.erro) return { cidade: j.localidade || null, uf: j.uf || null };
  } catch (_) { /* ignora */ }
  return {};
}

module.exports = { Sessao };
