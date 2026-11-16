import { useEffect, useState } from 'react';
import { RefreshCw, Power, LogOut, QrCode } from 'lucide-react';
import { sb } from '../supabase';

export default function WhatsApp({ conta }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 5000); return () => clearInterval(t); }, []);
  const segundos = conta.robo_visto_em ? Math.round((agora - new Date(conta.robo_visto_em).getTime()) / 1000) : null;
  const pcOnline = segundos !== null && segundos < 90;

  async function comando(c) {
    if (c === 'desconectar' && !window.confirm('Desconectar este WhatsApp? Será preciso ler o QR Code de novo.')) return;
    await sb.from('contas').update({ comando: c, comando_em: new Date().toISOString(), ...(c === 'conectar' ? { whatsapp_status: 'iniciando' } : {}) }).eq('id', conta.id);
  }
  async function alternarRobo(v) { await sb.from('contas').update({ robo_ativo: v }).eq('id', conta.id); }

  const st = conta.whatsapp_status;
  return (
    <div className="pagina">
      <div className="grade" style={{ maxWidth: 760 }}>
        {!pcOnline && (
          <div className="erro-caixa">
            ⚠ O computador do robô não está respondendo{segundos !== null ? ` (última vez há ${Math.round(segundos / 60)} min)` : ''}.
            Verifique se o PC está ligado, com internet, e se o programa "Robô de Atendimento" está aberto.
          </div>
        )}
        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Conexão do WhatsApp</h3>
          <p>Status: <b>{{ conectado: '🟢 Conectado', aguardando_qr: '🟡 Aguardando leitura do QR Code', iniciando: '⏳ Iniciando (pode levar até 1 minuto)...',
            desconectado: '⚪ Desconectado', erro: '🔴 Erro - tente reiniciar' }[st] || st}</b>
            {conta.whatsapp_numero && <> · Número: <b>{conta.whatsapp_numero}</b> {conta.whatsapp_nome && `(${conta.whatsapp_nome})`}</>}</p>

          {st === 'aguardando_qr' && conta.whatsapp_qr && (
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <img src={conta.whatsapp_qr} alt="QR Code" style={{ width: 280, maxWidth: '100%', background: '#fff', padding: 10, borderRadius: 12 }} />
              <ol style={{ textAlign: 'left', maxWidth: 420, margin: '14px auto', lineHeight: 1.7 }}>
                <li>Abra o <b>WhatsApp</b> (ou WhatsApp Business) no celular do número da loja</li>
                <li>Toque em <b>⋮ Mais opções</b> (Android) ou <b>Configurações</b> (iPhone)</li>
                <li>Toque em <b>Dispositivos conectados → Conectar dispositivo</b></li>
                <li>Aponte a câmera para este QR Code</li>
              </ol>
            </div>
          )}

          <div className="linha">
            {(st === 'desconectado' || st === 'erro') && <button className="btn primario" onClick={() => comando('conectar')} disabled={!pcOnline}><QrCode size={16} /> Conectar (gerar QR Code)</button>}
            {st !== 'desconectado' && <button className="btn" onClick={() => comando('reiniciar')} disabled={!pcOnline}><RefreshCw size={16} /> Reiniciar conexão</button>}
            {st !== 'desconectado' && <button className="btn perigo" onClick={() => comando('desconectar')} disabled={!pcOnline}><LogOut size={16} /> Desconectar número</button>}
          </div>
          <p className="ajuda">Se o número for banido ou trocado: clique em "Desconectar número" e conecte o novo. Todo o histórico de clientes continua salvo aqui.</p>
        </div>

        <div className="cartao">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0 }}><Power size={16} /> Robô automático</h3>
              <p className="ajuda" style={{ marginBottom: 0 }}>Desligado: as mensagens continuam chegando no painel, mas o robô não responde ninguém.</p>
            </div>
            <label className="interruptor"><input type="checkbox" checked={conta.robo_ativo} onChange={(e) => alternarRobo(e.target.checked)} /><span /></label>
          </div>
        </div>
      </div>
    </div>
  );
}
