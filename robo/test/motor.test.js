const test = require('node:test');
const assert = require('node:assert');
const { processar } = require('../../compartilhado/motor.mjs');
const { funisExemplo } = require('../../compartilhado/padroes.mjs');
const { intencao, pontuar } = require('../../compartilhado/texto.mjs');
const { CONFIG_PADRAO } = require('../../compartilhado/padroes.mjs');

const funis = funisExemplo().map((f, i) => ({ ...f, id: 'f' + i }));
// preenche caminhos fictícios das mídias
for (const f of funis) for (const e of f.etapas) for (const b of e.blocos) if (b.tipo !== 'texto') b.path = 'x/' + b.nome;
const cfg = { horario: { ativo: false } };
const base = { estado: 'novo', nome_whatsapp: 'MARIA silva', respostas: {}, tentativas: 0, etapa: 0 };

function passo(contato, texto) {
  const r = processar({ contato, entrada: { texto }, funis, config: cfg });
  return { r, contato: { ...contato, ...r.mudancas } };
}

test('identifica papel preto com erro de digitação e manda boas-vindas', () => {
  const { r, contato } = passo(base, 'Oi tudo bem? vim pelo anuncio do papel pretu');
  assert.equal(contato.funil_id, 'f0');
  assert.equal(contato.aguardando, 'sim_nao');
  assert.ok(r.acoes[0].texto.includes('Maria'));
  assert.equal(r.acoes.filter((a) => a.tipo === 'audio').length, 3);
  assert.equal(r.acoes.at(-1).tipo, 'texto');
});

test('fluxo completo até lead quente', () => {
  let c = passo(base, 'quero saber do papel standard').contato;
  assert.equal(c.funil_id, 'f1');
  let s = passo(c, 'Simmm pode mandar'); c = s.contato;
  assert.equal(c.etapa, 1);
  assert.ok(s.r.acoes.some((a) => a.tipo === 'imagem'));
  s = passo(c, '4 classic'); c = s.contato;
  assert.equal(c.respostas.pedido, '4 classic');
  s = passo(c, 'Maria Silva, cep 90010-150, rua x 10 centro'); c = s.contato;
  assert.equal(c.estado, 'quente');
  assert.equal(s.r.evento, 'quente');
  assert.equal(c.cep, '90010150');
});

test('não identificado pergunta produto e depois transfere', () => {
  let s = passo(base, 'oi'); let c = s.contato;
  assert.equal(c.estado, 'identificando');
  assert.ok(s.r.acoes[0].texto.includes('1. Ebony'));
  s = passo(c, '2'); assert.equal(s.contato.funil_id, 'f1');
  s = passo(c, 'qual o horario de vcs'); c = s.contato;
  assert.equal(c.tentativas, 1);
  s = passo(c, 'onde fica a loja'); c = s.contato;
  assert.equal(c.estado, 'humano');
});

test('negativo transfere para humano', () => {
  let c = passo(base, 'ebony').contato;
  const s = passo(c, 'não, obrigado');
  assert.equal(s.contato.estado, 'humano');
});

test('mídia sem texto pede texto', () => {
  let c = passo(base, 'ebony').contato;
  const r = processar({ contato: c, entrada: { texto: '' }, funis, config: cfg });
  assert.equal(r.mudancas.tentativas, 1);
  assert.ok(/udio|texto/.test(r.acoes[0].texto));
});

test('intenções', () => {
  const P = CONFIG_PADRAO.palavras_positivas, N = CONFIG_PADRAO.palavras_negativas;
  assert.equal(intencao('pode sim!', P, N), 'positivo');
  assert.equal(intencao('nao quero agora', P, N), 'negativo');
  assert.equal(intencao('vou pensar', P, N), 'negativo');
  assert.equal(intencao('manda o pix', P, N), 'positivo');
  assert.equal(intencao('qual a cor?', P, N), null);
  assert.ok(pontuar('folha escura', ['folha escura']) > 0);
});

test('sem nome não fica vírgula solta', () => {
  const r = processar({ contato: { ...base, nome_whatsapp: '.' }, entrada: { texto: 'oi' }, funis, config: cfg });
  assert.ok(!/ ,|, !|,!/.test(r.acoes[0].texto), r.acoes[0].texto);
});
