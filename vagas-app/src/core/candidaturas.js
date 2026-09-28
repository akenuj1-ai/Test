/**
 * Acompanhamento das candidaturas: onde cada vaga está no processo.
 *
 * Quem manda 40 currículos perde a conta de quem respondeu. Aqui cada vaga
 * salva tem uma etapa, uma data e uma próxima ação sugerida.
 */

/** @typedef {'salva' | 'enviada' | 'entrevista' | 'proposta' | 'contratado' | 'encerrada'} Etapa */

/**
 * @typedef {Object} Candidatura
 * @property {string} vagaId
 * @property {Etapa} etapa
 * @property {string} atualizadaEm  AAAA-MM-DD
 * @property {string} [nota]
 */

/** @type {{ id: Etapa, nome: string, proximo: string }[]} */
export const ETAPAS = [
  { id: 'salva', nome: 'Salva', proximo: 'Gere o currículo adaptado e envie a candidatura.' },
  { id: 'enviada', nome: 'Enviada', proximo: 'Sem resposta em 7 dias? Mande uma mensagem educada perguntando do processo.' },
  { id: 'entrevista', nome: 'Entrevista', proximo: 'Treine as perguntas da aba Entrevista e separe documentos.' },
  { id: 'proposta', nome: 'Proposta', proximo: 'Confira salário, benefícios e horário por escrito antes de aceitar.' },
  { id: 'contratado', nome: 'Contratado 🎉', proximo: 'Parabéns! Pause sua assinatura Pro sem custo.' },
  { id: 'encerrada', nome: 'Encerrada', proximo: 'Faz parte. Veja o que faltou na nota de chance e siga para a próxima.' },
];

/**
 * Coloca (ou move) uma vaga numa etapa. Devolve lista nova.
 * @param {Candidatura[]} lista
 * @param {string} vagaId
 * @param {Etapa} etapa
 * @param {Date} [hoje]
 * @returns {Candidatura[]}
 */
export function moverPara(lista, vagaId, etapa, hoje = new Date()) {
  if (!ETAPAS.some((e) => e.id === etapa)) throw new RangeError(`Etapa desconhecida: ${etapa}`);
  const atualizadaEm = hoje.toISOString().slice(0, 10);
  const existe = lista.some((c) => c.vagaId === vagaId);
  if (!existe) return [...lista, { vagaId, etapa, atualizadaEm }];
  return lista.map((c) => (c.vagaId === vagaId ? { ...c, etapa, atualizadaEm } : c));
}

/**
 * @param {Candidatura[]} lista
 * @param {string} vagaId
 */
export function remover(lista, vagaId) {
  return lista.filter((c) => c.vagaId !== vagaId);
}

/**
 * Quantas candidaturas em cada etapa.
 * @param {Candidatura[]} lista
 * @returns {Record<Etapa, number>}
 */
export function resumoPorEtapa(lista) {
  const r = /** @type {Record<Etapa, number>} */ (Object.fromEntries(ETAPAS.map((e) => [e.id, 0])));
  for (const c of lista) r[c.etapa] += 1;
  return r;
}

/**
 * Candidaturas enviadas há 7 dias ou mais sem mudança: hora de cobrar retorno.
 * @param {Candidatura[]} lista
 * @param {Date} [hoje]
 */
export function precisamDeRetorno(lista, hoje = new Date()) {
  const limite = new Date(hoje.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  return lista.filter((c) => c.etapa === 'enviada' && c.atualizadaEm <= limite);
}
