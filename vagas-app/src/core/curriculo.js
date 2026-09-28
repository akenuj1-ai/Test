/**
 * Currículo adaptado, carta de apresentação e preparação para entrevista.
 *
 * Nesta versão tudo é gerado por regras locais: rápido, gratuito, funciona
 * offline e nunca inventa experiência que a pessoa não tem. O texto só
 * reorganiza e destaca o que está no perfil. Um modelo de linguagem pode
 * refinar a redação depois, sem mudar esta garantia.
 */

import { requisitosAtendidos } from './match.js';
import { NOME_ESCOLARIDADE } from './tipos.js';
import { formatarReais } from './text.js';

/** @typedef {import('./tipos.js').Vaga} Vaga */
/** @typedef {import('./tipos.js').Perfil} Perfil */

/**
 * Habilidades do perfil com as pedidas pela vaga primeiro. Quem faz a
 * triagem lê as primeiras linhas; o que a vaga pede tem de estar lá.
 * @param {Perfil} perfil
 * @param {Vaga | null} vaga
 */
export function ordenarHabilidades(perfil, vaga) {
  if (!vaga) return [...perfil.habilidades];
  const alvo = [...vaga.requisitos, ...vaga.diferenciais];
  const relevantes = perfil.habilidades.filter((h) => requisitosAtendidos({ ...perfil, habilidades: [h], experiencias: [], temCnh: false }, alvo).length > 0);
  return [...relevantes, ...perfil.habilidades.filter((h) => !relevantes.includes(h))];
}

/**
 * @param {Perfil} perfil
 * @param {Vaga | null} vaga
 */
function objetivo(perfil, vaga) {
  const cargo = vaga?.titulo ?? perfil.cargoDesejado;
  const anos = perfil.anosExperiencia;
  const exp = anos >= 1 ? `, com ${anos} ano${anos > 1 ? 's' : ''} de experiência` : '';
  // só habilidades escritas pela pessoa: "experiência em CNH" não faz sentido
  const soHabilidades = { ...perfil, temCnh: false, experiencias: [] };
  const destaques = (vaga ? requisitosAtendidos(soHabilidades, vaga.requisitos) : perfil.habilidades).slice(0, 3);
  const em = destaques.length ? ` em ${destaques.join(', ')}` : '';
  return `Atuar como ${cargo}${vaga ? ` na ${vaga.empresa}` : ''}${exp}${em}.`;
}

/**
 * Currículo em texto simples, pronto para copiar, imprimir ou colar em
 * formulários de candidatura.
 * @param {Perfil} perfil
 * @param {Vaga | null} [vaga]
 */
export function gerarCurriculo(perfil, vaga = null) {
  const linhas = [];
  linhas.push(perfil.nome.toUpperCase() || 'SEU NOME');
  const contato = [perfil.cidade && `${perfil.cidade}/${perfil.uf}`, perfil.telefone, perfil.email].filter(Boolean).join(' · ');
  if (contato) linhas.push(contato);
  if (perfil.temCnh) linhas.push('Possui CNH');
  linhas.push('');

  linhas.push('OBJETIVO');
  linhas.push(objetivo(perfil, vaga));
  linhas.push('');

  if (perfil.resumo.trim()) {
    linhas.push('RESUMO');
    linhas.push(perfil.resumo.trim());
    linhas.push('');
  }

  const habilidades = ordenarHabilidades(perfil, vaga);
  if (habilidades.length) {
    linhas.push('HABILIDADES');
    for (const h of habilidades) linhas.push(`• ${h}`);
    linhas.push('');
  }

  if (perfil.experiencias.length) {
    linhas.push('EXPERIÊNCIA PROFISSIONAL');
    for (const e of perfil.experiencias) {
      linhas.push(`${e.cargo} — ${e.empresa}${e.periodo ? ` (${e.periodo})` : ''}`);
      if (e.descricao.trim()) linhas.push(`  ${e.descricao.trim()}`);
    }
    linhas.push('');
  }

  linhas.push('FORMAÇÃO');
  linhas.push(NOME_ESCOLARIDADE[perfil.escolaridade]);

  return linhas.join('\n');
}

/**
 * Carta de apresentação curta — três parágrafos, sem exagero.
 * @param {Perfil} perfil
 * @param {Vaga} vaga
 */
export function gerarCarta(perfil, vaga) {
  const atendidos = requisitosAtendidos(perfil, vaga.requisitos);
  const ultima = perfil.experiencias[0];
  const anos = perfil.anosExperiencia;

  const p1 = `Olá, equipe da ${vaga.empresa}. Meu nome é ${perfil.nome || '[seu nome]'} e tenho interesse na vaga de ${vaga.titulo}${vaga.cidade && vaga.modalidade !== 'remoto' ? ` em ${vaga.cidade}` : ''}.`;

  const partes = [];
  if (anos >= 1) partes.push(`tenho ${anos} ano${anos > 1 ? 's' : ''} de experiência`);
  if (ultima) partes.push(`meu trabalho mais recente foi como ${ultima.cargo} na ${ultima.empresa}`);
  if (atendidos.length) partes.push(`tenho prática em ${atendidos.join(', ')}, que estão entre os requisitos da vaga`);
  const p2 = partes.length
    ? `${partes[0].charAt(0).toUpperCase()}${partes[0].slice(1)}${partes.length > 1 ? `; ${partes.slice(1).join('; ')}` : ''}.`
    : 'Estou pronto(a) para aprender rápido e contribuir desde o primeiro dia.';

  const p3 = `Sou uma pessoa responsável e comprometida${anos >= 10 ? ', com a maturidade de quem já passou por muitas situações no trabalho' : ''}. Fico à disposição para uma conversa${perfil.telefone ? ` pelo ${perfil.telefone}` : ''}${perfil.email ? ` ou pelo e-mail ${perfil.email}` : ''}.`;

  return `${p1}\n\n${p2}\n\n${p3}\n\nAtenciosamente,\n${perfil.nome || '[seu nome]'}`;
}

