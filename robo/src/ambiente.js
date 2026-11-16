// Endereço público do banco (não é segredo: a segurança é feita por login + regras do banco).
module.exports = {
  SUPABASE_URL: 'https://dvnotdhnbhfmcmpvogwq.supabase.co',
  SUPABASE_CHAVE_PUBLICA: 'sb_publishable_jMIsGgbodLPie1EBB81EQw_4Qmx6Lz8',
  PORTA_LOCAL: Number(process.env.ROBO_PORTA || 3333),
  BUCKET: 'midias',
};
