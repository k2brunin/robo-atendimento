// Testa o robô de ponta a ponta com WhatsApp e banco FALSOS (nada é enviado de verdade).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
process.env.ROBO_DADOS = require('fs').mkdtempSync(path.join(os.tmpdir(), 'robo-teste-'));

const falso = require('../apoio-testes/banco-falso');
require.cache[require.resolve('../src/banco')] = { exports: { sb: falso.sb } };
const { Sessao } = require('../src/sessao');
const { funisExemplo } = require('../../compartilhado/padroes.mjs');

const enviados = [];
let proximoId = 1;
function clienteFalso(sessao) {
  const chat = { sendStateTyping: async () => {}, sendStateRecording: async () => {}, clearState: async () => {} };
  return {
    getChatById: async () => chat,
    sendSeen: async () => {},
    getContactById: async () => ({ pushname: 'Ana' }),
    sendMessage: async (para, conteudo, op) => {
      const id = 'BOT' + proximoId++;
      enviados.push({ para, tipo: typeof conteudo === 'string' ? 'texto' : conteudo.mimetype, texto: typeof conteudo === 'string' ? conteudo : '', op });
      // o WhatsApp dispara "message_create" também para as mensagens do próprio robô
      setTimeout(() => sessao.aoCriarMinha({ fromMe: true, to: para, id: { _serialized: id }, type: 'chat', body: '' }), 50);
      return { id: { _serialized: id } };
    },
  };
}
function msgCliente(de, texto, tipo = 'chat') {
  return { fromMe: false, from: de, type: tipo, body: texto, hasMedia: false, id: { _serialized: 'C' + proximoId++ },
    getContact: async () => ({ pushname: 'Ana Paula', number: de.split('@')[0] }) };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('robô completo: buffer, funil, lead quente e pausa humana', { timeout: 120000 }, async () => {
  const conta = { id: 'conta1', nome: 'Teste', robo_ativo: true, ia_ativa: false,
    config: { buffer_segundos: 1, horario: { ativo: false } } };
  falso.tabelas.contas.push(conta);
  funisExemplo().forEach((f, i) => {
    falso.tabelas.funis.push({ ...f, id: 'f' + i, conta_id: 'conta1' });
  });
  // coloca um áudio de verdade no funil Ebony
  falso.tabelas.funis[0].etapas[0].blocos[1].path = 'conta1/funis/audio.ogg';
  falso.arquivos['conta1/funis/audio.ogg'] = Buffer.from('OggS-falso');

  const s = new Sessao({ ...conta });
  s.client = clienteFalso(s);
  s.pronto = true;
  const ANA = '5553999990000@c.us';

  // 3 mensagens picadas => 1 resposta só
  await s.aoReceber(msgCliente(ANA, 'Oi'));
  await s.aoReceber(msgCliente(ANA, 'tudo bem?'));
  await s.aoReceber(msgCliente(ANA, 'vi o anuncio do papel preto'));
  await esperar(1300);
  while (s.processando.size) await esperar(300);
  const c1 = falso.tabelas.contatos[0];
  assert.equal(c1.funil_id, 'f0', 'identificou Ebony');
  assert.equal(c1.telefone, '5553999990000');
  assert.ok(enviados[0].texto.includes('Ana'), 'usa o primeiro nome');
  assert.ok(enviados.some((e) => e.op && e.op.sendAudioAsVoice), 'mandou áudio como gravado');
  assert.ok(enviados.at(-1).texto.match(/valores/i), 'perguntou se pode mandar valores');
  const qtdBoasVindas = enviados.length;

  await s.aoReceber(msgCliente(ANA, 'pode sim'));
  await esperar(1300); while (s.processando.size) await esperar(300);
  assert.ok(enviados.length > qtdBoasVindas, 'mandou valores');
  assert.equal(falso.tabelas.contatos[0].etapa, 1);

  await s.aoReceber(msgCliente(ANA, 'quero 4 do classic'));
  await esperar(1300); while (s.processando.size) await esperar(300);
  await s.aoReceber(msgCliente(ANA, 'Ana Paula Souza, cep 96010-000, rua A 123'));
  await esperar(1300); while (s.processando.size) await esperar(300);
  const c2 = falso.tabelas.contatos[0];
  assert.equal(c2.estado, 'quente', 'virou lead quente');
  assert.equal(c2.respostas.pedido, 'quero 4 do classic');
  assert.equal(c2.cep, '96010000');
  assert.ok(!c2.robo_pausado, 'mensagens do robô NÃO pausam o robô');

  // Robô fica quieto com lead quente
  const antes = enviados.length;
  await s.aoReceber(msgCliente(ANA, 'qual o pix?'));
  await esperar(1300); while (s.processando.size) await esperar(300);
  assert.equal(enviados.length, antes, 'não responde lead quente');

  // Outro cliente; EU respondo pelo celular => robô pausa
  const BIA = '5551888880000@c.us';
  await s.aoReceber(msgCliente(BIA, 'oi'));
  await esperar(200);
  await s.aoCriarMinha({ fromMe: true, to: BIA, id: { _serialized: 'EU1' }, type: 'chat', body: 'Oi Bia, sou o Igor!' });
  await esperar(1500); while (s.processando.size) await esperar(300);
  const bia = falso.tabelas.contatos.find((c) => c.wa_id === BIA);
  assert.equal(bia.robo_pausado, true, 'pausou ao detectar resposta humana');
  assert.ok(!enviados.some((e) => e.para === BIA), 'robô não respondeu a Bia');
  assert.ok(falso.tabelas.mensagens.some((m) => m.autor === 'humano' && m.texto === 'Oi Bia, sou o Igor!'));

  // Mensagem enviada pelo painel
  await s.enviarDoPainel({ id: 'p1', texto: 'Mensagem do painel', midia_path: null, tipo: 'texto' }, bia);
  assert.ok(enviados.some((e) => e.para === BIA && e.texto === 'Mensagem do painel'));
  // grupos são ignorados
  await s.aoReceber(msgCliente('123@g.us', 'oi grupo'));
  assert.ok(!falso.tabelas.contatos.some((c) => c.wa_id === '123@g.us'));
});
