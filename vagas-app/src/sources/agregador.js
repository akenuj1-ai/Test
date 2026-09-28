/**
 * Junta várias fontes de vagas numa busca só.
 *
 * - consulta todas ao mesmo tempo;
 * - uma fonte lenta ou fora do ar não derruba as outras (tempo limite);
 * - remove a mesma vaga anunciada em mais de um lugar;
 * - guarda o resultado por alguns minutos, porque as APIs têm cota e a
 *   mesma busca ("motorista São Paulo") se repete muito.
 */

import { removerRepetidas } from '../core/busca.js';
import { normalizar } from '../core/text.js';

/** @typedef {import('../core/tipos.js').Vaga} Vaga */

/**
 * @typedef {Object} Fonte
 * @property {string} nome
 * @property {(p: { what: string, where: string, pagina: number }) => Promise<Vaga[]>} buscar
 */

/**
 * @typedef {Object} StatusFonte
 * @property {string} nome
 * @property {boolean} ok
 * @property {number} quantidade
 * @property {number} ms
 * @property {string} [erro]
 */

/**
 * @param {{ fontes: Fonte[], ttlMs?: number, tempoLimiteMs?: number, agora?: () => number, maxCache?: number }} opcoes
 */
export function criarAgregador({ fontes, ttlMs = 10 * 60_000, tempoLimiteMs = 6000, agora = Date.now, maxCache = 200 }) {
  /** @type {Map<string, { quando: number, resultado: { vagas: Vaga[], fontes: StatusFonte[] } }>} */
  const cache = new Map();

  /**
   * @param {Fonte} fonte
   * @param {{ what: string, where: string, pagina: number }} p
   * @returns {Promise<{ vagas: Vaga[], status: StatusFonte }>}
   */
  async function consultar(fonte, p) {
    const inicio = agora();
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    try {
      const limite = new Promise((_, rejeitar) => { timer = setTimeout(() => rejeitar(new Error('tempo esgotado')), tempoLimiteMs); });
      const vagas = /** @type {Vaga[]} */ (await Promise.race([fonte.buscar(p), limite]));
      return { vagas, status: { nome: fonte.nome, ok: true, quantidade: vagas.length, ms: agora() - inicio } };
    } catch (e) {
      return { vagas: [], status: { nome: fonte.nome, ok: false, quantidade: 0, ms: agora() - inicio, erro: e instanceof Error ? e.message : String(e) } };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /**
     * @param {{ what?: string, where?: string, pagina?: number }} params
     */
    async buscar({ what = '', where = '', pagina = 1 }) {
      const chave = `${normalizar(what)}|${normalizar(where)}|${pagina}`;
      const guardado = cache.get(chave);
      if (guardado && agora() - guardado.quando < ttlMs) return { ...guardado.resultado, cache: true };

      const respostas = await Promise.all(fontes.map((f) => consultar(f, { what, where, pagina })));
      const resultado = {
        vagas: removerRepetidas(respostas.flatMap((r) => r.vagas)),
        fontes: respostas.map((r) => r.status),
      };
      // só guarda se alguma fonte respondeu: erro não deve ficar em cache
      if (resultado.fontes.some((f) => f.ok)) {
        if (cache.size >= maxCache) cache.delete(/** @type {string} */ (cache.keys().next().value));
        cache.set(chave, { quando: agora(), resultado });
      }
      return { ...resultado, cache: false };
    },
  };
}
