import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://dvnotdhnbhfmcmpvogwq.supabase.co';
export const sb = createClient(SUPABASE_URL, 'sb_publishable_jMIsGgbodLPie1EBB81EQw_4Qmx6Lz8');
export const BUCKET = 'midias';

const cacheUrls = new Map();
export async function urlMidia(caminho) {
  if (!caminho) return null;
  const c = cacheUrls.get(caminho);
  if (c && c.expira > Date.now()) return c.url;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(caminho, 3600);
  if (error) return null;
  cacheUrls.set(caminho, { url: data.signedUrl, expira: Date.now() + 3000 * 1000 });
  return data.signedUrl;
}

export function tipoPorArquivo(arquivo) {
  const t = arquivo.type || '';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'imagem';
  return 'documento';
}

export async function enviarArquivo(contaId, pasta, arquivo) {
  const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const caminho = `${contaId}/${pasta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (error) throw error;
  return caminho;
}
