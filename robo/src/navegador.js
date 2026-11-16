// Descobre qual navegador (Chrome) usar para o WhatsApp Web.
const fs = require('fs');
const path = require('path');

// No instalador do Windows o Chrome vem junto, na pasta "chrome" ao lado do robô.
const pastaChrome = path.join(__dirname, '..', '..', 'chrome');
if (!process.env.PUPPETEER_CACHE_DIR && fs.existsSync(pastaChrome)) process.env.PUPPETEER_CACHE_DIR = pastaChrome;

function acharNavegador() {
  if (process.env.ROBO_CHROME && fs.existsSync(process.env.ROBO_CHROME)) return process.env.ROBO_CHROME;
  try {
    const p = require('puppeteer').executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (_) { /* ignora */ }
  const candidatos = process.platform === 'win32' ? [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium'];
  return candidatos.find((c) => c && fs.existsSync(c)) || undefined;
}

module.exports = { acharNavegador };
