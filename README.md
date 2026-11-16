# 🤖 Robô de Atendimento para WhatsApp

Sistema próprio de atendimento automático (estilo Octadesk/Manychat) para triagem de leads de tráfego pago.

| Parte | Onde roda | Pasta |
|---|---|---|
| **Painel online** (login, conversas, funis, leads quentes) | Vercel (grátis) | `painel/` |
| **Banco de dados + logins + arquivos** | Supabase (grátis) | `supabase/` |
| **Robô** (conecta os WhatsApps) | PC Windows ligado 24h | `robo/` |
| Motor do funil (usado pelo robô e pelo simulador do painel) | — | `compartilhado/` |
| Instalador `.exe` (gerado automaticamente pelo GitHub) | — | `instalador/` |

---

## 1. Acesso ao painel

Abra **https://robo-atendimento-eosin.vercel.app** e entre com **usuário, e-mail ou telefone** + senha.
- **Administrador:** usuário `Admin` (a senha foi combinada na montagem — troque-a em Administração → 🔑 assim que terminar os testes).
- **Usuários:** são criados pelo administrador em **Administração → Criar novo usuário** (nome, e-mail, telefone e senha). Eles entram com o e-mail **ou** o telefone.
- Esqueceu a senha? O administrador usa 🔑 (define uma nova na hora) ou ✉️ (envia um link para o e-mail do usuário).

## 2. Instalar o robô no PC que fica ligado

1. Baixe o instalador em **https://github.com/k2brunin/robo-atendimento/releases/latest** → arquivo `Instalador-Robo-Atendimento.exe`.
2. Dê dois cliques. Se aparecer **"O Windows protegeu o computador"**: clique em **Mais informações → Executar assim mesmo**.
3. Avançar → Instalar → Concluir. Uma página abre no navegador (`http://localhost:3333`).
4. Entre com o **usuário e senha do ADMINISTRADOR** (`Admin`). Pronto: o robô fica ligado e abre sozinho sempre que o Windows iniciar.

Atalhos criados na área de trabalho:
- **Robo de Atendimento** → liga o robô (se estiver desligado) e mostra a página de status.
- **Desligar Robo de Atendimento** → desliga.

### Deixar o PC sempre pronto
- **Configurações do Windows → Sistema → Energia** → "Suspender" = **Nunca** (na tomada).
- Desative reinícios automáticos fora de hora: **Windows Update → Opções avançadas → Horário ativo**.
- Se possível, use um nobreak e internet por cabo.

## 3. Conectar o WhatsApp
No painel → **WhatsApp** → **Conectar (gerar QR Code)** → no celular: *Dispositivos conectados → Conectar dispositivo* → leia o QR.

## 4. Montar os funis
Painel → **Funis** → **Criar funis de exemplo** (já vem com os textos do papel para mechas) → em cada etapa, clique em **Enviar arquivo** nos blocos de áudio, vídeo e banner → **Salvar funil**. Use o **🧪 Testar funil** para simular um cliente.

> 💡 No anúncio do Meta (Clique para WhatsApp), coloque uma mensagem pré-preenchida como *"Olá! Quero saber do papel Ebony"* e adicione essa frase nas palavras-chave do funil.

## 5. Dia a dia
- **Leads quentes**: clientes que aceitaram o preço e mandaram os dados. Toca um som quando chega um novo (deixe a aba aberta).
- **Conversas**: todo o histórico. Você pode responder pelo painel ou pelo celular — nos dois casos o robô **pausa** sozinho para aquele cliente.
- **Configurações**: horário, mensagens automáticas, palavras de sim/não, frete por estado.
- **Administração** (só ADM): criar usuários (cada um com seu WhatsApp), ativar IA.

## 6. Novo usuário (ex.: seu colega)
Administração → **Criar novo usuário** (nome, e-mail, telefone, senha) → envie os dados para ele. Ele entra no mesmo site, conecta o WhatsApp dele pela página WhatsApp e cria os funis dele. O robô dele roda no **seu** PC automaticamente — nada para instalar no PC dele.

## 7. IA (opcional, grátis)
1. Crie uma chave em **https://aistudio.google.com** → *Get API key*.
2. Painel → Administração → cole a chave na conta → ligue **IA** → escolha *Só sugerir* ou *Responder dúvidas sozinha*.
3. Em Configurações, preencha **Informações para a IA** (já vem preenchido se você criou os funis de exemplo).

## Problemas comuns
| Sintoma | Solução |
|---|---|
| Painel diz "computador do robô não está respondendo" | PC desligado, sem internet ou robô fechado → clique no atalho **Robo de Atendimento**. |
| QR Code não aparece | Página WhatsApp → **Reiniciar conexão**. Aguarde até 1 minuto. |
| Número banido / trocado | WhatsApp → **Desconectar número** → conectar o novo. O histórico continua. |
| Ver o que o robô está fazendo | Arquivo de registro: `%LOCALAPPDATA%\RoboAtendimento\logs\robo.log` |

---
### Para desenvolvedores
- Robô: `cd robo && npm install && npm start` (testes: `npm test`)
- Painel: `cd painel && npm install && npm run dev`
- Banco: migrações em `supabase/migrations/`, função `supabase/functions/admin-usuarios`.
- Toda alteração em `robo/` enviada ao GitHub gera um novo instalador em *Releases*.
- ⚠️ Usa WhatsApp Web não-oficial (whatsapp-web.js): existe risco de bloqueio do número. O robô só responde quem chamou primeiro e simula digitação para reduzir o risco.
