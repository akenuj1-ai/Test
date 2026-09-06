/**
 * Motor de rodada: maquina de estados que vai do clique em "girar" ate o
 * credito final, incluindo cascatas, orbes multiplicadores, rodadas gratis,
 * re-gatilhos, compra de bonus e teto de ganho maximo.
 *
 * Uma "rodada" (round) e tudo o que decorre de uma unica aposta paga: o giro
 * base mais, se disparadas, todas as rodadas gratis. O jogador so paga uma vez.
 *
 * Regras de multiplicador (definidas aqui de forma explicita):
 *  - Jogo base: os orbes de uma sequencia de cascatas so contam se a sequencia
 *    produziu ganho. O multiplicador da sequencia e a SOMA dos orbes (min. 1).
 *  - Rodadas gratis: os orbes sao sempre acumulados em um multiplicador GLOBAL
 *    que persiste por toda a sessao de rodadas gratis. O ganho de cada
 *    sequencia e multiplicado pelo global vigente apos a coleta daquela
 *    sequencia.
 *
 * Regra do teto: assim que o acumulado da rodada atinge MAX_WIN_X100 vezes a
 * aposta, o valor e travado no teto e a rodada termina imediatamente — rodadas
 * gratis restantes sao descartadas. E o comportamento padrao do mercado e
 * precisa ser visivel ao jogador (o resultado carrega `cappedAtMaxWin`).
 */

import {
  GRID, Sym, REEL_WEIGHTS, ORB_VALUES, ORB_WEIGHTS, ORB_FREQUENCY,
  ANTE_SCATTER_MULTIPLIER, ANTE_COST_X100, BUY_PRICES_X100,
  SCATTER_TRIGGER, SCATTER_RETRIGGER, FREE_SPINS_AWARDED,
  FREE_SPINS_RETRIGGER_AWARD, MAX_WIN_X100, MAX_TUMBLES_PER_SPIN,
  SYMBOL_COUNT, BUY_SCATTER_DISPLAY,
} from './config.js';
import { createReelSampler, drawGrid, tumble } from './grid.js';
import { evaluateGrid } from './evaluate.js';
import { buildPayLookup, buildScatterLookup } from './paytable.js';
import { payToCents, applyMultiplier, assertInt } from './money.js';
import { weightedPicker } from './rng.js';

const { CELLS } = GRID;

/** Modos de aposta aceitos por {@link Engine.playRound}. */
export const Mode = Object.freeze({
  BASE: 'base',
  ANTE: 'ante',
  BUY_FREE_SPINS: 'buyFreeSpins',
  BUY_SUPER_FREE_SPINS: 'buySuperFreeSpins',
});

/** @typedef {typeof Mode[keyof typeof Mode]} ModeName */

/**
 * @typedef {object} Drop  Um passo da cascata.
 * @property {number} step
 * @property {number[]} [grid]       grade achatada, indice col*ROWS+row (com trace)
 * @property {number[]} [orbValues]  valor do orbe por indice, 0 onde nao ha orbe (com trace)
 * @property {import('./evaluate.js').SymbolWin[]} wins
 * @property {number} winCents
 * @property {number[]} [removed]     indices que explodiram (apenas com trace)
 * @property {{ pos: number, value: number }[]} newOrbs
 */

/**
 * @typedef {object} SpinResult
 * @property {number} index
 * @property {'base'|'free'} kind
 * @property {Drop[]} drops
 * @property {number} scatterCount
 * @property {number} scatterPayCents
 * @property {number} rawWinCents        ganho das cascatas antes do multiplicador
 * @property {number} multiplierApplied
 * @property {number} spinWinCents       ganho final do giro (com scatter)
 * @property {number} globalMultiplier   multiplicador global apos este giro
 * @property {boolean} retriggered
 */

