/**
 * Fonte de vagas reais: API oficial da Adzuna (https://developer.adzuna.com).
 *
 * Por que uma API e não "raspar a internet": LinkedIn, Indeed, Catho e afins
 * proíbem cópia automática nos termos de uso, e o bloqueio acontece rápido.
 * Agregadores com API aberta (Adzuna, Jooble, Careerjet) já juntam milhares de
 * sites de forma legal. Cada nova fonte é só mais um arquivo aqui que converte
 * para `Vaga`.
 *
 * Precisa de ADZUNA_APP_ID e ADZUNA_APP_KEY (cadastro gratuito). Roda só no
 * servidor: a chave não pode ir para o navegador.
 */

import { normalizar } from '../core/text.js';

/** @typedef {import('../core/tipos.js').Vaga} Vaga */

const BASE = 'https://api.adzuna.com/v1/api/jobs/br/search';

/** Nome do estado (normalizado) → sigla. */
const UF_POR_NOME = /** @type {Record<string, string>} */ ({
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
});

/**
 * Habilidades que valem a pena reconhecer em descrições livres. Lista curta de
 * propósito: é melhor não achar um requisito do que inventar um.
 */
const HABILIDADES_CONHECIDAS = [
  'excel', 'pacote office', 'power bi', 'sql', 'python', 'javascript', 'react', 'java', 'html', 'css', 'git',
  'atendimento ao cliente', 'vendas', 'negociação', 'cnh', 'nr-10', 'nr-35', 'nr-12', 'nr-18',
  'controle de estoque', 'empilhadeira', 'contas a pagar', 'contas a receber', 'departamento pessoal',
  'recrutamento e seleção', 'inglês', 'espanhol', 'autocad', 'photoshop', 'illustrator', 'figma',
  'solda', 'elétrica', 'hidráulica', 'coren', 'crc', 'direção defensiva', 'telemarketing',
];

/**
 * @param {string} descricao
 * @returns {string[]}
 */
export function extrairRequisitos(descricao) {
  const texto = ` ${normalizar(descricao)} `;
  return HABILIDADES_CONHECIDAS.filter((h) => texto.includes(` ${normalizar(h)} `));
}

/**
 * A Adzuna costuma informar salário anual, mas alguns anúncios trazem o valor
 * mensal. Um salário mínimo anual passa de R$ 18 mil, então qualquer valor a
 * partir de R$ 15 mil só pode ser anual; abaixo disso, é mensal.
 * @param {number | undefined} valor reais
 * @returns {number | null} centavos por mês
 */
export function salarioMensal(valor) {
  if (!valor || !Number.isFinite(valor)) return null;
  const mensal = valor >= 15_000 ? valor / 12 : valor;
  return Math.round(mensal) * 100;
}

/**
 * @param {{ what?: string, where?: string, pagina?: number, porPagina?: number, appId: string, appKey: string }} p
 */
export function montarUrl({ what = '', where = '', pagina = 1, porPagina = 50, appId, appKey }) {
  const url = new URL(`${BASE}/${pagina}`);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', String(porPagina));
  if (what) url.searchParams.set('what', what);
  if (where) url.searchParams.set('where', where);
  return url.toString();
}

/**
 * Converte um resultado da Adzuna para `Vaga`.
 * @param {any} r
 * @returns {Vaga}
 */
export function converter(r) {
  const area = /** @type {string[]} */ (r.location?.area ?? []);
  const uf = area.map((a) => UF_POR_NOME[normalizar(a)]).find(Boolean) ?? 'BR';
  const cidade = area.length > 2 ? area[area.length - 1] : (r.location?.display_name ?? '');
  const descricao = String(r.description ?? '').replace(/<[^>]+>/g, '');
  const remoto = /\b(remoto|home office|teletrabalho)\b/.test(normalizar(`${r.title} ${descricao}`));

  return {
    id: `adz-${r.id}`,
    titulo: String(r.title ?? '').replace(/<[^>]+>/g, ''),
    empresa: r.company?.display_name ?? 'Empresa não informada',
    cidade: remoto && !cidade ? 'Remoto' : cidade,
    uf,
    modalidade: remoto ? 'remoto' : 'presencial',
    contrato: r.contract_type === 'contract' ? 'PJ' : 'CLT',
    salarioMin: salarioMensal(r.salary_min),
    salarioMax: salarioMensal(r.salary_max),
    area: r.category?.label?.replace(/ (Jobs|Vagas)$/i, '') ?? 'Outros',
    requisitos: extrairRequisitos(descricao),
    diferenciais: [],
    escolaridadeMin: 'fundamental',
    experienciaMin: 0,
    beneficios: [],
    descricao,
    publicadaEm: String(r.created ?? '').slice(0, 10),
    fonte: 'Adzuna',
    url: r.redirect_url ?? '',
    valorizaExperiencia: false,
    exigeCnh: /\bcnh\b/.test(normalizar(descricao)),
  };
}

/**
 * Busca vagas reais. `fetchFn` é injetável para teste.
 * @param {{ what?: string, where?: string, pagina?: number, appId: string, appKey: string }} params
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<Vaga[]>}
 */
export async function buscarAdzuna(params, fetchFn = fetch) {
  const resp = await fetchFn(montarUrl(params), { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Adzuna respondeu ${resp.status}`);
  const dados = /** @type {any} */ (await resp.json());
  return (dados.results ?? []).map(converter);
}
