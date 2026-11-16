// PONTO DE ENTRADA DO ROBÔ
const { exec } = require('child_process');
const { sb } = require('./banco');
const { log } = require('./dados');
const { Gerenciador } = require('./gerenciador');
const { iniciarServidor } = require('./servidor-local');
const { PORTA_LOCAL } = require('./ambiente');

const gerenciador = new Gerenciador();

async function usuarioAtual() {
  const { data } = await sb.auth.getSession();
  return data && data.session ? data.session.user : null;
}

async function ehAdmin(userId) {
  const { data } = await sb.from('perfis').select('papel, aprovado').eq('id', userId).maybeSingle();
  return !!(data && data.papel === 'admin' && data.aprovado);
}

async function principal() {
  try {
    await iniciarServidor({
      obterEstado: async () => {
        const u = await usuarioAtual();
        return { logado: !!u, email: u && u.email, contas: gerenciador.resumo(), erro: gerenciador.ultimoErro };
      },
      entrar: async (email, senha) => {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) return 'E-mail ou senha incorretos (ou e-mail ainda não confirmado).';
        if (!(await ehAdmin(data.user.id))) { await sb.auth.signOut(); return 'Somente o ADMINISTRADOR pode ligar o robô neste computador.'; }
        log('Login feito:', email);
        gerenciador.iniciar();
        return '';
      },
      sair: async () => { await gerenciador.parar(); await sb.auth.signOut(); log('Robô desligado pelo usuário.'); },
    });
  } catch (e) {
    if (e.code === 'EADDRINUSE') { log('O robô já está rodando neste computador.'); process.exit(3); }
    throw e;
  }
  log(`Página do robô: http://localhost:${PORTA_LOCAL}`);

  const u = await usuarioAtual();
  if (u && (await ehAdmin(u.id))) {
    log('Login salvo encontrado:', u.email);
    gerenciador.iniciar();
  } else {
    log('Nenhum login salvo - abrindo a página para entrar.');
    if (process.platform === 'win32' && !process.env.ROBO_SEM_NAVEGADOR) exec(`start "" http://localhost:${PORTA_LOCAL}`);
  }
}

process.on('unhandledRejection', (e) => log('Erro não tratado:', e));
process.on('uncaughtException', (e) => { log('Erro grave:', e); });
async function encerrar() { log('Encerrando...'); await gerenciador.parar().catch(() => {}); process.exit(0); }
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

principal().catch((e) => { log('Falha ao iniciar:', e); process.exit(1); });
