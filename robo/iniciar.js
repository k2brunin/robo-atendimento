// Mantém o robô sempre ligado: se ele fechar por algum erro, abre de novo sozinho.
const { spawn } = require('child_process');
const path = require('path');

let tentativasRapidas = 0;
function rodar() {
  const inicio = Date.now();
  const filho = spawn(process.execPath, [path.join(__dirname, 'src', 'index.js')], { stdio: 'inherit', env: process.env });
  filho.on('exit', (codigo) => {
    if (codigo === 3) process.exit(0); // já existe outro robô rodando
    tentativasRapidas = Date.now() - inicio < 60000 ? tentativasRapidas + 1 : 0;
    const espera = Math.min(60000, 3000 * Math.max(1, tentativasRapidas));
    console.log(`Robô fechou (código ${codigo}). Reiniciando em ${espera / 1000}s...`);
    setTimeout(rodar, espera);
  });
}
rodar();
