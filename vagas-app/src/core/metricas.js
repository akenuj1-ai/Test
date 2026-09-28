/**
 * Funil de conversão: de quem chega até quem paga.
 *
 * Vender mais começa por saber onde as pessoas desistem. Cada ação
 * importante vira um evento; o funil conta quantas sessões diferentes
 * chegaram a cada etapa e a taxa de passagem entre elas.
 */

/**
 * @typedef {Object} Evento
 * @property {string} nome
 * @property {string} sessao
 * @property {number} quando   ms desde 1970
 * @property {Record<string, string | number>} [dados]
 */

/** Etapas do funil, em ordem. Cada uma é um nome de evento. */
export const ETAPAS_FUNIL = /** @type {const} */ ([
  { evento: 'visita', nome: 'Visitaram' },
  { evento: 'abrir_vaga', nome: 'Abriram uma vaga' },
  { evento: 'gerar', nome: 'Geraram currículo, carta ou entrevista' },
  { evento: 'ver_oferta', nome: 'Viram a oferta do Pro' },
  { evento: 'clique_assinar', nome: 'Clicaram em assinar' },
  { evento: 'assinou', nome: 'Assinaram' },
]);

/** Eventos aceitos; qualquer outro nome é descartado. */
export const EVENTOS_VALIDOS = new Set([
  ...ETAPAS_FUNIL.map((e) => e.evento),
  'buscar', 'salvar', 'compartilhar', 'quiz_concluido', 'filtro',
]);

/** Guarda no máximo isto; os mais antigos saem primeiro. */
export const LIMITE_EVENTOS = 5000;

/**
 * Valida e normaliza um evento vindo de fora (navegador).
 * @param {any} bruto
 * @param {number} agora
 * @returns {Evento | null}
 */
export function validarEvento(bruto, agora) {
  if (!bruto || typeof bruto !== 'object') return null;
  const nome = String(bruto.nome ?? '');
  const sessao = String(bruto.sessao ?? '');
  if (!EVENTOS_VALIDOS.has(nome) || !/^[a-z0-9]{6,40}$/i.test(sessao)) return null;
  /** @type {Record<string, string | number>} */
  const dados = {};
  if (bruto.dados && typeof bruto.dados === 'object') {
    for (const [k, v] of Object.entries(bruto.dados).slice(0, 8)) {
      if (typeof v === 'number' && Number.isFinite(v)) dados[k.slice(0, 30)] = v;
      else if (typeof v === 'string') dados[k.slice(0, 30)] = v.slice(0, 80);
    }
  }
  return { nome, sessao, quando: agora, dados };
}

/**
 * Acrescenta um evento, respeitando o limite.
 * @param {Evento[]} lista
 * @param {Evento} evento
 */
export function registrar(lista, evento) {
  const nova = [...lista, evento];
  return nova.length > LIMITE_EVENTOS ? nova.slice(-LIMITE_EVENTOS) : nova;
}

/**
 * @typedef {Object} EtapaCalculada
 * @property {string} evento
 * @property {string} nome
 * @property {number} sessoes        sessões que chegaram aqui
 * @property {number} doTopo         % em relação à primeira etapa
 * @property {number | null} daAnterior  % em relação à etapa anterior
 */

/**
 * Funil por sessões únicas. Uma sessão só conta numa etapa se também passou
 * por todas as anteriores — assim a taxa nunca passa de 100%.
 * @param {Evento[]} eventos
 * @returns {EtapaCalculada[]}
 */
export function funil(eventos) {
  /** @type {Map<string, Set<string>>} */
  const porSessao = new Map();
  for (const e of eventos) {
    const s = porSessao.get(e.sessao) ?? new Set();
    s.add(e.nome);
    porSessao.set(e.sessao, s);
  }
  const contagens = ETAPAS_FUNIL.map((_, i) => {
    let n = 0;
    for (const feitos of porSessao.values()) {
      if (ETAPAS_FUNIL.slice(0, i + 1).every((et) => feitos.has(et.evento))) n++;
    }
    return n;
  });
  const topo = contagens[0];
  return ETAPAS_FUNIL.map((et, i) => ({
    evento: et.evento,
    nome: et.nome,
    sessoes: contagens[i],
    doTopo: topo ? Math.round((contagens[i] / topo) * 1000) / 10 : 0,
    daAnterior: i === 0 ? null : contagens[i - 1] ? Math.round((contagens[i] / contagens[i - 1]) * 1000) / 10 : 0,
  }));
}

/**
 * Receita projetada: quanto rende uma base de usuários com uma taxa de
 * assinatura e uma divisão entre mensal e anual. Tudo em centavos.
 * @param {{ usuarios: number, conversao: number, fracaoAnual: number, precoMensal: number, precoAnual: number }} p
 *   conversao e fracaoAnual de 0 a 1
 */
export function projetarReceita({ usuarios, conversao, fracaoAnual, precoMensal, precoAnual }) {
  const assinantes = Math.round(usuarios * conversao);
  const anuais = Math.round(assinantes * fracaoAnual);
  const mensais = assinantes - anuais;
  const porMes = mensais * precoMensal + Math.round((anuais * precoAnual) / 12);
  return { assinantes, mensais, anuais, porMes, porAno: porMes * 12 };
}

/** Id de sessão aleatório, sem dados pessoais. */
export function novaSessao() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}
