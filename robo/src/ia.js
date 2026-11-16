// MÓDULO DE IA (opcional). Só é usado se o ADM ativar a IA na conta e cadastrar a chave grátis do Google Gemini.
const { log } = require('./dados');

async function gerarResposta({ chave, modelo, base, produto, historico, modo }) {
  if (!chave) return null;
  const instrucoes = [
    'Você é um atendente de vendas pelo WhatsApp de uma empresa brasileira. Responda em português do Brasil,',
    'de forma simpática, curta (no máximo 3 frases) e natural, como uma pessoa real. Use no máximo 1 emoji.',
    'Use SOMENTE as informações abaixo. Se não souber a resposta, diga que vai confirmar com o time e já retorna.',
    'Nunca invente preços, prazos ou condições. Não se apresente como robô ou IA.',
    produto ? `Produto que o cliente está vendo: ${produto}.` : '',
    modo === 'sugerir' ? 'Escreva a resposta que o vendedor deveria mandar agora para o cliente.' : '',
    '\nINFORMAÇÕES DA EMPRESA E PRODUTOS:\n' + (base || '(nenhuma informação cadastrada)'),
  ].join(' ');
  const conversa = historico.map((m) => `${m.direcao === 'entrada' ? 'Cliente' : 'Atendente'}: ${m.texto || '[' + m.tipo + ']'}`).join('\n');
  const corpo = {
    systemInstruction: { parts: [{ text: instrucoes }] },
    contents: [{ role: 'user', parts: [{ text: `Conversa até agora:\n${conversa}\n\nEscreva somente a próxima resposta do atendente.` }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 300 },
  };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo || 'gemini-2.5-flash')}:generateContent`;
    const r = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify(corpo),
    });
    clearTimeout(t);
    const j = await r.json();
    if (!r.ok) { log('IA erro:', j.error ? j.error.message : r.status); return null; }
    const texto = (((j.candidates || [])[0] || {}).content || {}).parts?.map((p) => p.text).join('').trim();
    return texto || null;
  } catch (e) {
    log('IA falhou:', e.message);
    return null;
  }
}

module.exports = { gerarResposta };
