import { useEffect, useState } from 'react';
import { sb } from '../supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [modo, setModo] = useState('entrar');
  const [existeAdmin, setExisteAdmin] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { sb.rpc('existe_admin').then(({ data }) => setExisteAdmin(data === true)); }, []);

  async function enviar(e) {
    e.preventDefault();
    setErro(''); setAviso(''); setCarregando(true);
    if (modo === 'entrar') {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) setErro(error.message.includes('confirm') ? 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).' : 'E-mail ou senha incorretos.');
    } else if (modo === 'recuperar') {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) setErro(error.message); else setAviso('Enviamos um link para seu e-mail.');
    } else {
      if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); setCarregando(false); return; }
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password: senha,
        options: { data: { nome }, emailRedirectTo: window.location.origin } });
      if (error) setErro(error.message);
      else if (!data.session) setAviso('Conta criada! Abra seu e-mail e clique no link de confirmação. Depois volte aqui e entre.');
    }
    setCarregando(false);
  }

  return (
    <div className="login">
      <form className="cartao" onSubmit={enviar}>
        <h2 style={{ marginTop: 0 }}>💬 Robô de Atendimento</h2>
        {modo === 'criar' && <p className="ajuda">Crie a conta do <b>ADMINISTRADOR</b>. Este é o primeiro acesso do sistema.</p>}
        {erro && <div className="erro-caixa">{erro}</div>}
        {aviso && <div className="ok-caixa">{aviso}</div>}
        {modo === 'criar' && (<><label className="rotulo">Seu nome</label><input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required /></>)}
        <label className="rotulo">E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        {modo !== 'recuperar' && (<><label className="rotulo">Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} /></>)}
        <button className="btn primario" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} disabled={carregando}>
          {carregando ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta de administrador' : 'Enviar link'}
        </button>
        <div className="linha" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13 }}>
          {modo !== 'entrar' ? <a href="#" onClick={(e) => { e.preventDefault(); setModo('entrar'); }}>Voltar para o login</a>
            : <a href="#" onClick={(e) => { e.preventDefault(); setModo('recuperar'); }}>Esqueci a senha</a>}
          {!existeAdmin && modo === 'entrar' && <a href="#" onClick={(e) => { e.preventDefault(); setModo('criar'); }}>Primeiro acesso</a>}
        </div>
      </form>
    </div>
  );
}
