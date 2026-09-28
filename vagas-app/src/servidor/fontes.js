/**
 * Fontes de vagas reais ligadas pelas variáveis de ambiente. Usado pelo
 * servidor e pelo envio de alertas, para os dois buscarem no mesmo lugar.
 */

import { buscarAdzuna } from '../sources/adzuna.js';
import { buscarJooble } from '../sources/jooble.js';
import { buscarCareerjet } from '../sources/careerjet.js';

/**
 * @param {Record<string, string | undefined>} env
 * @returns {import('../sources/agregador.js').Fonte[]}
 */
export function fontesDoAmbiente(env) {
  /** @type {import('../sources/agregador.js').Fonte[]} */
  const fontes = [];
  if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) {
    const appId = env.ADZUNA_APP_ID;
    const appKey = env.ADZUNA_APP_KEY;
    fontes.push({ nome: 'Adzuna', buscar: (p) => buscarAdzuna({ ...p, appId, appKey }) });
  }
  if (env.JOOBLE_KEY) {
    const chave = env.JOOBLE_KEY;
    fontes.push({ nome: 'Jooble', buscar: (p) => buscarJooble({ ...p, chave }) });
  }
  if (env.CAREERJET_AFFID) {
    const affid = env.CAREERJET_AFFID;
    fontes.push({ nome: 'Careerjet', buscar: (p) => buscarCareerjet({ ...p, affid }) });
  }
  return fontes;
}
