import { useState } from 'react';
import { sb } from '../supabase';

export async function entrarComLogin(login, senha) {
  const { data, error } = await sb.functions.invoke('entrar', { body: { login, senha } });
  if (error || !data?.access_token) {
    let msg = 'Usuário/e-mail/telefone ou senha incorretos.';
    try { const j = await error.context.json(); if (j.erro) msg = j.erro; } catch (_) { /* ignora */ }
    return msg;
  }
  const { error: e2 } = await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  return e2 ? e2.message : '';
}

export default function Login() {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [esqueci, setEsqueci] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(''); setCarregando(true);
    const msg = await entrarComLogin(login.trim(), senha);
    if (msg) setErro(msg);
    setCarregando(false);
  }

  return (
    <div className="login">
      <form className="cartao" onSubmit={enviar}>
        <h2 style={{ marginTop: 0 }}>💬 Robô de Atendimento</h2>
        {erro && <div className="erro-caixa">{erro}</div>}
        <label className="rotulo">Usuário, e-mail ou telefone</label>
        <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" autoCapitalize="none" />
        <label className="rotulo">Senha</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" />
        <button className="btn primario" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} disabled={carregando}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
        <div style={{ marginTop: 14, fontSize: 13 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setEsqueci(!esqueci); }}>Esqueci minha senha</a>
          {esqueci && <div className="aviso-caixa">Peça ao administrador para redefinir sua senha. Ele pode criar uma nova na hora ou enviar um link para o seu e-mail.</div>}
        </div>
      </form>
    </div>
  );
}
