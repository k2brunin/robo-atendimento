// Pequena página em http://localhost:3333 mostrando se o robô está rodando + login do ADM no primeiro uso.
const http = require('http');
const { PORTA_LOCAL } = require('./ambiente');

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function pagina(corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Robô de Atendimento</title><style>
body{font-family:system-ui,Segoe UI,sans-serif;background:#f4f6f8;color:#1d2433;margin:0;display:flex;justify-content:center;padding:40px 16px}
.card{background:#fff;border-radius:14px;box-shadow:0 2px 12px #0001;padding:28px;max-width:460px;width:100%}
h1{font-size:20px;margin:0 0 6px}p{color:#5b6475;line-height:1.5}label{display:block;font-size:14px;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #d5dae2;border-radius:8px;font-size:15px}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:8px;background:#16a34a;color:#fff;font-size:15px;cursor:pointer}
.ok{color:#16a34a;font-weight:600}.erro{background:#fde8e8;color:#9b1c1c;padding:10px;border-radius:8px}
ul{padding-left:18px}li{margin:6px 0}.sair{background:#eef0f3;color:#333}
</style></head><body><div class="card">${corpo}</div></body></html>`;
}

function iniciarServidor({ obterEstado, entrar, sair }) {
  const servidor = http.createServer(async (req, res) => {
    try {
      if (req.method === 'POST') {
        let corpo = '';
        for await (const parte of req) { corpo += parte; if (corpo.length > 10000) break; }
        const p = new URLSearchParams(corpo);
        let erro = '';
        if (req.url === '/entrar') erro = await entrar(p.get('email') || '', p.get('senha') || '');
        if (req.url === '/sair') await sair();
        res.writeHead(303, { Location: '/' + (erro ? '?erro=' + encodeURIComponent(erro) : '') });
        return res.end();
      }
      const est = await obterEstado();
      const erro = new URL(req.url, 'http://x').searchParams.get('erro');
      let html;
      if (!est.logado) {
        html = `<h1>🤖 Robô de Atendimento</h1><p>Primeiro acesso neste computador: entre com o <b>usuário e senha do ADMINISTRADOR</b> (os mesmos do painel online).</p>
        ${erro ? `<div class="erro">${esc(erro)}</div>` : ''}
        <form method="post" action="/entrar"><label>Usuário</label><input name="email" type="text" required autocapitalize="none">
        <label>Senha</label><input name="senha" type="password" required><button>Entrar e ligar o robô</button></form>`;
      } else {
        html = `<h1>🤖 Robô de Atendimento</h1><p class="ok">● Robô LIGADO neste computador</p>
        <p>Conectado como <b>${esc(est.email)}</b>. Pode fechar esta página: o robô continua rodando em segundo plano.
        Gerencie tudo pelo painel online.</p>
        ${est.erro ? `<div class="erro">${esc(est.erro)}</div>` : ''}
        <p><b>WhatsApps neste computador:</b></p><ul>${est.contas.map((c) => `<li>${esc(c.nome)} — ${esc(c.status)} ${c.numero ? '(' + esc(c.numero) + ')' : ''}</li>`).join('') || '<li>nenhum ainda</li>'}</ul>
        <form method="post" action="/sair"><button class="sair">Desligar robô e sair deste computador</button></form>
        <script>setTimeout(()=>location.reload(),8000)</script>`;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pagina(html));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Erro: ' + e.message);
    }
  });
  return new Promise((ok, falha) => {
    servidor.once('error', falha);
    servidor.listen(PORTA_LOCAL, '127.0.0.1', () => ok(servidor));
  });
}

module.exports = { iniciarServidor };
