/**
 * Limite de requisições por cliente (balde de fichas).
 *
 * Cada cliente começa com `capacidade` fichas; cada requisição gasta uma; as
 * fichas voltam a `porSegundo`. Protege as APIs de vagas (que têm cota) e o
 * servidor de abuso, sem atrapalhar uso normal.
 */

/**
 * @param {{ capacidade: number, porSegundo: number, agora?: () => number, maxClientes?: number }} opcoes
 */
export function criarLimitador({ capacidade, porSegundo, agora = Date.now, maxClientes = 10_000 }) {
  /** @type {Map<string, { fichas: number, em: number }>} */
  const baldes = new Map();

  return {
    /**
     * Gasta uma ficha. Devolve se pode seguir e, se não, em quantos segundos tentar.
     * @param {string} chave
     */
    consumir(chave) {
      const t = agora();
      let b = baldes.get(chave);
      if (!b) {
        if (baldes.size >= maxClientes) baldes.delete(/** @type {string} */ (baldes.keys().next().value));
        b = { fichas: capacidade, em: t };
        baldes.set(chave, b);
      }
      b.fichas = Math.min(capacidade, b.fichas + ((t - b.em) / 1000) * porSegundo);
      b.em = t;
      if (b.fichas >= 1) {
        b.fichas -= 1;
        return { ok: true, tenteEm: 0 };
      }
      return { ok: false, tenteEm: Math.ceil((1 - b.fichas) / porSegundo) };
    },
  };
}
