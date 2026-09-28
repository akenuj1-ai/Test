/**
 * Busca: junta, remove repetidas, filtra, calcula a chance e ordena.
 *
 * Tudo aqui é função pura sobre uma lista de vagas, para a mesma lógica
 * servir à interface, ao servidor e aos testes.
 */

import { normalizar } from './text.js';
import { relevancia } from './relevancia.js';
import { calcularChance } from './match.js';
import { alertasDeGolpe } from './golpe.js';

/** @typedef {import('./tipos.js').Vaga} Vaga */
/** @typedef {import('./tipos.js').Perfil} Perfil */
/** @typedef {import('./tipos.js').Modalidade} Modalidade */

/**
 * @typedef {Object} Filtros
 * @property {string} [texto]           palavras livres (cargo, empresa, habilidade)
 * @property {string} [uf]              '' = todos
 * @property {Modalidade[]} [modalidades]  vazio = todas
 * @property {string[]} [contratos]     vazio = todos
 * @property {number} [salarioMin]      centavos
 * @property {number} [diasMax]         publicadas nos últimos N dias
 * @property {boolean} [so50mais]       só empresas que valorizam experiência
 * @property {boolean} [esconderSuspeitas]
 * @property {'relevancia' | 'chance' | 'recentes' | 'salario'} [ordenar]  padrão: relevância com texto, chance com perfil
 */

/**
 * @typedef {Object} ItemBusca
 * @property {Vaga} vaga
 * @property {import('./match.js').Resultado | null} chance  null sem perfil
 * @property {import('./golpe.js').Alerta[]} alertas
 * @property {number} relevancia     o quanto casa com o texto buscado (0 = não casa)
 */

/**
 * Remove vagas repetidas, comuns quando várias fontes anunciam a mesma vaga.
 * Mantém a primeira ocorrência.
 * @param {Vaga[]} vagas
 */
export function removerRepetidas(vagas) {
  const vistas = new Set();
  return vagas.filter((v) => {
    const chave = [v.titulo, v.empresa, v.cidade].map(normalizar).join('|');
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

/**
 * @param {Vaga[]} vagas
 * @param {Filtros} filtros
 * @param {Perfil | null} perfil
 * @param {Date} [hoje]
 * @returns {ItemBusca[]}
 */
export function buscar(vagas, filtros, perfil, hoje = new Date()) {
  const f = filtros;
  const limiteData = f.diasMax ? new Date(hoje.getTime() - f.diasMax * 86_400_000).toISOString().slice(0, 10) : '';

  /** @type {ItemBusca[]} */
  const itens = [];
  for (const vaga of removerRepetidas(vagas)) {
    const rel = f.texto ? relevancia(vaga, f.texto) : 1;
    if (rel === 0) continue;
    if (f.uf && vaga.uf !== f.uf && vaga.modalidade !== 'remoto') continue;
    if (f.modalidades?.length && !f.modalidades.includes(vaga.modalidade)) continue;
    if (f.contratos?.length && !f.contratos.includes(vaga.contrato)) continue;
    if (f.salarioMin && (vaga.salarioMax ?? vaga.salarioMin ?? Infinity) < f.salarioMin) continue;
    if (limiteData && vaga.publicadaEm < limiteData) continue;
    if (f.so50mais && !vaga.valorizaExperiencia) continue;

    const alertas = alertasDeGolpe(vaga);
    if (f.esconderSuspeitas && alertas.some((a) => a.nivel === 'grave')) continue;

    itens.push({ vaga, chance: perfil ? calcularChance(perfil, vaga) : null, alertas, relevancia: rel });
  }

  const ordem = f.ordenar ?? (f.texto?.trim() ? 'relevancia' : perfil ? 'chance' : 'recentes');
  // relevância pura empataria demais; a chance desempata e dá peso ao perfil
  const pontuacao = (/** @type {ItemBusca} */ i) => i.relevancia * 100 + (i.chance?.nota ?? 0) * 0.5;
  const recentes = (/** @type {ItemBusca} */ a, /** @type {ItemBusca} */ b) => b.vaga.publicadaEm.localeCompare(a.vaga.publicadaEm);
  const suspeita = (/** @type {ItemBusca} */ i) => (i.alertas.some((a) => a.nivel === 'grave') ? 1 : 0);

  itens.sort((a, b) => {
    // vaga suspeita vai sempre para o fim, qualquer que seja a ordem
    const s = suspeita(a) - suspeita(b);
    if (s !== 0) return s;
    if (ordem === 'relevancia') return pontuacao(b) - pontuacao(a) || recentes(a, b);
    if (ordem === 'chance') return (b.chance?.nota ?? 0) - (a.chance?.nota ?? 0) || recentes(a, b);
    if (ordem === 'salario') return (b.vaga.salarioMax ?? b.vaga.salarioMin ?? 0) - (a.vaga.salarioMax ?? a.vaga.salarioMin ?? 0) || recentes(a, b);
    return recentes(a, b);
  });
  return itens;
}
