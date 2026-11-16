// Função segura (roda no Supabase) para o ADM criar, excluir e trocar senha de usuários.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const chamador = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: admin, error: e1 } = await chamador.rpc("eh_admin");
    if (e1 || !admin) return json({ erro: "Somente o administrador pode fazer isso." }, 403);

    const adm = createClient(url, service, { auth: { persistSession: false } });
    const corpo = await req.json();

    const limparTel = (t: unknown) => String(t || "").replace(/\D/g, "") || null;

    if (corpo.acao === "criar") {
      const email = String(corpo.email || "").trim().toLowerCase();
      const senha = String(corpo.senha || "");
      const telefone = limparTel(corpo.telefone);
      if (!email || senha.length < 6) return json({ erro: "Informe e-mail e senha com pelo menos 6 caracteres." }, 400);
      if (telefone) {
        const { data: ja } = await adm.from("perfis").select("id").eq("telefone", telefone).maybeSingle();
        if (ja) return json({ erro: "Já existe um usuário com esse telefone." }, 400);
      }
      const { data, error } = await adm.auth.admin.createUser({
        email, password: senha, email_confirm: true,
        app_metadata: { criado_pelo_admin: true },
        user_metadata: { nome: corpo.nome || email.split("@")[0], telefone },
      });
      if (error) return json({ erro: error.message.includes("already") ? "Já existe um usuário com esse e-mail." : error.message }, 400);
      await adm.from("perfis").update({ aprovado: true, telefone }).eq("id", data.user.id);
      return json({ ok: true, id: data.user.id });
    }

    if (corpo.acao === "editar") {
      const telefone = limparTel(corpo.telefone);
      const email = String(corpo.email || "").trim().toLowerCase();
      if (email) {
        const { error } = await adm.auth.admin.updateUserById(corpo.id, { email, email_confirm: true });
        if (error) return json({ erro: error.message }, 400);
      }
      const { error } = await adm.from("perfis").update({ nome: corpo.nome, telefone, ...(email ? { email } : {}) }).eq("id", corpo.id);
      if (error) return json({ erro: error.message.includes("perfis_telefone") ? "Telefone já usado por outro usuário." : error.message }, 400);
      return json({ ok: true });
    }

    if (corpo.acao === "link_senha") {
      const { data: p } = await adm.from("perfis").select("email").eq("id", corpo.id).maybeSingle();
      if (!p?.email || p.email.endsWith(".local")) return json({ erro: "Este usuário não tem um e-mail real cadastrado." }, 400);
      const publico = createClient(url, anon, { auth: { persistSession: false } });
      const { error } = await publico.auth.resetPasswordForEmail(p.email, { redirectTo: corpo.site || undefined });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (corpo.acao === "senha") {
      if (String(corpo.senha || "").length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      const { error } = await adm.auth.admin.updateUserById(corpo.id, { password: corpo.senha });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (corpo.acao === "excluir") {
      const { data: perfil } = await adm.from("perfis").select("conta_id, papel").eq("id", corpo.id).maybeSingle();
      if (perfil?.papel === "admin") return json({ erro: "Não é possível excluir o administrador." }, 400);
      const { error } = await adm.auth.admin.deleteUser(corpo.id);
      if (error) return json({ erro: error.message }, 400);
      if (perfil?.conta_id) await adm.from("contas").delete().eq("id", perfil.conta_id);
      return json({ ok: true });
    }

    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message || e) }, 500);
  }
});
