/**
 * Motor de rodada do Freaky Zoo.
 *
 * Funcao pura de (aleatoriedade, modo) -> resultado. Nao conhece dinheiro nem
 * carteira: todo valor sai em centesimos da aposta base (x100), a mesma unidade
 * do `payoutMultiplier` dos books da Stake Engine. Com `trace` ligado, a rodada
 * devolve tambem a lista de EVENTOS no formato de book (reveal, winInfo,
 * freeSpinTrigger...) — e exatamente o que a interface anima e o que o
 * exportador grava. Um unico codigo para jogar, simular e exportar: o RTP
 * medido e o RTP que o jogador recebe.
 *
 * Ordem de resolucao de um giro (fixa, porque define o consumo do RNG):
 *   1. paradas das fitas                     (6 sorteios)
 *   2. rolos grudentos da Rave Sigma viram wild
 *   3. multiplicador de cada gorila          (so no bonus)
 *   4. Surto Freaky                          (so no jogo base)
 *   5. reacao de cada camelo, da esquerda para a direita
 *      -> todos os CUSPES resolvem, depois todas as LINGUAS
 *   6. avaliacao dos ways
 *   7. contagem de scatters (gatilho / re-gatilho)
 *
 * Regra do teto: ao atingir MAX_WIN_X100, o total trava no teto e a rodada
 * acaba na hora — rodadas gratis restantes sao descartadas (evento `wincap`).
 */

import {
  GRID, Sym, SYMBOLS, SPIT_DOWNGRADE, CAMEL_TONGUE_CHANCE, FEATURE_TRIGGERS,
  RETRIGGER_SCATTERS, RETRIGGER_SPINS, BUY_SPINS, GORILLA_MULT_VALUES,
  GORILLA_MULT_WEIGHTS, FRENZY_WILD_COUNTS, FRENZY_WILD_WEIGHTS, FRENZY_WILD_MULT,
  CALIBRATION, MODES, MAX_WIN_X100,
} from './config.js';
import { buildReelSets, spinReels } from './reels.js';
import { evaluateWays, buildPayLookup } from './ways.js';
import { weightedPicker } from '../engine/rng.js';

const { REELS, ROWS, CELLS } = GRID;

/** Marcas de celula, para a interface saber de onde veio cada wild. */
const Tag = Object.freeze({ NONE: 0, GORILLA: 1, FRENZY: 2, TONGUE: 3, STICKY: 4 });

/**
 * @typedef {import('./config.js').ModeName} ModeName
 * @typedef {'festa'|'rave'} Feature
 * @typedef {'base'|Feature} GameType
 */

/**
 * @typedef {object} RoundResult
 * @property {ModeName} mode
 * @property {number} costX100
 * @property {number} payoutX100      ganho total da rodada (ja com teto)
 * @property {number} baseWinX100     parcela do giro base
 * @property {number} freeWinX100     parcela do bonus
 * @property {boolean} capped
 * @property {Feature|null} feature
 * @property {boolean} bought
 * @property {number} freeSpinsPlayed
 * @property {number} freeSpinsAwarded
 * @property {number} retriggers
 * @property {number} scatters        scatters do giro base (0 em compra)
 * @property {Record<string, any>[]} [events]  so com trace
 */

/**
 * Pesos "inclinados": w_i * v_i^theta. theta > 0 puxa para valores altos.
 * @param {readonly number[]} weights
 * @param {readonly number[]} values
 * @param {number} theta
 */
export function tiltWeights(weights, values, theta) {
  return weights.map((w, i) => w * values[i] ** theta);
}

/**
 * @param {object} [overrides]  substituicoes usadas pelo calibrador e pelos testes
 * @param {Readonly<Record<string, readonly (readonly number[])[]>>} [overrides.reelCounts]
 * @param {readonly (readonly number[])[]} [overrides.paytable]
 * @param {Partial<typeof CALIBRATION> & { tilt?: Partial<typeof CALIBRATION.tilt> }} [overrides.calibration]
 * @param {Partial<typeof CAMEL_TONGUE_CHANCE>} [overrides.tongueChance]
 * @param {number} [overrides.maxWinX100]
 */
