/**
 * Fonte de vagas reais: API da Jooble (https://jooble.org/api/about).
 *
 * Agregador presente no Brasil (br.jooble.org) com milhares de sites de
 * emprego. Chave gratuita pedida no site; vai em JOOBLE_KEY, só no servidor.
 */

import { limparHtml, lerLocal, lerSalario, vagaExterna } from './comum.js';

/** @typedef {import('../core/tipos.js').Vaga} Vaga */

const BASE = 'https://br.jooble.org/api/';

/**
 * @param {any} r
 * @returns {Vaga}
 */
export function converter(r) {
  const { cidade, uf } = lerLocal(r.location);
  const { min, max } = lerSalario(r.salary);
  const tipo = String(r.type ?? '').toLowerCase();
  return vagaExterna({
    id: `joo-${r.id}`,
    titulo: limparHtml(r.title),
    empresa: limparHtml(r.company) || 'Empresa não informada',
    cidade,
    uf,
    contrato: /pj|contrato|freela/.test(tipo) ? 'PJ' : /est[aá]gio/.test(tipo) ? 'Estágio' : /tempor/.test(tipo) ? 'Temporário' : 'CLT',
    salarioMin: min,
    salarioMax: max,
    descricao: limparHtml(r.snippet),
    publicadaEm: String(r.updated ?? '').slice(0, 10),
    fonte: 'Jooble',
    url: r.link ?? '',
  });
}

/**
 * @param {{ what?: string, where?: string, pagina?: number, chave: string }} params
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<Vaga[]>}
 */
export async function buscarJooble({ what = '', where = '', pagina = 1, chave }, fetchFn = fetch) {
  const resp = await fetchFn(BASE + encodeURIComponent(chave), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ keywords: what, location: where, page: String(pagina) }),
  });
  if (!resp.ok) throw new Error(`Jooble respondeu ${resp.status}`);
  const dados = /** @type {any} */ (await resp.json());
  return (dados.jobs ?? []).map(converter);
}
