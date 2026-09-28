/**
 * Detector de vaga suspeita.
 *
 * Quem está desempregado é alvo fácil: "taxa de cadastro", "curso
 * obrigatório", salário irreal. Nenhum site grande avisa isso de forma clara,
 * e é aqui que o app ganha confiança. As regras são simples e explicáveis:
 * cada alerta diz exatamente o que chamou a atenção.
 */

import { normalizar } from './text.js';

/** @typedef {import('./tipos.js').Vaga} Vaga */

/**
 * @typedef {Object} Alerta
 * @property {'grave' | 'atencao'} nivel
 * @property {string} motivo
 */

/** [expressão sobre texto normalizado, nível, motivo] */
const REGRAS_TEXTO = /** @type {[RegExp, Alerta['nivel'], string][]} */ ([
  [/\b(taxa|pagar|pague|pagamento|deposito|pix)\b.{0,40}\b(cadastro|inscricao|kit|material|uniforme|exame|curso)\b/,
    'grave', 'Pede pagamento para participar. Empresa séria nunca cobra do candidato.'],
  [/\bcurso\b.{0,30}\bobrigatorio\b|\bobrigatorio\b.{0,30}\bcurso\b/,
    'grave', 'Exige curso pago antes da contratação.'],
  [/\bdados bancarios\b|\bsenha\b|\bcartao de credito\b/,
    'grave', 'Pede dados bancários ou senha antes de contratar.'],
  [/\bganhe\b.{0,20}\b(por semana|por dia|sem sair de casa)\b/,
    'atencao', 'Promessa de ganho fácil e rápido.'],
  [/\bvagas limitadas\b|\bcorra\b|\bultimas vagas\b|\bso hoje\b/,
    'atencao', 'Pressão para decidir rápido.'],
]);

/** Acima disto, sem experiência nem faculdade exigida, é bom demais para ser verdade. */
const SALARIO_IRREAL_SEM_REQUISITO = 800_000; // R$ 8.000

/**
 * Lista os sinais de golpe de uma vaga. Lista vazia = nada suspeito.
 * @param {Vaga} vaga
 * @returns {Alerta[]}
 */
export function alertasDeGolpe(vaga) {
  const texto = normalizar(`${vaga.titulo} ${vaga.descricao} ${vaga.contato ?? ''}`);
  /** @type {Alerta[]} */
  const alertas = [];

  for (const [re, nivel, motivo] of REGRAS_TEXTO) {
    if (re.test(texto)) alertas.push({ nivel, motivo });
  }

  const teto = vaga.salarioMax ?? vaga.salarioMin ?? 0;
  const semExigencia = vaga.experienciaMin === 0 && (vaga.escolaridadeMin === 'fundamental' || vaga.escolaridadeMin === 'medio');
  if (semExigencia && teto > SALARIO_IRREAL_SEM_REQUISITO) {
    alertas.push({ nivel: 'grave', motivo: 'Salário muito acima do normal para uma vaga sem exigência nenhuma.' });
  }

  if (/whatsapp/.test(normalizar(vaga.contato ?? '')) && !vaga.url) {
    alertas.push({ nivel: 'atencao', motivo: 'Contato só por WhatsApp, sem site ou canal oficial da empresa.' });
  }

  return alertas;
}

/**
 * Vaga com pelo menos um alerta grave.
 * @param {Vaga} vaga
 */
export function ehSuspeita(vaga) {
  return alertasDeGolpe(vaga).some((a) => a.nivel === 'grave');
}
