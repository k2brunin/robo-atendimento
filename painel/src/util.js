export function tempoCurto(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
export function dataHora(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
export function nomeContato(c) {
  return c?.nome || c?.nome_whatsapp || (c?.telefone ? formatarTelefone(c.telefone) : 'Sem nome');
}
export function formatarTelefone(t) {
  if (!t) return '';
  const m = String(t).match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : '+' + t;
}
export function linkWhatsApp(c) {
  return c?.telefone ? `https://wa.me/${c.telefone}` : null;
}
export function iniciais(nome) {
  return String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}
export const ESTADOS = {
  novo: { rotulo: 'Novo', classe: 'robo' },
  identificando: { rotulo: 'Robô: identificando', classe: 'robo' },
  no_funil: { rotulo: 'Robô atendendo', classe: 'robo' },
  quente: { rotulo: '🔥 Quente', classe: 'quente' },
  humano: { rotulo: 'Precisa de humano', classe: 'humano' },
  finalizado: { rotulo: 'Finalizado', classe: '' },
};
export function seloEstado(c) {
  if (c.robo_pausado && c.estado !== 'quente') return { rotulo: 'Robô pausado', classe: 'humano' };
  return ESTADOS[c.estado] || { rotulo: c.estado, classe: '' };
}
export const ROTULOS_RESPOSTAS = { produto: 'Produto', quer_valores: 'Quis ver valores', pedido: 'Pedido / quantidade', dados_entrega: 'Dados para entrega' };

// Bip discreto (sem arquivo de som)
export function tocarAlerta() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = i ? 1046 : 784; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (_) { /* navegador sem som */ }
}
