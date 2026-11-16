const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA } = require('./ambiente');
const { armazenamentoLogin } = require('./dados');

const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
  auth: { storage: armazenamentoLogin, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

module.exports = { sb };
