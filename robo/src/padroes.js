// Configurações padrão de cada conta. Tudo isso é editável no painel (Configurações).

const CONFIG_PADRAO = {
  buffer_segundos: 6,
  max_tentativas: 2,
  retomar_horas: 24,          // conversa parada há X horas + cliente volta = robô recomeça (0 = nunca)
  horario: {
    ativo: true,
    inicio: '08:00',
    fim: '19:00',
    dias: [1, 2, 3, 4, 5, 6], // 0=dom 1=seg ... 6=sáb
    fora_modo: 'funil',       // funil = robô atende normalmente | aviso = só manda aviso
  },
  msg_fora_horario: [
    'Oi{nome}! Nosso atendimento é das 8h às 19h. Assim que abrirmos eu te respondo, combinado? 😊',
  ],
  msg_qual_produto: [
    'Oi, {nome}! Tudo bem? 😊 Me conta, qual desses produtos te interessa?\n\n{opcoes}',
    'Olá, {nome}! Que bom que você chamou! Sobre qual produto você quer saber?\n\n{opcoes}',
    'Oi, {nome}, seja bem-vindo(a)! Pra eu te ajudar melhor, qual produto você procura?\n\n{opcoes}',
  ],
  msg_nao_entendi: [
    'Desculpa, {nome}, acho que não entendi direito 😅',
    'Opa, não consegui entender 🙈',
    'Hmm, não entendi muito bem',
  ],
  msg_midia: [
    'No momento não consigo ouvir áudios ou ver arquivos por aqui 🙏 Consegue me mandar por texto rapidinho?',
    'Ops, por aqui não consigo abrir áudio nem imagem 😅 Me escreve em texto, por favor?',
  ],
  msg_transferir: [
    'Vou chamar um atendente pra te ajudar, {nome}! Só um minutinho 😊',
    'Já vou passar sua conversa para o nosso time, tá? Em instantes alguém te responde 🙌',
  ],
  msg_negativo: [
    'Sem problemas, {nome}! Se surgir qualquer dúvida é só me chamar por aqui 😊',
    'Tudo bem! Fico à disposição, qualquer coisa é só chamar 🙌',
  ],
  palavras_positivas: [
    'sim', 's', 'ss', 'quero', 'pode', 'pode ser', 'pode mandar', 'pode enviar', 'manda', 'mande', 'envia', 'claro', 'com certeza',
    'ok', 'okay', 'beleza', 'blz', 'bora', 'fechado', 'fechou', 'tenho interesse', 'interesse', 'gostaria', 'isso',
    'perfeito', 'show', 'top', 'manda o pix', 'vou querer', 'aceito', 'positivo', 'uhum', 'aham', 'yes', 'por favor',
    'pfv', 'pf', 'quero ver', 'me manda', 'certo', 'otimo', 'legal', 'vamos', 'combinado', 'quero sim', 'pode sim',
  ],
  palavras_negativas: [
    'nao', 'n', 'nao quero', 'agora nao', 'sem interesse', 'nao tenho interesse', 'vou pensar', 'mais tarde',
    'muito caro', 'ta caro', 'esta caro', 'deixa pra la', 'nao obrigado', 'nao obrigada', 'dispenso', 'nao precisa',
    'outro dia', 'por enquanto nao', 'so olhando', 'so pesquisando',
  ],
  frete_por_uf: {},           // ex: { "RS": 25, "SC": 30 } - só aparece no painel, não vai para o cliente
  base_conhecimento: '',      // texto com informações dos produtos (usado pela IA, se ativada)
  ia_modelo: 'gemini-2.5-flash',
};