/**
 * @typedef {Object} Pergunta
 * @property {string} pergunta
 * @property {string} dica
 */

/** Perguntas por área, além das gerais. Chave = área normalizada da vaga. */
const POR_AREA = /** @type {Record<string, Pergunta[]>} */ ({
  'Logística': [
    { pergunta: 'Já teve alguma multa ou acidente? Como foi?', dica: 'Seja honesto(a). Se teve, explique o que aprendeu e como dirige hoje.' },
    { pergunta: 'Como você organiza uma rota com muitas entregas?', dica: 'Fale de prioridade por horário, uso de aplicativo de mapa e conferência da carga antes de sair.' },
  ],
  'Vendas': [
    { pergunta: 'Me venda esta caneta.', dica: 'Primeiro pergunte o que a pessoa precisa. Depois mostre como o produto resolve isso.' },
    { pergunta: 'Como você lida com um “não” do cliente?', dica: 'Mostre persistência sem insistência: entenda a objeção e volte com outra proposta.' },
  ],
  'Tecnologia': [
    { pergunta: 'Conte um problema técnico difícil que você resolveu.', dica: 'Use a estrutura situação → o que você fez → resultado com números.' },
    { pergunta: 'Como você se mantém atualizado(a)?', dica: 'Cite cursos, documentação, projetos pessoais ou comunidades reais.' },
  ],
  'Saúde': [
    { pergunta: 'Como você age com um paciente ou família nervosos?', dica: 'Fale de calma, escuta e de seguir o protocolo, chamando o responsável quando preciso.' },
  ],
  'Atendimento': [
    { pergunta: 'Conte uma vez em que você atendeu um cliente muito irritado.', dica: 'Mostre que ouviu, não levou para o pessoal e resolveu (ou encaminhou).' },
  ],
  'Varejo': [
    { pergunta: 'O que você faz quando a loja está cheia e a fila grande?', dica: 'Fale de agilidade, atenção ao troco e de cordialidade mesmo sob pressão.' },
  ],
  'Manutenção': [
    { pergunta: 'Quais normas de segurança você segue no dia a dia?', dica: 'Cite as NRs que conhece e o uso correto de EPI.' },
  ],
  'Construção Civil': [
    { pergunta: 'Que tipo de obra você já fez?', dica: 'Dê exemplos concretos: tamanho da obra, etapa em que atuou, prazo.' },
  ],
});

/**
 * Perguntas prováveis na entrevista, com dicas de resposta. Inclui as
 * perguntas difíceis que o próprio perfil provoca (tempo parado, idade,
 * requisito que falta), que são as que mais derrubam candidatos.
 * @param {Perfil} perfil
 * @param {Vaga} vaga
 * @returns {Pergunta[]}
 */
export function prepararEntrevista(perfil, vaga) {
  /** @type {Pergunta[]} */
  const lista = [
    { pergunta: 'Fale um pouco sobre você.', dica: `Em 1 minuto: experiência → o que sabe fazer bem → por que quer ser ${vaga.titulo}. Não conte a vida toda.` },
    { pergunta: `Por que você quer trabalhar na ${vaga.empresa}?`, dica: 'Pesquise a empresa antes. Cite algo concreto (produto, localização, reputação) e ligue ao seu objetivo.' },
    ...(POR_AREA[vaga.area] ?? []),
  ];

  const faltam = vaga.requisitos.filter((r) => !requisitosAtendidos(perfil, [r]).length);
  if (faltam.length) {
    lista.push({
      pergunta: `Você tem experiência com ${faltam[0]}?`,
      dica: 'Não minta. Diga o que já fez de parecido e que está disposto(a) a aprender — e, se puder, comece um curso gratuito antes da entrevista.',
    });
  }

  lista.push({
    pergunta: 'Por que você está sem trabalhar?',
    dica: 'Resposta curta e sem culpa: o motivo em uma frase e depois o que fez nesse tempo (cursos, bicos, família). Volte logo para o que você oferece.',
  });

  if (perfil.anosExperiencia >= 15) {
    lista.push({
      pergunta: 'Você não acha que tem experiência demais para esta vaga?',
      dica: 'Mostre que quer estabilidade e que experiência significa menos erro e menos treinamento. Diga que se adapta bem a líderes mais jovens.',
    });
  }

  const teto = vaga.salarioMax ?? vaga.salarioMin;
  lista.push({
    pergunta: 'Qual é a sua pretensão salarial?',
    dica: teto
      ? `A vaga anuncia até ${formatarReais(teto)}. Fique dentro da faixa e diga que está aberto(a) a conversar sobre o pacote todo.`
      : 'Pesquise o salário médio do cargo na sua cidade e dê uma faixa, não um número único.',
  });

  lista.push({
    pergunta: 'Você tem alguma pergunta para nós?',
    dica: 'Tenha sempre uma: “Como é um dia normal nessa função?” ou “O que vocês esperam de quem entra nos primeiros 3 meses?”.',
  });
  return lista;
}
