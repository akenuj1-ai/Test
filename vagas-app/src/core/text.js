/**
 * Utilitários de texto usados em toda a comparação perfil × vaga.
 *
 * Tudo que compara palavras passa por `normalizar`: minúsculas, sem acento,
 * sem pontuação. Assim "Eletricista Predial" casa com "eletricista predial"
 * e "Atendimento ao cliente" casa com "atendimento ao cliente".
 */

/** Palavras que não ajudam a comparar nada. */
const VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para',
  'com', 'por', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'ao', 'aos', 'ou', 'the', 'and',
]);

/** @param {string} texto */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

/**
 * Palavras significativas do texto, sem repetição.
 * @param {string} texto
 * @returns {string[]}
 */
export function palavras(texto) {
  const lista = normalizar(texto).split(' ').filter((p) => p.length > 1 && !VAZIAS.has(p));
  return [...new Set(lista)];
}

/**
 * Dois termos "batem" quando um contém o outro depois de normalizados, ou
 * quando todas as palavras do mais curto aparecem no mais longo.
 * Ex.: "excel" bate com "excel avançado"; "pacote office" bate com "office".
 *
 * @param {string} a
 * @param {string} b
 */
export function termosBatem(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const pa = palavras(a);
  const pb = palavras(b);
  const [curto, longo] = pa.length <= pb.length ? [pa, new Set(pb)] : [pb, new Set(pa)];
  return curto.length > 0 && curto.every((p) => longo.has(p));
}

/**
 * Semelhança entre dois textos curtos (0 a 1), pela fração de palavras do
 * primeiro que aparecem no segundo.
 * @param {string} a
 * @param {string} b
 */
export function semelhanca(a, b) {
  const pa = palavras(a);
  if (pa.length === 0) return 0;
  const pb = new Set(palavras(b));
  return pa.filter((p) => pb.has(p)).length / pa.length;
}

/**
 * Valor em centavos como "R$ 1.234,56".
 * @param {number} centavos
 */
export function formatarReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Faixa salarial legível, aceitando lados ausentes.
 * @param {number | null} min centavos
 * @param {number | null} max centavos
 */
export function formatarSalario(min, max) {
  if (min == null && max == null) return 'A combinar';
  if (min != null && max != null && min !== max) return `${formatarReais(min)} a ${formatarReais(max)}`;
  return formatarReais(/** @type {number} */ (min ?? max));
}
