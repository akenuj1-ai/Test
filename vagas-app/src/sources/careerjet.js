/**
 * Fonte de vagas reais: API pública da Careerjet
 * (https://www.careerjet.com.br/partners/api/).
 *
 * Precisa de um código de afiliado gratuito (CAREERJET_AFFID). A API pede o
 * IP e o navegador de quem está buscando, repassados pelo servidor.
 */

import { limparHtml, lerLocal, vagaExterna, hashTexto } from './comum.js';

/** @typedef {import('../core/tipos.js').Vaga} Vaga */

const BASE = 'https://public.api.careerjet.net/search';

/**
 * @param {number | string | undefined} valor
 * @param {string} tipo  'Y' ano, 'M' mês, 'W' semana, 'D' dia, 'H' hora
 */
export function paraMensal(valor, tipo) {
  const v = Number(valor);
  if (!v || !Number.isFinite(v)) return null;
  const fator = { Y: 1 / 12, M: 1, W: 4.33, D: 22, H: 220 }[String(tipo).toUpperCase()] ?? 1;
  return Math.round(v * fator) * 100;
}

/**
 * @param {any} r
 * @returns {Vaga}
 */
export function converter(r) {
  const { cidade, uf } = lerLocal(r.locations);
  const data = r.date ? new Date(r.date) : null;
  return vagaExterna({
    id: `cjt-${hashTexto(String(r.url || `${r.title}|${r.company}|${r.locations}`))}`,
    titulo: limparHtml(r.title),
    empresa: limparHtml(r.company) || 'Empresa não informada',
    cidade,
    uf,
    salarioMin: paraMensal(r.salary_min, r.salary_type),
    salarioMax: paraMensal(r.salary_max, r.salary_type),
    descricao: limparHtml(r.description),
    publicadaEm: data && !Number.isNaN(data.getTime()) ? data.toISOString().slice(0, 10) : '',
    fonte: 'Careerjet',
    url: r.url ?? '',
  });
}

/**
 * @param {{ what?: string, where?: string, pagina?: number, affid: string, ip?: string, navegador?: string }} params
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<Vaga[]>}
 */
export async function buscarCareerjet({ what = '', where = '', pagina = 1, affid, ip = '127.0.0.1', navegador = 'VagaCerta' }, fetchFn = fetch) {
  const url = new URL(BASE);
  const q = { locale_code: 'pt_BR', keywords: what, location: where, affid, user_ip: ip, user_agent: navegador, pagesize: '50', page: String(pagina) };
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  const resp = await fetchFn(url.toString(), { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Careerjet respondeu ${resp.status}`);
  const dados = /** @type {any} */ (await resp.json());
  if (dados.type === 'ERROR') throw new Error(`Careerjet: ${dados.error ?? 'erro'}`);
  return (dados.jobs ?? []).map(converter);
}
