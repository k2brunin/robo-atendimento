// Utilidades de texto: normalização, comparação tolerante a erros e detecção de intenção.

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')                     // remove pontuação/emojis
    .replace(/(.)\1{2,}/g, '$1')                      // "simmmm" -> "sim"
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(texto) {
  const n = normalizar(texto);
  return n ? n.split(' ') : [];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Duas palavras são "parecidas" tolerando pequenos erros de digitação.
function palavraParecida(a, b) {
  if (a === b) return true;
  const tam = Math.max(a.length, b.length);
  if (tam < 5) return false;          // palavras curtas: só exato
  const limite = tam >= 8 ? 2 : 1;
  return levenshtein(a, b) <= limite;
}

// Verifica se a frase-chave aparece no texto (palavras em sequência, tolerando erros).
function contemFrase(tokensTexto, frase) {
  const tf = tokens(frase);
  if (!tf.length) return false;
  for (let i = 0; i <= tokensTexto.length - tf.length; i++) {
    let ok = true;
    for (let j = 0; j < tf.length; j++) {
      if (!palavraParecida(tokensTexto[i + j], tf[j])) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// Pontua um texto contra uma lista de palavras-chave. Frases maiores valem mais.
function pontuar(texto, palavrasChave) {
  const tt = tokens(texto);
  let pontos = 0;
  for (const p of palavrasChave || []) {
    if (contemFrase(tt, p)) pontos += tokens(p).length;
  }
  return pontos;
}

// Retorna 'positivo', 'negativo' ou null.
function intencao(texto, positivas, negativas, modo = 'sim_nao') {
  const tt = tokens(texto);
  if (!tt.length) return null;
  const negFrases = (negativas || []).filter((p) => tokens(p).length > 1);
  const negSimples = (negativas || []).filter((p) => tokens(p).length === 1);
  const posFrases = (positivas || []).filter((p) => tokens(p).length > 1);
  const posSimples = (positivas || []).filter((p) => tokens(p).length === 1);

  if (negFrases.some((p) => contemFrase(tt, p))) return 'negativo';
  if (posFrases.some((p) => contemFrase(tt, p))) return 'positivo';
  if (modo === 'sim_nao') {
    const temNeg = negSimples.some((p) => contemFrase(tt, p));
    const temPos = posSimples.some((p) => contemFrase(tt, p));
    if (temNeg && !temPos) return 'negativo';
    if (temPos && !temNeg) return 'positivo';
    if (temPos && temNeg) {
      // "sim, não tenho dúvidas" -> vale a primeira palavra
      const primeiro = tt.find((t) => negSimples.some((p) => tokens(p)[0] === t) || posSimples.some((p) => tokens(p)[0] === t));
      return negSimples.some((p) => tokens(p)[0] === primeiro) ? 'negativo' : 'positivo';
    }
  }
  return null;
}

function primeiroNome(nome) {
  if (!nome) return '';
  const limpo = String(nome).replace(/[^\p{L}\s'-]/gu, ' ').trim();
  const p = limpo.split(/\s+/)[0] || '';
  if (p.length < 2 || p.length > 20) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

// Troca {nome} e {produto}. Sem nome: remove "{nome}" e a vírgula/espaço antes.
function preencher(modelo, vars) {
  let t = String(modelo || '');
  if (vars.nome) t = t.replace(/\{nome\}/gi, vars.nome);
  else t = t.replace(/[ ,]*\{nome\}/gi, '');
  t = t.replace(/\{produto\}/gi, vars.produto || '');
  t = t.replace(/\{opcoes\}/gi, vars.opcoes || '');
  return t.replace(/ +([!?.,])/g, '$1').trim();
}

function sortear(lista) {
  const validas = (lista || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!validas.length) return '';
  return validas[Math.floor(Math.random() * validas.length)];
}

export { normalizar, tokens, levenshtein, palavraParecida, contemFrase, pontuar, intencao, primeiroNome, preencher, sortear };
