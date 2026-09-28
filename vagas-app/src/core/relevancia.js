/**
 * Entender o que a pessoa digitou, do jeito que ela digita.
 *
 * Quem procura emprego escreve "motorista" e a vaga diz "condutor"; escreve
 * "adm" e a vaga diz "administrativo"; digita no celular e sai "motorsita".
 * Busca por palavra exata perde essas vagas. Aqui cada termo casa por:
 *
 *   1. palavra igual                       (peso cheio)
 *   2. sinônimo do mesmo grupo             (quase cheio)
 *   3. começo de palavra ("eletri" → "eletricista")
 *   4. erro de digitação (1 letra; 2 em palavras longas)
 *
 * e casar no título vale mais que casar nos requisitos.
 */

import { normalizar, palavras } from './text.js';

/** @typedef {import('./tipos.js').Vaga} Vaga */

/** Grupos de palavras que o candidato usa como equivalentes. Tudo normalizado. */
const GRUPOS = [
  ['motorista', 'condutor', 'chofer', 'entregador'],
  ['motoboy', 'motociclista', 'entregador'],
  ['adm', 'administrativo', 'administrativa', 'escritorio'],
  ['ti', 'tecnologia', 'informatica', 'desenvolvedor', 'programador', 'dev', 'software'],
  ['vendedor', 'vendedora', 'vendas', 'comercial', 'consultor', 'consultora'],
  ['limpeza', 'faxina', 'faxineira', 'faxineiro', 'diarista', 'conservacao', 'zelador'],
  ['porteiro', 'portaria', 'controlador'],
  ['enfermagem', 'enfermeiro', 'enfermeira'],
  ['cozinha', 'cozinheiro', 'cozinheira', 'chef', 'alimentacao'],
  ['caixa', 'operador', 'operadora', 'pdv'],
  ['pedreiro', 'obra', 'obras', 'construcao', 'servente', 'alvenaria'],
  ['remoto', 'remota', 'home', 'teletrabalho', 'distancia'],
  ['atendente', 'atendimento', 'recepcionista', 'recepcao', 'telemarketing', 'sac'],
  ['vigilante', 'seguranca', 'vigia'],
  ['cuidador', 'cuidadora', 'idosos', 'idoso'],
  ['professor', 'professora', 'educacao', 'ensino', 'docente'],
  ['mecanico', 'mecanica', 'manutencao'],
  ['estagio', 'estagiario', 'estagiaria'],
  ['financeiro', 'financeira', 'financas', 'contabil', 'contador', 'contadora'],
  ['rh', 'recursos', 'humanos', 'recrutamento'],
  ['designer', 'design', 'grafico', 'grafica'],
  ['dados', 'analista', 'bi'],
  ['estoque', 'almoxarife', 'almoxarifado', 'logistica'],
];

/** Expressões de várias palavras trocadas pela palavra que a vaga usa. */
const EXPRESSOES = /** @type {[RegExp, string][]} */ ([
  [/\bhome office\b/g, 'remoto'],
  [/\btrabalho de casa\b|\bde casa\b/g, 'remoto'],
  [/\bcarteira assinada\b|\bregistro em carteira\b/g, 'clt'],
  [/\bservicos gerais\b/g, 'limpeza'],
  [/\bprimeiro emprego\b|\bsem experiencia\b/g, 'treinamento'],
  [/\bjovem aprendiz\b/g, 'aprendiz'],
]);

/**
 * Normaliza e troca expressões conhecidas.
 * @param {string} texto
 */
export function traduzirExpressoes(texto) {
  let t = normalizar(texto);
  for (const [re, troca] of EXPRESSOES) t = t.replace(re, troca);
  return t;
}

/** palavra → sinônimos (sem ela mesma) */
const SINONIMOS = new Map();
for (const grupo of GRUPOS) {
  for (const p of grupo) {
    const atuais = SINONIMOS.get(p) ?? new Set();
    for (const q of grupo) if (q !== p) atuais.add(q);
    SINONIMOS.set(p, atuais);
  }
}

/** @param {string} palavra */
export function sinonimos(palavra) {
  return [...(SINONIMOS.get(normalizar(palavra)) ?? [])];
}