// Funis de exemplo criados para a conta do ADM (baseado no atendimento real).
function funisExemplo() {
  const boasVindas = [
    'Oi, {nome}! Tudo bem? Que bom que você chamou! 😊 Vou te mandar uns áudios rapidinhos explicando sobre o nosso papel para mechas, tá?',
    'Olá, {nome}! Seja muito bem-vindo(a)! 😊 Vou te explicar rapidinho como funciona o nosso papel para mechas, te mando uns áudios.',
    'Oi, {nome}, tudo bem? Obrigado pelo contato! 🙌 Separei uns áudios curtinhos pra te apresentar o papel para mechas.',
  ];
  const perguntaValores = [
    'Posso encaminhar para você os valores?',
    'Quer que eu te mande os valores?',
    'Posso te passar os valores?',
  ];
  const perguntaQuantidade = [
    'Qual modelo te interessou mais e quantos pacotes você precisaria? Lembrando que a partir de 4 pacotes o frete é grátis (pode misturar os modelos) 😉',
    'Me conta: qual modelo e quantos pacotes você gostaria? A partir de 4 pacotes o frete sai grátis, e dá pra misturar os modelos 🚚',
  ];
  const pedirDados = [
    'Perfeito! Pra eu já deixar seu pedido encaminhado, me passa por favor:\n\n• Nome completo\n• CEP\n• Endereço do salão (rua, número e bairro)',
    'Ótimo! Então me envia por favor seu nome completo, CEP e o endereço de entrega (rua, número e bairro) que eu já deixo tudo certinho 😊',
  ];
  const quente = [
    'Recebi certinho, {nome}! 🙌 Já vou conferir tudo e finalizar seu pedido com você em instantes.',
    'Anotado, {nome}! Em instantes eu te confirmo o pedido e o frete, tá? 😊',
  ];

  const montar = (nome, chaves, prioridade, bannerNome) => ({
    nome,
    ativo: true,
    prioridade,
    palavras_chave: chaves,
    etapas: [
      {
        id: 'boas_vindas', nome: 'Boas-vindas + apresentação',
        blocos: [
          { tipo: 'texto', variacoes: boasVindas },
          { tipo: 'audio', path: '', nome: 'Áudio 4 - Apresentação (Igor)' },
          { tipo: 'audio', path: '', nome: 'Áudio 5 - Sobre o papel / 50 mil salões' },
          { tipo: 'audio', path: '', nome: 'Áudio 1 - Diferenciais (Air Flow, Grip, reutilização)' },
          { tipo: 'video', path: '', nome: 'Vídeo do produto' },
          { tipo: 'texto', variacoes: perguntaValores },
        ],
        depois: 'sim_nao', campo: 'quer_valores',
        repergunta: perguntaValores, se_nao: 'humano',
      },
      {
        id: 'valores', nome: 'Valores',
        blocos: [
          { tipo: 'imagem', path: '', nome: bannerNome },
          { tipo: 'audio', path: '', nome: 'Áudio 3 - Diferença entre os modelos' },
          { tipo: 'audio', path: '', nome: 'Áudio 2 - Frete grátis e pagamento na entrega' },
          { tipo: 'texto', variacoes: perguntaQuantidade },
        ],
        depois: 'resposta', campo: 'pedido', se_nao: 'humano',
      },
      {
        id: 'dados', nome: 'Dados para entrega',
        blocos: [{ tipo: 'texto', variacoes: pedirDados }],
        depois: 'resposta', campo: 'dados_entrega', se_nao: 'humano',
      },
      {
        id: 'quente', nome: 'Lead quente → passar para humano',
        blocos: [{ tipo: 'texto', variacoes: quente }],
        depois: 'quente',
      },
    ],
  });

  return [
    montar('Ebony (papel preto)', ['ebony', 'papel preto', 'preto', 'preta', 'escuro', 'folha escura', 'papel escuro', 'black'], 2,
      'Banner Ebony + Classic'),
    montar('Papel Branco (Standard e Classic)', ['standard', 'classic', 'classico', 'branco', 'papel branco', 'papel de mechas',
      'papel para mechas', 'papel mecha', 'reutilizavel', 'mechas', 'papel'], 1, 'Banner Standard + Classic'),
  ];
}

module.exports = { CONFIG_PADRAO, funisExemplo };