/**
 * @typedef {object} RoundResult
 * @property {ModeName} mode
 * @property {number} betCents           aposta usada no calculo dos premios
 * @property {number} costCents          quanto foi debitado do jogador
 * @property {SpinResult[]} spins
 * @property {boolean} featureTriggered
 * @property {number} freeSpinsPlayed
 * @property {number} freeSpinsAwarded
 * @property {number} retriggers
 * @property {number} finalGlobalMultiplier
 * @property {number} totalWinCents
 * @property {boolean} cappedAtMaxWin
 * @property {number} netCents           totalWinCents - costCents
 */

/**
 * Cria um motor com todos os sorteadores pre-construidos.
 *
 * Os `weightedPicker` sao caros de montar (soma acumulada por rolo) e
 * imutaveis, entao sao criados uma vez por motor e reutilizados em todas as
 * rodadas. Um motor nao guarda estado de jogo: e seguro compartilha-lo.
 *
 * @param {object} [overrides] Substituicoes de configuracao (usado pelo calibrador).
 * @param {readonly (readonly number[])[]} [overrides.reelWeights]
 * @param {number} [overrides.maxWinX100]
 * @param {any} [overrides.paytable]
 * @param {readonly number[]} [overrides.scatterPays]
 * @param {{ base: readonly number[], super: readonly number[] }} [overrides.orbWeights]
 * @param {{ base: number, free: number, superFree: number }} [overrides.orbFrequency]
 * @param {number} [overrides.anteScatterMultiplier]
 */
