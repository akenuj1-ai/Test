/**
 * Ajudas para o perfil: o quanto está completo e a área deduzida do cargo.
 *
 * Perfil completo = nota de chance mais certa = mais candidaturas boas. A
 * barra de "perfil X% completo" dá à pessoa um motivo concreto para preencher.
 */

import { relevancia } from './relevancia.js';

/** @typedef {import('./tipos.js').Perfil} Perfil */
/** @typedef {import('./tipos.js').Vaga} Vaga */

/** [peso, está preenchido?, o que falta dizer] */
const ITENS = /** @type {[number, (p: Perfil) => boolean, string][]} */ ([
  [15, (p) => p.cargoDesejado.trim() !== '', 'o cargo que você procura'],
  [15, (p) => p.cidade.trim() !== '' && p.uf !== '', 'sua cidade e estado'],
  [20, (p) => p.habilidades.length >= 3, 'pelo menos 3 habilidades'],
  [15, (p) => p.experiencias.length > 0, 'uma experiência de trabalho'],
  [10, (p) => p.nome.trim() !== '', 'seu nome'],
  [10, (p) => p.telefone.trim() !== '' || p.email.trim() !== '', 'um telefone ou e-mail'],
  [5, (p) => p.area !== '', 'sua área'],
  [5, (p) => p.resumo.trim().length >= 30, 'um resumo sobre você'],
  [5, (p) => p.anosExperiencia > 0, 'seus anos de experiência'],
]);

/**
 * @param {Perfil} perfil
 * @returns {{ porcento: number, proximo: string | null }}
 */
export function completude(perfil) {
  let total = 0;
  /** @type {string | null} */
  let proximo = null;
  for (const [peso, ok, falta] of ITENS) {
    if (ok(perfil)) total += peso;
    else proximo ??= falta;
  }
  return { porcento: total, proximo };
}

/**
 * Área mais comum entre as vagas que casam com o cargo digitado, ou ''.
 * Usada no cadastro rápido, onde a pessoa só diz o que procura.
 * @param {string} cargo
 * @param {Vaga[]} vagas
 */
export function inferirArea(cargo, vagas) {
  if (!cargo.trim()) return '';
  /** @type {Map<string, number>} */
  const pontos = new Map();
  for (const v of vagas) {
    const r = relevancia(v, cargo);
    if (r > 0) pontos.set(v.area, (pontos.get(v.area) ?? 0) + r);
  }
  let melhor = '';
  let max = 0;
  for (const [area, p] of pontos) if (p > max) { max = p; melhor = area; }
  return melhor;
}

/**
 * Habilidades mais pedidas nas vagas de uma área, para a pessoa só marcar
 * as que tem. CNH fica de fora: tem campo próprio.
 * @param {string} area
 * @param {Vaga[]} vagas
 * @param {number} [limite]
 */
export function habilidadesSugeridas(area, vagas, limite = 10) {
  /** @type {Map<string, { nome: string, n: number }>} */
  const contagem = new Map();
  for (const v of vagas) {
    if (area && v.area !== area) continue;
    for (const h of [...v.requisitos, ...v.diferenciais]) {
      if (/\bcnh\b/i.test(h)) continue;
      const chave = h.toLowerCase();
      const atual = contagem.get(chave) ?? { nome: h, n: 0 };
      atual.n += 1;
      contagem.set(chave, atual);
    }
  }
  return [...contagem.values()]
    .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, limite)
    .map((x) => x.nome);
}
