/**
 * Fonte de vagas reais: API oficial da Adzuna (https://developer.adzuna.com).
 *
 * Por que APIs e não "raspar a internet": LinkedIn, Indeed, Catho e afins
 * proíbem cópia automática nos termos de uso, e o bloqueio acontece rápido.
 * Agregadores com API aberta (Adzuna, Jooble, Careerjet) já juntam milhares de
 * sites de forma legal.
 *
 * Precisa de ADZUNA_APP_ID e ADZUNA_APP_KEY (cadastro gratuito). Roda só no
 * servidor: a chave não pode ir para o navegador.
 */

import { normalizar } from '../core/text.js';
import { UF_POR_NOME, limparHtml, vagaExterna, extrairRequisitos } from './comum.js';

export { extrairRequisitos };

/** @typedef {import('../core/tipos.js').Vaga} Vaga */

const BASE = 'https://api.adzuna.com/v1/api/jobs/br/search';

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
  return vagaExterna({
    id: `adz-${r.id}`,
    titulo: limparHtml(r.title),
    empresa: r.company?.display_name ?? 'Empresa não informada',
    cidade,
    uf,
    contrato: r.contract_type === 'contract' ? 'PJ' : 'CLT',
    salarioMin: salarioMensal(r.salary_min),
    salarioMax: salarioMensal(r.salary_max),
    area: r.category?.label?.replace(/ (Jobs|Vagas)$/i, '') ?? 'Outros',
    descricao: limparHtml(r.description),
    publicadaEm: String(r.created ?? '').slice(0, 10),
    fonte: 'Adzuna',
    url: r.redirect_url ?? '',
  });
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