export function createEngine(overrides = {}) {
  const reelWeights = overrides.reelWeights ?? REEL_WEIGHTS;
  const maxWinX100 = overrides.maxWinX100 ?? MAX_WIN_X100;
  const orbWeights = overrides.orbWeights ?? ORB_WEIGHTS;
  const orbFrequency = overrides.orbFrequency ?? ORB_FREQUENCY;
  const anteScatterMultiplier = overrides.anteScatterMultiplier ?? ANTE_SCATTER_MULTIPLIER;
  const payLookup = buildPayLookup(overrides.paytable);
  const scatterLookup = buildScatterLookup(overrides.scatterPays);

  const samplers = {
    base: {
      initial: createReelSampler({ reelWeights, orbFrequency: orbFrequency.base }),
      refill: createReelSampler({ reelWeights, orbFrequency: orbFrequency.base, allowScatter: false }),
    },
    ante: {
      initial: createReelSampler({
        reelWeights, orbFrequency: orbFrequency.base,
        scatterMultiplier: anteScatterMultiplier,
      }),
      refill: createReelSampler({ reelWeights, orbFrequency: orbFrequency.base, allowScatter: false }),
    },
    free: {
      initial: createReelSampler({ reelWeights, orbFrequency: orbFrequency.free }),
      refill: createReelSampler({ reelWeights, orbFrequency: orbFrequency.free, allowScatter: false }),
    },
    superFree: {
      initial: createReelSampler({ reelWeights, orbFrequency: orbFrequency.superFree }),
      refill: createReelSampler({ reelWeights, orbFrequency: orbFrequency.superFree, allowScatter: false }),
    },
  };

  const orbPickers = {
    base: weightedPicker(orbWeights.base),
    super: weightedPicker(orbWeights.super),
  };

  // buffers reutilizados entre rodadas — o motor e single-threaded por design
  const countBuffer = new Int32Array(SYMBOL_COUNT);
  const orbValues = new Int32Array(CELLS);

  /**
   * @param {import('./rng.js').Rng} rng
   * @param {'base'|'super'} table
   */
  const drawOrbValue = (rng, table) => ORB_VALUES[orbPickers[table].pick(rng)];

  /**
   * Executa uma sequencia completa de cascatas a partir de um sorteio inicial.
   *
   * @param {object} ctx
   * @param {import('./rng.js').Rng} ctx.rng
   * @param {number} ctx.betCents
   * @param {{ initial: any, refill: any }} ctx.sampler
   * @param {'base'|'super'} ctx.orbTable
   * @param {boolean} ctx.payScatter
   * @param {boolean} ctx.trace
   * @returns {{ drops: Drop[], rawWinCents: number, orbSum: number, scatterCount: number, scatterPayCents: number }}
   */
  function playSpinSequence(ctx) {
    const { rng, betCents, sampler, orbTable, payScatter, trace } = ctx;
    const grid = drawGrid(rng, sampler.initial);
    orbValues.fill(0);

    /** @type {Drop[]} */
    const drops = [];
    let rawWinCents = 0;
    let orbSum = 0;
    let scatterCount = 0;
    let scatterPayCents = 0;

    // orbes presentes no sorteio inicial
    /** @type {{pos:number,value:number}[]} */
    let newOrbs = [];
    for (let i = 0; i < CELLS; i++) {
      if (grid[i] === Sym.ORB) {
        const value = drawOrbValue(rng, orbTable);
        orbValues[i] = value;
        orbSum += value;
        newOrbs.push({ pos: i, value });
      }
    }

    for (let step = 0; step < MAX_TUMBLES_PER_SPIN; step++) {
      const evaluation = evaluateGrid(grid, betCents, {
        payScatter: payScatter && step === 0,
        collectPositions: trace,
        countBuffer,
        payLookup,
        scatterLookup,
      });

      if (step === 0) {
        scatterCount = evaluation.scatterCount;
        scatterPayCents = evaluation.scatterPayCents;
      }

      /** @type {Drop} */
      const drop = {
        step,
        wins: evaluation.wins,
        winCents: evaluation.winCents,
        newOrbs,
      };
      if (trace) {
        // grade achatada, mesmo indice usado por `positions` e `orbValues`
        drop.grid = Array.from(grid);
        drop.orbValues = Array.from(orbValues);
        /** @type {number[]} */
        const removed = [];
        if (evaluation.removeMask) {
          for (let i = 0; i < CELLS; i++) if (evaluation.removeMask[i]) removed.push(i);
        }
        drop.removed = removed;
      }
      drops.push(drop);

      if (evaluation.removeMask === null) break; // sem ganho: a sequencia acaba
      rawWinCents += evaluation.winCents;

      const refilled = tumble(grid, evaluation.removeMask, rng, sampler.refill, orbValues);
      newOrbs = [];
      for (const i of refilled) {
        if (grid[i] === Sym.ORB) {
          const value = drawOrbValue(rng, orbTable);
          orbValues[i] = value;
          orbSum += value;
          newOrbs.push({ pos: i, value });
        }
      }
    }

    return { drops, rawWinCents, orbSum, scatterCount, scatterPayCents };
  }

  /**
   * Joga uma rodada completa.
   *
   * @param {object} args
   * @param {import('./rng.js').Rng} args.rng
   * @param {number} args.betCents  aposta base em centavos (inteiro > 0)
   * @param {ModeName} [args.mode]
   * @param {boolean} [args.trace]  true guarda grades e posicoes para a UI
   * @returns {RoundResult}
   */
  function playRound({ rng, betCents, mode = Mode.BASE, trace = false }) {
    assertInt(betCents, 'betCents');
    if (betCents <= 0) throw new RangeError('betCents deve ser maior que zero.');

    const costCents = costOf(betCents, mode);
    const maxWinCents = payToCents(betCents, maxWinX100);

    /** @type {SpinResult[]} */
    const spins = [];
    let totalWinCents = 0;
    let cappedAtMaxWin = false;
    let freeSpinsRemaining = 0;
    let freeSpinsAwarded = 0;
    let freeSpinsPlayed = 0;
    let retriggers = 0;
    let globalMultiplier = 0;
    let featureTriggered = false;
    let spinIndex = 0;

    const bought = mode === Mode.BUY_FREE_SPINS || mode === Mode.BUY_SUPER_FREE_SPINS;
    const isSuper = mode === Mode.BUY_SUPER_FREE_SPINS;
    const freeSampler = isSuper ? samplers.superFree : samplers.free;
    const orbTable = isSuper ? 'super' : 'base';

    /** Soma um ganho ao acumulado aplicando o teto. @param {number} cents */
    const credit = (cents) => {
      totalWinCents += cents;
      if (totalWinCents >= maxWinCents) {
        totalWinCents = maxWinCents;
        cappedAtMaxWin = true;
      }
    };

    if (bought) {
      featureTriggered = true;
      freeSpinsRemaining = FREE_SPINS_AWARDED;
      freeSpinsAwarded = FREE_SPINS_AWARDED;
    } else {
      // ---- giro base ----
      const sampler = mode === Mode.ANTE ? samplers.ante : samplers.base;
      const seq = playSpinSequence({
        rng, betCents, sampler, orbTable: 'base', payScatter: true, trace,
      });

      const multiplier = seq.rawWinCents > 0 ? Math.max(1, seq.orbSum) : 1;
      const spinWin = applyMultiplier(seq.rawWinCents, multiplier) + seq.scatterPayCents;

      spins.push({
        index: spinIndex++,
        kind: 'base',
        drops: seq.drops,
        scatterCount: seq.scatterCount,
        scatterPayCents: seq.scatterPayCents,
        rawWinCents: seq.rawWinCents,
        multiplierApplied: multiplier,
        spinWinCents: spinWin,
        globalMultiplier: 0,
        retriggered: false,
      });
      credit(spinWin);

      if (seq.scatterCount >= SCATTER_TRIGGER) {
        featureTriggered = true;
        freeSpinsRemaining = FREE_SPINS_AWARDED;
        freeSpinsAwarded = FREE_SPINS_AWARDED;
      }
    }

    // ---- rodadas gratis ----
    while (freeSpinsRemaining > 0 && !cappedAtMaxWin) {
      freeSpinsRemaining -= 1;
      freeSpinsPlayed += 1;

      const seq = playSpinSequence({
        rng, betCents, sampler: freeSampler, orbTable, payScatter: false, trace,
      });

      // nas rodadas gratis os orbes sempre entram no multiplicador global
      globalMultiplier += seq.orbSum;
      const multiplier = Math.max(1, globalMultiplier);
      const spinWin = applyMultiplier(seq.rawWinCents, multiplier);

      let retriggered = false;
      if (seq.scatterCount >= SCATTER_RETRIGGER) {
        retriggered = true;
        retriggers += 1;
        freeSpinsRemaining += FREE_SPINS_RETRIGGER_AWARD;
        freeSpinsAwarded += FREE_SPINS_RETRIGGER_AWARD;
      }

      spins.push({
        index: spinIndex++,
        kind: 'free',
        drops: seq.drops,
        scatterCount: seq.scatterCount,
        scatterPayCents: 0,
        rawWinCents: seq.rawWinCents,
        multiplierApplied: multiplier,
        spinWinCents: spinWin,
        globalMultiplier,
        retriggered,
      });
      credit(spinWin);
    }

    return {
      mode,
      betCents,
      costCents,
      spins,
      featureTriggered,
      freeSpinsPlayed,
      freeSpinsAwarded,
      retriggers,
      finalGlobalMultiplier: globalMultiplier,
      totalWinCents,
      cappedAtMaxWin,
      netCents: totalWinCents - costCents,
    };
  }

  return { playRound, maxWinX100, reelWeights, payLookup, scatterLookup };
}

/** @typedef {ReturnType<typeof createEngine>} Engine */

/**
 * Custo em centavos de uma rodada, por modo.
 * @param {number} betCents
 * @param {ModeName} mode
 * @returns {number}
 */
export function costOf(betCents, mode) {
  switch (mode) {
    case Mode.BASE: return betCents;
    case Mode.ANTE: return payToCents(betCents, ANTE_COST_X100);
    case Mode.BUY_FREE_SPINS: return payToCents(betCents, BUY_PRICES_X100.freeSpins);
    case Mode.BUY_SUPER_FREE_SPINS: return payToCents(betCents, BUY_PRICES_X100.superFreeSpins);
    default: throw new RangeError(`Modo desconhecido: ${String(mode)}`);
  }
}

/** Quantidade de scatters exibida quando o bonus e comprado. */
export { BUY_SCATTER_DISPLAY };
