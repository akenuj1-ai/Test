/**
 * Planos e limites de uso.
 *
 * Modelo: buscar vagas e ver a nota de chance é grátis e ilimitado — é o que
 * traz gente. O que dá trabalho (currículo adaptado, carta, preparação para
 * entrevista, alertas) tem uma cota diária no grátis e é ilimitado no Pro.
 *
 * O uso é contado por dia (AAAA-MM-DD); o dia seguinte zera a cota.
 */

/** @typedef {'curriculo' | 'carta' | 'entrevista' | 'alerta'} Recurso */
/** @typedef {'gratis' | 'pro'} IdPlano */

/**
 * @typedef {Object} Plano
 * @property {IdPlano} id
 * @property {string} nome
 * @property {number} precoMensal     centavos
 * @property {Record<Recurso, number>} limiteDiario  Infinity = ilimitado
 * @property {string[]} inclui
 */

/** @type {Record<IdPlano, Plano>} */
export const PLANOS = {
  gratis: {
    id: 'gratis',
    nome: 'Grátis',
    precoMensal: 0,
    limiteDiario: { curriculo: 1, carta: 1, entrevista: 1, alerta: 0 },
    inclui: [
      'Busca de vagas ilimitada',
      'Nota de chance em todas as vagas',
      'Alerta de vaga golpe',
      '1 currículo adaptado por dia',
      '1 carta e 1 preparação para entrevista por dia',
    ],
  },
  pro: {
    id: 'pro',
    nome: 'Pro',
    precoMensal: 1990,
    limiteDiario: { curriculo: Infinity, carta: Infinity, entrevista: Infinity, alerta: Infinity },
    inclui: [
      'Tudo do grátis',
      'Currículos adaptados ilimitados',
      'Cartas e preparação para entrevista ilimitadas',
      'Alerta de vagas novas no WhatsApp ou e-mail',
      'Pausa grátis quando você for contratado',
    ],
  },
};

/** Garantia: devolução integral se pedir nos primeiros dias. */
export const DIAS_GARANTIA = 7;

/**
 * Uso registrado: { 'AAAA-MM-DD': { curriculo: 1, ... } }
 * @typedef {Record<string, Partial<Record<Recurso, number>>>} Uso
 */

/** @param {Date} hoje */
export const diaDe = (hoje) => hoje.toISOString().slice(0, 10);

/**
 * Quantos usos ainda restam hoje.
 * @param {IdPlano} plano
 * @param {Recurso} recurso
 * @param {Uso} uso
 * @param {Date} [hoje]
 */
export function restantes(plano, recurso, uso, hoje = new Date()) {
  const limite = PLANOS[plano].limiteDiario[recurso];
  const usados = uso[diaDe(hoje)]?.[recurso] ?? 0;
  return Math.max(0, limite - usados);
}

/**
 * @param {IdPlano} plano
 * @param {Recurso} recurso
 * @param {Uso} uso
 * @param {Date} [hoje]
 */
export function podeUsar(plano, recurso, uso, hoje = new Date()) {
  return restantes(plano, recurso, uso, hoje) > 0;
}

/**
 * Novo registro de uso com mais um uso do recurso hoje. Guarda só o dia
 * atual, para o armazenamento não crescer para sempre.
 * @param {Recurso} recurso
 * @param {Uso} uso
 * @param {Date} [hoje]
 * @returns {Uso}
 */
export function registrarUso(recurso, uso, hoje = new Date()) {
  const dia = diaDe(hoje);
  const atual = uso[dia] ?? {};
  return { [dia]: { ...atual, [recurso]: (atual[recurso] ?? 0) + 1 } };
}
