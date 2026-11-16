// Pastas onde o robô guarda sessão do WhatsApp, login e registros (logs).
const fs = require('fs');
const os = require('os');
const path = require('path');

const base = process.env.ROBO_DADOS
  || (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'RoboAtendimento')
    : path.join(os.homedir(), '.robo-atendimento'));

const pastas = {
  base,
  sessoes: path.join(base, 'sessoes-whatsapp'),
  cache: path.join(base, 'cache-midias'),
  logs: path.join(base, 'logs'),
  login: path.join(base, 'login.json'),
};
for (const p of [pastas.base, pastas.sessoes, pastas.cache, pastas.logs]) fs.mkdirSync(p, { recursive: true });

const arquivoLog = path.join(pastas.logs, 'robo.log');
function log(...partes) {
  const linha = `[${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${partes
    .map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'object' ? JSON.stringify(p) : String(p)))
    .join(' ')}`;
  console.log(linha);
  try {
    if (fs.existsSync(arquivoLog) && fs.statSync(arquivoLog).size > 5 * 1024 * 1024) {
      fs.renameSync(arquivoLog, arquivoLog + '.antigo');
    }
    fs.appendFileSync(arquivoLog, linha + '\n');
  } catch (_) { /* ignora */ }
}

// Armazenamento do login do Supabase em arquivo (para não pedir senha a cada reinício).
const armazenamentoLogin = {
  ler() { try { return JSON.parse(fs.readFileSync(pastas.login, 'utf8')); } catch (_) { return {}; } },
  getItem(k) { return this.ler()[k] ?? null; },
  setItem(k, v) { const d = this.ler(); d[k] = v; fs.writeFileSync(pastas.login, JSON.stringify(d)); },
  removeItem(k) { const d = this.ler(); delete d[k]; fs.writeFileSync(pastas.login, JSON.stringify(d)); },
};

module.exports = { pastas, log, armazenamentoLogin };
