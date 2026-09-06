/**
 * Aritmetica monetaria em inteiros.
 *
 * Regra do projeto: dinheiro e SEMPRE um inteiro em centavos. Ponto flutuante
 * so aparece na formatacao para a tela. Isso elimina toda uma classe de bugs
 * de "0,1 + 0,2" que, em um jogo de aposta, viram divergencia de caixa.
 *
 * Premios sao expressos em centesimos da aposta (x100). A conversao para
 * centavos e uma multiplicacao seguida de divisao por 100 com arredondamento
 * meio-para-cima deterministico.
 */

/** Maior inteiro seguro para dinheiro; acima disso a soma deixa de ser exata. */
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

/**
 * Converte um premio expresso em centesimos da aposta para centavos.
 *
 * Com apostas multiplas de 20 centavos e premios multiplos de 5 (invariantes
 * garantidas por config.js e checadas em teste), o produto e sempre multiplo
 * de 100 e a divisao e exata. O arredondamento existe apenas como rede de
 * seguranca para multiplicadores de orbe arbitrarios.
 *
 * @param {number} betCents  Aposta total em centavos (inteiro > 0).
 * @param {number} payX100   Premio em centesimos da aposta (inteiro >= 0).
 * @returns {number} centavos (inteiro >= 0)
 */
export function payToCents(betCents, payX100) {
  assertInt(betCents, 'betCents');
  assertInt(payX100, 'payX100');
  const product = betCents * payX100;
  if (product > MAX_SAFE_CENTS) {
    throw new RangeError(`Overflow monetario: ${betCents} x ${payX100} excede o inteiro seguro.`);
  }
  return Math.round(product / 100);
}

/**
 * Multiplica um valor em centavos por um multiplicador inteiro (orbe, global).
 * @param {number} cents
 * @param {number} multiplier inteiro >= 1
 * @returns {number}
 */
export function applyMultiplier(cents, multiplier) {
  assertInt(cents, 'cents');
  assertInt(multiplier, 'multiplier');
  if (multiplier < 1) throw new RangeError(`Multiplicador deve ser >= 1, recebido ${multiplier}.`);
  const product = cents * multiplier;
  if (product > MAX_SAFE_CENTS) {
    throw new RangeError(`Overflow monetario ao aplicar multiplicador ${multiplier}.`);
  }
  return product;
}

/**
 * @param {number} value
 * @param {string} name
 */
export function assertInt(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} deve ser um inteiro, recebido ${value}.`);
  }
  if (value < 0) {
    throw new RangeError(`${name} nao pode ser negativo, recebido ${value}.`);
  }
}

/**
 * Formata centavos para exibicao (pt-BR).
 * @param {number} cents
 * @param {string} [locale]
 * @param {string} [currency]
 */
export function formatCents(cents, locale = 'pt-BR', currency = 'BRL') {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Formata um ganho como multiplo da aposta ("12,50x").
 * @param {number} winCents
 * @param {number} betCents
 */
export function formatMultiplier(winCents, betCents) {
  if (betCents <= 0) return '0x';
  const x = winCents / betCents;
  return `${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}
