/**
 * Comparação de salário com o mercado — calculada só com as vagas que o app
 * tem na mão, nunca com número inventado. Por isso o texto sempre diz
 * "entre as vagas da área" e a comparação só aparece com amostra mínima.
 */

/** @typedef {import('./tipos.js').Vaga} Vaga */

/** Menos vagas que isto numa área e a média não diz nada. */
export const AMOSTRA_MINIMA = 3;

/** @param {Vaga} v */
export function salarioMedioDaVaga(v) {
  if (v.salarioMin == null && v.salarioMax == null) return null;
  return ((v.salarioMin ?? /** @type {number} */ (v.salarioMax)) + (v.salarioMax ?? /** @type {number} */ (v.salarioMin))) / 2;
}

/**
 * Mediana salarial por área, só das áreas com amostra suficiente.
 * @param {Vaga[]} vagas
 * @returns {Map<string, number>} centavos por mês
 */
export function medianasPorArea(vagas) {
  /** @type {Map<string, number[]>} */
  const porArea = new Map();
  for (const v of vagas) {
    const s = salarioMedioDaVaga(v);
    if (s == null) continue;
    porArea.set(v.area, [...(porArea.get(v.area) ?? []), s]);
  }
  /** @type {Map<string, number>} */
  const r = new Map();
  for (const [area, lista] of porArea) {
    if (lista.length < AMOSTRA_MINIMA) continue;
    const o = [...lista].sort((a, b) => a - b);
    const m = o.length >> 1;
    r.set(area, o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2);
  }
  return r;
}

/**
 * Diferença percentual do salário da vaga para a mediana da área, ou null
 * quando não dá para comparar. Ex.: 18 = paga 18% acima.
 * @param {Vaga} vaga
 * @param {Map<string, number>} medianas
 */
export function comparacaoSalarial(vaga, medianas) {
  const s = salarioMedioDaVaga(vaga);
  const m = medianas.get(vaga.area);
  if (s == null || !m) return null;
  return Math.round(((s - m) / m) * 100);
}