/**
 * Distância de edição limitada: devolve `limite + 1` assim que passar do
 * limite, para não gastar tempo comparando palavras muito diferentes.
 * @param {string} a
 * @param {string} b
 * @param {number} limite
 */
export function distancia(a, b, limite) {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  /** @type {number[]} */
  let antes = [];
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      // troca de duas letras vizinhas ("motorsita") conta como um erro só
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        atual[j] = Math.min(atual[j], antes[j - 2] + 1);
      }
      menor = Math.min(menor, atual[j]);
    }
    if (menor > limite) return limite + 1;
    antes = anterior;
    anterior = atual;
  }
  return anterior[b.length];
}

/** Erros de digitação tolerados para uma palavra deste tamanho. */
const tolerancia = (/** @type {number} */ n) => (n >= 8 ? 2 : n >= 5 ? 1 : 0);

/**
 * Quanto um termo casa com um conjunto de palavras (0 a 1).
 * @param {string} termo normalizado
 * @param {string[]} alvo palavras normalizadas
 */
export function casamento(termo, alvo) {
  if (alvo.includes(termo)) return 1;
  const sin = SINONIMOS.get(termo);
  if (sin && alvo.some((p) => sin.has(p))) return 0.85;
  if (termo.length >= 3 && alvo.some((p) => p.startsWith(termo))) return 0.75;
  const tol = tolerancia(termo.length);
  if (!tol) return 0;
  if (alvo.some((p) => distancia(termo, p, tol) <= tol)) return 0.6;
  // erro de digitação numa palavra do vocabulário ("faxinera" → "faxineira"),
  // seguido de sinônimo ("faxineira" → "limpeza")
  for (const [palavra, grupo] of SINONIMOS) {
    if (distancia(termo, palavra, tol) <= tol && alvo.some((p) => p === palavra || grupo.has(p))) return 0.5;
  }
  return 0;
}

/** Palavras de uma vaga, separadas pelo peso de onde aparecem. */
const cacheCampos = new WeakMap();
/** @param {Vaga} vaga */
function campos(vaga) {
  let c = cacheCampos.get(vaga);
  if (!c) {
    c = {
      titulo: palavras(vaga.titulo),
      meio: palavras(`${vaga.area} ${vaga.requisitos.join(' ')} ${vaga.empresa}`),
      resto: palavras(`${vaga.diferenciais.join(' ')} ${vaga.cidade} ${vaga.descricao} ${vaga.modalidade} ${vaga.contrato} ${vaga.beneficios.join(' ')}`),
    };
    cacheCampos.set(vaga, c);
  }
  return c;
}

/**
 * Relevância da vaga para a busca: 0 = não casa (algum termo não foi achado
 * em lugar nenhum). Quanto maior, melhor. Busca vazia = 1 para toda vaga.
 * @param {Vaga} vaga
 * @param {string} texto
 */
export function relevancia(vaga, texto) {
  const termos = palavras(traduzirExpressoes(texto));
  if (termos.length === 0) return 1;
  const c = campos(vaga);
  let total = 0;
  for (const t of termos) {
    const melhor = Math.max(casamento(t, c.titulo) * 3, casamento(t, c.meio) * 1.5, casamento(t, c.resto));
    if (melhor === 0) return 0;
    total += melhor;
  }
  return total / termos.length;
}

/**
 * Sugestões para completar o que está sendo digitado: títulos de vaga e
 * áreas que existem na lista, os mais frequentes primeiro.
 * @param {Vaga[]} vagas
 * @param {string} digitado
 * @param {number} [limite]
 */
export function sugestoes(vagas, digitado, limite = 6) {
  const alvo = normalizar(digitado);
  /** @type {Map<string, number>} */
  const contagem = new Map();
  for (const v of vagas) {
    for (const s of [v.titulo, v.area]) contagem.set(s, (contagem.get(s) ?? 0) + 1);
  }
  const lista = [...contagem.entries()].filter(([s]) => !alvo || normalizar(s).split(' ').some((p) => p.startsWith(alvo)) || normalizar(s).startsWith(alvo));
  lista.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  return lista.slice(0, limite).map(([s]) => s);
}
