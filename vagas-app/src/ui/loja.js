/**
 * Armazenamento local do navegador. Toda leitura e escrita é protegida:
 * em janela anônima ou com dados bloqueados o app continua funcionando,
 * só não lembra de nada ao recarregar.
 */

const PREFIXO = 'vagacerta:';

/**
 * @template T
 * @param {string} chave
 * @param {T} padrao
 * @returns {T}
 */
export function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    return bruto == null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

/**
 * @param {string} chave
 * @param {unknown} valor
 */
export function gravar(chave, valor) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: segue só na memória
  }
}
