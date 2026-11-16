// Login por USUÁRIO, E-MAIL ou TELEFONE + senha.
// Descobre o e-mail interno da pessoa e faz o login no servidor (não expõe e-mails de ninguém).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ERRO = "Usuário/e-mail/telefone ou senha incorretos.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { login, senha } = await req.json();
    const id = String(login || "").trim();
    if (!id || !senha) return json({ erro: ERRO }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    let email: string | null = null;
    if (id.includes("@")) {
      email = id.toLowerCase();
    } else {
      const digitos = id.replace(/\D/g, "");
      if (digitos.length >= 8 && digitos.length === id.replace(/[\s()+\-.]/g, "").length) {
        // telefone: aceita com ou sem 55 / DDD
        const { data } = await adm.from("perfis").select("email, telefone").not("telefone", "is", null);
        const achado = (data || []).find((p) => {
          const t = String(p.telefone);
          return t === digitos || t.endsWith(digitos) || digitos.endsWith(t);
        });
        email = achado?.email ?? null;
      } else {
        const { data } = await adm.from("perfis").select("email").ilike("usuario", id).maybeSingle();
        email = data?.email ?? null;
      }
    }
    if (!email) {
      await new Promise((r) => setTimeout(r, 400));
      return json({ erro: ERRO }, 401);
    }

    const publico = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const { data, error } = await publico.auth.signInWithPassword({ email, password: String(senha) });
    if (error || !data.session) return json({ erro: ERRO }, 401);
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (_e) {
    return json({ erro: "Não foi possível entrar agora. Tente de novo." }, 500);
  }
});