export function createEngine(overrides = {}) {
  const reelSets = buildReelSets(overrides.reelCounts);
  const cal = {
    ...CALIBRATION,
    ...overrides.calibration,
    tilt: { ...CALIBRATION.tilt, ...overrides.calibration?.tilt },
  };
  const tongueChance = { ...CAMEL_TONGUE_CHANCE, ...overrides.tongueChance };
  const maxWinX100 = overrides.maxWinX100 ?? MAX_WIN_X100;
  const payLookup = buildPayLookup(overrides.paytable);

  const gorillaPickers = {
    festa: weightedPicker(tiltWeights(GORILLA_MULT_WEIGHTS, GORILLA_MULT_VALUES, cal.tilt.festa)),
    rave: weightedPicker(tiltWeights(GORILLA_MULT_WEIGHTS, GORILLA_MULT_VALUES, cal.tilt.rave)),
  };
  const frenzyPicker = weightedPicker(FRENZY_WILD_WEIGHTS);

  // buffers reutilizados — o motor e single-threaded por design
  const board = new Int8Array(CELLS);
  const mult = new Int32Array(CELLS);
  const tag = new Int8Array(CELLS);
  const stops = new Int32Array(REELS);
  const sticky = new Uint8Array(REELS);
  const candidates = new Int32Array(CELLS);
  const camelCells = new Int32Array(REELS);
  const camelTongue = new Uint8Array(REELS);

  /**
   * Um giro: sorteio, modificadores, avaliacao.
   * @param {GameType} gameType
   * @param {import('./reels.js').ReelSet} reelSet
   * @param {import('../engine/rng.js').Rng} rng
   * @param {Record<string, any>[]|null} events
   * @returns {{ win: number, scatters: number, scatterCells: number[]|null }}
   */
  function playSpin(gameType, reelSet, rng, events, forceTongue = false) {
    spinReels(reelSet, rng, board, stops);
    mult.fill(1);
    tag.fill(Tag.NONE);
    if (forceTongue) forceCamel(rng);

    if (events) {
      emit(events, {
        type: 'reveal',
        gameType: gameType === 'base' ? 'basegame' : 'freegame',
        feature: gameType === 'base' ? null : gameType,
        reelSet: reelSet.name,
        stops: Array.from(stops),
        board: snapshot(),
      });
    }

    // 2. lingua grudenta: rolos que ja lamberam na Rave continuam wild
    if (gameType === 'rave') {
      /** @type {number[]} */
      const stuck = [];
      for (let r = 0; r < REELS; r++) {
        if (!sticky[r]) continue;
        stuck.push(r);
        for (let row = 0; row < ROWS; row++) {
          const i = r * ROWS + row;
          if (board[i] !== Sym.SCATTER && board[i] !== Sym.WILD) {
            board[i] = Sym.WILD;
            tag[i] = Tag.STICKY;
          }
        }
      }
      if (events && stuck.length) emit(events, { type: 'stickyWilds', reels: stuck });
    }

    // 3. gorilas do bonus carregam multiplicador
    if (gameType !== 'base') {
      const picker = gorillaPickers[gameType];
      /** @type {{reel:number,row:number,multiplier:number}[]|null} */
      const list = events ? [] : null;
      for (let i = 0; i < CELLS; i++) {
        if (board[i] === Sym.WILD && tag[i] === Tag.NONE) {
          mult[i] = GORILLA_MULT_VALUES[picker.pick(rng)];
          tag[i] = Tag.GORILLA;
          if (list) list.push({ reel: (i / ROWS) | 0, row: i % ROWS, multiplier: mult[i] });
        }
      }
      if (events && list && list.length) emit(events, { type: 'gorillaMultipliers', wilds: list });
    }

    // 4. Surto Freaky
    if (gameType === 'base' && rng.float() < (forceTongue ? cal.frenzyChanceLingua : cal.frenzyChance)) {
      let n = 0;
      for (let i = ROWS; i < CELLS; i++) {
        const s = board[i];
        if (s !== Sym.SCATTER && s !== Sym.CAMEL && s !== Sym.WILD) candidates[n++] = i;
      }
      const k = Math.min(n, FRENZY_WILD_COUNTS[frenzyPicker.pick(rng)]);
      /** @type {{reel:number,row:number,multiplier:number}[]|null} */
      const list = events ? [] : null;
      for (let j = 0; j < k; j++) {
        // Fisher-Yates parcial: sorteio sem reposicao
        const pick = j + rng.int(n - j);
        const i = candidates[pick];
        candidates[pick] = candidates[j];
        candidates[j] = i;
        board[i] = Sym.WILD;
        mult[i] = FRENZY_WILD_MULT;
        tag[i] = Tag.FRENZY;
        if (list) list.push({ reel: (i / ROWS) | 0, row: i % ROWS, multiplier: FRENZY_WILD_MULT });
      }
      if (events && list) {
        list.sort((a, b) => a.reel - b.reel || a.row - b.row);
        emit(events, { type: 'freakyFrenzy', wilds: list });
      }
    }

    // 5. camelos
    let camels = 0;
    for (let i = 0; i < CELLS; i++) if (board[i] === Sym.CAMEL) camelCells[camels++] = i;
    if (camels > 0) {
      const chance = forceTongue ? 1 : tongueChance[gameType];
      let spits = 0;
      for (let c = 0; c < camels; c++) {
        camelTongue[c] = rng.float() < chance ? 1 : 0;
        if (!camelTongue[c]) spits += 1;
      }

      /** @type {{reel:number,row:number,from:string,to:string}[]|null} */
      const spat = events ? [] : null;
      if (spits > 0) {
        for (let i = 0; i < CELLS; i++) {
          const s = board[i];
          if (s === Sym.LION || s === Sym.MONKEY || s === Sym.TURTLE) {
            const to = SPIT_DOWNGRADE[s];
            if (spat) spat.push({ reel: (i / ROWS) | 0, row: i % ROWS, from: SYMBOLS[s].code, to: SYMBOLS[to].code });
            board[i] = to;
          }
        }
        for (let c = 0; c < camels; c++) {
          if (camelTongue[c]) continue;
          const i = camelCells[c];
          const to = SPIT_DOWNGRADE[Sym.CAMEL];
          if (spat) spat.push({ reel: (i / ROWS) | 0, row: i % ROWS, from: SYMBOLS[Sym.CAMEL].code, to: SYMBOLS[to].code });
          board[i] = to;
        }
        if (spat) spat.sort((a, b) => a.reel - b.reel || a.row - b.row);
      }

      /** @type {{reel:number,rows:number[],sticky:boolean}[]|null} */
      const tongues = events ? [] : null;
      for (let c = 0; c < camels; c++) {
        if (!camelTongue[c]) continue;
        const r = (camelCells[c] / ROWS) | 0;
        /** @type {number[]} */
        const rows = [];
        for (let row = 0; row < ROWS; row++) {
          const i = r * ROWS + row;
          if (board[i] !== Sym.SCATTER && board[i] !== Sym.WILD) {
            board[i] = Sym.WILD;
            mult[i] = 1;
            tag[i] = Tag.TONGUE;
            rows.push(row);
          }
        }
        if (gameType === 'rave') sticky[r] = 1;
        if (tongues) tongues.push({ reel: r, rows, sticky: gameType === 'rave' });
      }

      if (events) {
        /** @type {{reel:number,row:number,action:'tongue'|'spit'}[]} */
        const list = [];
        for (let c = 0; c < camels; c++) {
          const i = camelCells[c];
          list.push({ reel: (i / ROWS) | 0, row: i % ROWS, action: camelTongue[c] ? 'tongue' : 'spit' });
        }
        emit(events, { type: 'camel', camels: list, spit: spat, tongues });
      }
    }

    // 6. avaliacao
    /** @type {import('./ways.js').WayWin[]|null} */
    const wins = events ? [] : null;
    const win = evaluateWays(board, mult, wins, payLookup);
    if (events && wins && wins.length) {
      emit(events, {
        type: 'winInfo',
        totalWin: win,
        wins: wins.map((w) => ({
          symbol: w.code,
          kind: w.kind,
          ways: w.ways,
          plainWays: w.plainWays,
          payPerWay: w.payX100,
          win: w.winX100,
          positions: w.positions.map((i) => ({ reel: (i / ROWS) | 0, row: i % ROWS })),
        })),
      });
    }

    // 7. scatters
    let scatters = 0;
    /** @type {number[]|null} */
    const scatterCells = events ? [] : null;
    for (let i = 0; i < CELLS; i++) {
      if (board[i] === Sym.SCATTER) {
        scatters += 1;
        if (scatterCells) scatterCells.push(i);
      }
    }
    return { win, scatters, scatterCells };
  }

  /**
   * Lingua Garantida: se nenhum camelo caiu, um aparece num rolo de 2 a 5 que
   * nao mostre scatter. Acontece ANTES do `reveal`, entao para o jogador (e
   * para o book) o camelo simplesmente caiu ali.
   * @param {import('../engine/rng.js').Rng} rng
   */
  function forceCamel(rng) {
    let open = 0;
    for (let r = 1; r <= 4; r++) {
      let blocked = false;
      for (let row = 0; row < ROWS; row++) {
        const s = board[r * ROWS + row];
        if (s === Sym.CAMEL) return;
        if (s === Sym.SCATTER) blocked = true;
      }
      if (!blocked) candidates[open++] = r;
    }
    if (open === 0) return; // 4 scatters nos rolos 2-5: o bonus ja compensa
    const r = candidates[rng.int(open)];
    board[r * ROWS + rng.int(ROWS)] = Sym.CAMEL;
  }

  /** Grade atual no formato de book (reel-major, como o `reveal` da math-sdk). */
  function snapshot() {
    /** @type {{name:string, multiplier?:number, tongue?:true, sticky?:true, frenzy?:true}[][]} */
    const out = [];
    for (let r = 0; r < REELS; r++) {
      const col = [];
      for (let row = 0; row < ROWS; row++) {
        const i = r * ROWS + row;
        /** @type {{name:string, multiplier?:number, tongue?:true, sticky?:true, frenzy?:true}} */
        const cell = { name: SYMBOLS[board[i]].code };
        if (board[i] === Sym.WILD && mult[i] > 1) cell.multiplier = mult[i];
        if (tag[i] === Tag.TONGUE) cell.tongue = true;
        if (tag[i] === Tag.STICKY) cell.sticky = true;
        if (tag[i] === Tag.FRENZY) cell.frenzy = true;
        col.push(cell);
      }
      out.push(col);
    }
    return out;
  }

  /**
   * Joga uma rodada completa (um debito, um credito).
   * @param {object} args
   * @param {import('../engine/rng.js').Rng} args.rng
   * @param {ModeName} [args.mode]
   * @param {boolean} [args.trace]
   * @param {number} [args.freeSpins]  so em compra: troca as 10 rodadas (usado
   *   pelo calibrador para medir a Rave de 12 e 15 rodadas do gatilho natural)
   * @param {import('../engine/rng.js').Rng} [args.featureRng]  fonte separada
   *   para as rodadas gratis. Padrao: a mesma `rng`. O exportador da Stake usa
   *   isso para amostrar "rodadas que bateram o teto" sem refazer o giro base.
   * @returns {RoundResult}
   */
  function playRound({ rng, mode = 'base', trace = false, freeSpins = BUY_SPINS, featureRng = rng }) {
    const modeCfg = MODES[mode];
    if (!modeCfg) throw new RangeError(`Modo desconhecido: ${String(mode)}`);
    /** @type {Record<string, any>[]|null} */
    const events = trace ? [] : null;

    let total = 0;
    let capped = false;
    let baseWin = 0;
    /** @type {Feature|null} */
    let feature = null;
    let bought = false;
    let fsTotal = 0;
    let fsPlayed = 0;
    let retriggers = 0;
    let baseScatters = 0;

    /** @param {number} x */
    const credit = (x) => {
      total += x;
      if (total >= maxWinX100) {
        total = maxWinX100;
        capped = true;
      }
    };

    if (mode === 'festa' || mode === 'rave') {
      feature = mode;
      bought = true;
      fsTotal = freeSpins;
      if (events) emit(events, { type: 'freeSpinTrigger', feature, totalFs: fsTotal, positions: [], bought: true });
    } else {
      const useHunt = mode === 'hunt' && rng.float() < cal.huntMix;
      const spin = playSpin('base', useHunt ? reelSets.BRH : reelSets.BR0, rng, events, mode === 'lingua');
      credit(spin.win);
      baseWin = total;
      baseScatters = spin.scatters;
      if (events && spin.win > 0) {
        emit(events, { type: 'setWin', amount: spin.win });
        emit(events, { type: 'setTotalWin', amount: total });
      }
      const trigger = FEATURE_TRIGGERS[spin.scatters];
      if (trigger && !capped) {
        feature = trigger.feature;
        fsTotal = trigger.spins;
        if (events) {
          emit(events, {
            type: 'freeSpinTrigger', feature, totalFs: fsTotal, bought: false,
            positions: (spin.scatterCells ?? []).map(toPos),
          });
        }
      }
    }

    if (feature) {
      sticky.fill(0);
      const set = feature === 'festa' ? reelSets.FR0 : reelSets.FRS;
      while (fsPlayed < fsTotal && !capped) {
        fsPlayed += 1;
        if (events) emit(events, { type: 'updateFreeSpin', amount: fsPlayed, total: fsTotal });
        const spin = playSpin(feature, set, featureRng, events);
        credit(spin.win);
        if (events && spin.win > 0) {
          emit(events, { type: 'setWin', amount: spin.win });
          emit(events, { type: 'setTotalWin', amount: total });
        }
        if (spin.scatters >= RETRIGGER_SCATTERS && !capped) {
          fsTotal += RETRIGGER_SPINS;
          retriggers += 1;
          if (events) {
            emit(events, {
              type: 'freeSpinRetrigger', totalFs: fsTotal,
              positions: (spin.scatterCells ?? []).map(toPos),
            });
          }
        }
      }
      if (events) emit(events, { type: 'freeSpinEnd', feature, amount: total - baseWin });
    }

    if (events) {
      if (capped) emit(events, { type: 'wincap', amount: total });
      emit(events, { type: 'finalWin', amount: total });
    }

    /** @type {RoundResult} */
    const result = {
      mode,
      costX100: modeCfg.costX100,
      payoutX100: total,
      baseWinX100: baseWin,
      freeWinX100: total - baseWin,
      capped,
      feature,
      bought,
      freeSpinsPlayed: fsPlayed,
      freeSpinsAwarded: fsTotal,
      retriggers,
      scatters: baseScatters,
    };
    if (events) result.events = events;
    return result;
  }

  return { playRound, reelSets, maxWinX100, calibration: cal, tongueChance, payLookup };
}

/** @typedef {ReturnType<typeof createEngine>} Engine */

/**
 * @param {Record<string, any>[]} events
 * @param {Record<string, any>} event
 */
function emit(events, event) {
  events.push({ index: events.length, ...event });
}

/** @param {number} i */
function toPos(i) {
  return { reel: (i / ROWS) | 0, row: i % ROWS };
}

/**
 * Custo de um modo em centesimos da aposta base.
 * @param {ModeName} mode
 */
export function costX100Of(mode) {
  const cfg = MODES[mode];
  if (!cfg) throw new RangeError(`Modo desconhecido: ${String(mode)}`);
  return cfg.costX100;
}
