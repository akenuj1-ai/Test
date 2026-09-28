/**
 * Nota de chance: o quanto uma vaga combina com o perfil, de 0 a 100.
 *
 * O diferencial não é o número, é a explicação. Cada ponto ganho vira um
 * "motivo" e cada ponto perdido vira um "falta", para a pessoa saber o que
 * melhorar em vez de mandar currículo às cegas.
 *
 * Pesos (somam 100):
 *   requisitos 40 · cargo/área 20 · local 15 · salário 10 · experiência 10 · escolaridade 5
 *
 * Um requisito eliminatório não atendido (CNH, local incompatível) derruba a
 * nota para no máximo 35, porque a candidatura quase certamente não avança.
 */

import { termosBatem, semelhanca, normalizar, formatarReais } from './text.js';
import { ESCOLARIDADES, NOME_ESCOLARIDADE } from './tipos.js';

/** @typedef {import('./tipos.js').Vaga} Vaga */
/** @typedef {import('./tipos.js').Perfil} Perfil */

/**
 * @typedef {Object} Resultado
 * @property {number} nota           0 a 100, inteiro
 * @property {'alta' | 'media' | 'baixa'} faixa
 * @property {string[]} motivos      o que conta a favor
 * @property {string[]} faltando     o que conta contra, em linguagem de ação
 * @property {string[]} requisitosAtendidos
 * @property {boolean} eliminatorio  algum requisito eliminatório não foi atendido
 */

export const PESOS = /** @type {const} */ ({
  requisitos: 40, cargo: 20, local: 15, salario: 10, experiencia: 10, escolaridade: 5,
});

export const TETO_ELIMINATORIO = 35;

/**
 * Requisitos que a pessoa atende, considerando habilidades, cargo desejado
 * e experiências anteriores.
 * @param {Perfil} perfil
 * @param {string[]} requisitos
 */
export function requisitosAtendidos(perfil, requisitos) {
  const fontes = [
    ...perfil.habilidades,
    ...perfil.experiencias.map((e) => e.cargo),
    ...(perfil.temCnh ? ['CNH categoria B'] : []),
  ];
  return requisitos.filter((req) => fontes.some((f) => termosBatem(req, f)));
}

/**
 * @param {Perfil} perfil
 * @param {Vaga} vaga
 * @returns {Resultado}
 */
