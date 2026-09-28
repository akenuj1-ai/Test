/**
 * Conversões que toda fonte de vagas precisa: estado por nome, local em
 * texto livre, salário em texto, HTML nos anúncios, vaga remota.
 */

import { normalizar } from '../core/text.js';

/** Nome do estado (normalizado) → sigla. */
export const UF_POR_NOME = /** @type {Record<string, string>} */ ({
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
});
const SIGLAS = new Set(Object.values(UF_POR_NOME));

/**
 * Hash curto e estável (FNV-1a) para dar id a vagas de fontes que não têm.
 * @param {string} texto
 */
export function hashTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** @param {string} texto */
export function limparHtml(texto) {
  return String(texto ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "Campinas, SP", "Campinas - São Paulo", "São Paulo" → { cidade, uf }.
 * @param {string} local
 */
export function lerLocal(local) {
  const partes = String(local ?? '').split(/\s*[,\-–/]\s*/).map((p) => p.trim()).filter(Boolean);
  let uf = '';
  const resto = [];
  for (const p of partes) {
    const sigla = p.toUpperCase();
    if (!uf && SIGLAS.has(sigla) && p.length === 2) uf = sigla;
    else if (!uf && UF_POR_NOME[normalizar(p)] && partes.length > 1) uf = UF_POR_NOME[normalizar(p)];
    else if (normalizar(p) !== 'brasil' && normalizar(p) !== 'brazil') resto.push(p);
  }
  // "São Paulo" sozinho: é a cidade, e o estado é o de mesmo nome
  if (!uf && resto.length === 1 && UF_POR_NOME[normalizar(resto[0])]) uf = UF_POR_NOME[normalizar(resto[0])];
  return { cidade: resto[0] ?? '', uf: uf || 'BR' };
}

/**
 * "R$ 2.500 - R$ 3.000 por mês", "R$ 36 mil por ano", "R$ 1.800,50" →
 * centavos por mês. Anuais (pelo texto ou pelo valor) viram mensais.
 * @param {string} texto
 * @returns {{ min: number | null, max: number | null }}
 */
export function lerSalario(texto) {
  const t = normalizar(texto).replace(/(\d)\s+(\d{3})\b/g, '$1$2');
  const numeros = [...String(texto ?? '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*(mil|k)?/gi)]
    .map((m) => {
      let v = Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2]) / 100 : 0);
      if (m[3]) v *= 1000;
      return v;
    })
    .filter((v) => v >= 100);
  if (numeros.length === 0) return { min: null, max: null };
  const anual = /\b(ano|anual|year|yearly)\b/.test(t);
  const porHora = /\b(hora|hour)\b/.test(t);
  const mensal = numeros.map((v) => Math.round((porHora ? v * 220 : anual || v >= 15_000 ? v / 12 : v)) * 100);
  return { min: Math.min(...mensal), max: Math.max(...mensal) };
}

/** @param {string} texto */
export const pareceRemoto = (texto) => /\b(remoto|remota|home office|teletrabalho|100 online)\b/.test(normalizar(texto));

/** @param {string} texto */
export const pedeCnh = (texto) => /\bcnh\b|\bhabilitacao\b/.test(normalizar(texto));

/**
 * Habilidades comuns reconhecíveis em texto livre. Lista curta de propósito:
 * é melhor não achar um requisito do que inventar um.
 */
const HABILIDADES_CONHECIDAS = [
  'excel', 'pacote office', 'power bi', 'sql', 'python', 'javascript', 'react', 'java', 'html', 'css', 'git',
  'atendimento ao cliente', 'vendas', 'negociação', 'cnh', 'nr-10', 'nr-35', 'nr-12', 'nr-18',
  'controle de estoque', 'empilhadeira', 'contas a pagar', 'contas a receber', 'departamento pessoal',
  'recrutamento e seleção', 'inglês', 'espanhol', 'autocad', 'photoshop', 'illustrator', 'figma',
  'solda', 'elétrica', 'hidráulica', 'coren', 'crc', 'direção defensiva', 'telemarketing',
];

/** @param {string} descricao */
export function extrairRequisitos(descricao) {
  const texto = ` ${normalizar(descricao)} `;
  return HABILIDADES_CONHECIDAS.filter((h) => texto.includes(` ${normalizar(h)} `));
}

/**
 * Esqueleto de Vaga com os campos que APIs externas não informam.
 * @param {Partial<import('../core/tipos.js').Vaga>} campos
 * @returns {import('../core/tipos.js').Vaga}
 */
export function vagaExterna(campos) {
  const descricao = campos.descricao ?? '';
  const remoto = pareceRemoto(`${campos.titulo} ${descricao}`);
  return {
    id: '', titulo: '', empresa: 'Empresa não informada', cidade: '', uf: 'BR',
    modalidade: remoto ? 'remoto' : 'presencial', contrato: 'CLT',
    salarioMin: null, salarioMax: null, area: 'Outros',
    requisitos: extrairRequisitos(descricao), diferenciais: [],
    escolaridadeMin: 'fundamental', experienciaMin: 0, beneficios: [], descricao,
    publicadaEm: '', fonte: '', url: '', valorizaExperiencia: false,
    exigeCnh: pedeCnh(descricao),
    ...campos,
    ...(remoto && !campos.cidade ? { cidade: 'Remoto' } : {}),
  };
}