export function calcularChance(perfil, vaga) {
  /** @type {string[]} */ const motivos = [];
  /** @type {string[]} */ const faltando = [];
  let pontos = 0;
  let eliminatorio = false;

  // --- requisitos -------------------------------------------------------
  const atendidos = requisitosAtendidos(perfil, vaga.requisitos);
  const total = vaga.requisitos.length || 1;
  pontos += PESOS.requisitos * (atendidos.length / total);
  if (atendidos.length) motivos.push(`Você tem ${atendidos.length} de ${vaga.requisitos.length} requisitos: ${atendidos.join(', ')}.`);
  for (const req of vaga.requisitos) {
    if (!atendidos.includes(req)) faltando.push(`Requisito: ${req}. Se você tem, coloque no perfil.`);
  }
  const diferenciais = requisitosAtendidos(perfil, vaga.diferenciais);
  if (diferenciais.length) motivos.push(`Diferencial a seu favor: ${diferenciais.join(', ')}.`);

  // --- cargo e área -----------------------------------------------------
  const alvo = `${perfil.cargoDesejado} ${perfil.experiencias.map((e) => e.cargo).join(' ')}`;
  const simCargo = Math.max(semelhanca(vaga.titulo, alvo), semelhanca(perfil.cargoDesejado, vaga.titulo));
  const mesmaArea = perfil.area !== '' && normalizar(perfil.area) === normalizar(vaga.area);
  const cargoPts = Math.min(1, simCargo + (mesmaArea ? 0.5 : 0));
  pontos += PESOS.cargo * cargoPts;
  if (simCargo >= 0.5) motivos.push('O cargo é parecido com o que você procura ou já fez.');
  else if (mesmaArea) motivos.push(`É da sua área (${vaga.area}).`);

  // --- local ------------------------------------------------------------
  const remota = vaga.modalidade === 'remoto';
  const mesmaCidade = normalizar(perfil.cidade) !== '' && normalizar(perfil.cidade) === normalizar(vaga.cidade);
  const mesmoEstado = perfil.uf !== '' && perfil.uf === vaga.uf;
  if (remota) {
    if (perfil.aceitaRemoto === 'nao') {
      faltando.push('A vaga é remota e você marcou que prefere presencial.');
    } else {
      pontos += PESOS.local;
      motivos.push('Vaga remota: dá para trabalhar de casa.');
    }
  } else if (perfil.aceitaRemoto === 'sim') {
    eliminatorio = true;
    faltando.push('Você marcou que só aceita trabalho remoto, e esta vaga não é.');
  } else if (mesmaCidade) {
    pontos += PESOS.local;
    motivos.push(`Fica na sua cidade (${vaga.cidade}).`);
  } else if (mesmoEstado) {
    pontos += PESOS.local * 0.5;
    faltando.push(`Fica em ${vaga.cidade}, fora da sua cidade. Veja o deslocamento.`);
  } else {
    eliminatorio = true;
    faltando.push(`Fica em ${vaga.cidade}/${vaga.uf}, em outro estado.`);
  }

  // --- salário ----------------------------------------------------------
  const teto = vaga.salarioMax ?? vaga.salarioMin;
  if (perfil.salarioMin <= 0) {
    pontos += PESOS.salario;
  } else if (teto == null) {
    pontos += PESOS.salario * 0.5;
  } else if (teto >= perfil.salarioMin) {
    pontos += PESOS.salario;
    motivos.push('O salário atende o que você pediu.');
  } else {
    pontos += PESOS.salario * Math.max(0, teto / perfil.salarioMin - 0.5) * 2 * 0.5;
    faltando.push(`Paga até ${formatarReais(teto)}, abaixo dos ${formatarReais(perfil.salarioMin)} que você pediu.`);
  }

  // --- experiência ------------------------------------------------------
  if (vaga.experienciaMin <= 0 || perfil.anosExperiencia >= vaga.experienciaMin) {
    pontos += PESOS.experiencia;
    if (vaga.experienciaMin > 0) motivos.push(`Pede ${vaga.experienciaMin} ano(s) de experiência e você tem ${perfil.anosExperiencia}.`);
  } else {
    pontos += PESOS.experiencia * (perfil.anosExperiencia / vaga.experienciaMin);
    faltando.push(`Pede ${vaga.experienciaMin} ano(s) de experiência; você informou ${perfil.anosExperiencia}.`);
  }
  if (vaga.valorizaExperiencia && perfil.anosExperiencia >= 10) {
    motivos.push('A empresa valoriza profissionais experientes (50+).');
  }

  // --- escolaridade -----------------------------------------------------
  if (ESCOLARIDADES.indexOf(perfil.escolaridade) >= ESCOLARIDADES.indexOf(vaga.escolaridadeMin)) {
    pontos += PESOS.escolaridade;
  } else {
    faltando.push(`Pede ${NOME_ESCOLARIDADE[vaga.escolaridadeMin].toLowerCase()}.`);
  }

  // --- eliminatórios ----------------------------------------------------
  if (vaga.exigeCnh && !perfil.temCnh) {
    eliminatorio = true;
    faltando.unshift('Exige CNH, e você marcou que não tem.');
  }

  let nota = Math.round(pontos);
  if (eliminatorio) nota = Math.min(nota, TETO_ELIMINATORIO);
  nota = Math.max(0, Math.min(100, nota));

  return {
    nota,
    faixa: nota >= 70 ? 'alta' : nota >= 45 ? 'media' : 'baixa',
    motivos,
    faltando,
    requisitosAtendidos: atendidos,
    eliminatorio,
  };
}
