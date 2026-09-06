/**
 * Sessao de jogo: carteira, aposta, historico e o esquema "provably fair".
 *
 * Separado de round.js de proposito. round.js e uma funcao pura de
 * (rng, aposta, modo) -> resultado; aqui mora o estado mutavel do jogador.
 * Isso permite simular milhoes de rodadas sem tocar em carteira nenhuma, e
 * testar a carteira sem depender do sorteio.
 *
 * Contabilidade: o custo e debitado ANTES do sorteio e o ganho creditado
 * depois. A rodada nunca deixa o saldo negativo porque {@link play} recusa a
 * aposta quando nao ha saldo. Todos os valores sao inteiros em centavos.
 */

import { createEngine, Mode, costOf } from './round.js';
import { createSecureRng, createProvablyFairRng } from './rng.js';
import { sha256, utf8, toHex } from './sha256.js';
import { BET_LEVELS_CENTS, DEFAULT_BET_CENTS, DEFAULT_BALANCE_CENTS } from './config.js';
import { assertInt } from './money.js';

/**
 * @typedef {object} SessionStats
 * @property {number} rounds
 * @property {number} wageredCents
 * @property {number} wonCents
 * @property {number} netCents
 * @property {number} rtp
 * @property {number} biggestWinCents
 * @property {number} biggestWinX
 * @property {number} featuresTriggered
 * @property {number} featuresBought
 */

/** Gera uma semente de servidor aleatoria de 256 bits em hexadecimal. */
export function randomServerSeed() {
  const bytes = new Uint32Array(8);
  const g = /** @type {any} */ (globalThis);
  if (!g.crypto?.getRandomValues) throw new Error('crypto.getRandomValues indisponivel.');
  g.crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(8, '0')).join('');
}

/**
 * @param {object} [opts]
 * @param {number} [opts.balanceCents]
 * @param {number} [opts.betCents]
 * @param {ReturnType<typeof createEngine>} [opts.engine]
 * @param {'secure'|'provablyFair'} [opts.rngMode]
 * @param {string} [opts.clientSeed]
 * @param {string} [opts.serverSeed]  injetavel para testes; padrao aleatorio
 */
export function createSession(opts = {}) {
  const engine = opts.engine ?? createEngine();
  let balanceCents = opts.balanceCents ?? DEFAULT_BALANCE_CENTS;
  let betCents = opts.betCents ?? DEFAULT_BET_CENTS;
  let rngMode = opts.rngMode ?? 'provablyFair';

  let serverSeed = opts.serverSeed ?? randomServerSeed();
  let clientSeed = opts.clientSeed ?? 'jogador';
  let nonce = 0;

  const secureRng = createSecureRng();

  const stats = {
    rounds: 0, wageredCents: 0, wonCents: 0,
    biggestWinCents: 0, biggestWinX: 0,
    featuresTriggered: 0, featuresBought: 0,
  };

  /** @type {import('./round.js').RoundResult[]} */
  const history = [];
  const HISTORY_LIMIT = 50;

  assertInt(balanceCents, 'balanceCents');
  assertBetLevel(betCents);

  /** @param {number} value */
  function assertBetLevel(value) {
    if (!BET_LEVELS_CENTS.includes(value)) {
      throw new RangeError(`Aposta ${value} nao esta entre os niveis permitidos.`);
    }
  }

  /**
   * Custo da proxima rodada no modo dado.
   * @param {import('./round.js').ModeName} mode
   */
  function costFor(mode) {
    return costOf(betCents, mode);
  }

  /**
   * @param {import('./round.js').ModeName} mode
   * @returns {boolean}
   */
  function canAfford(mode) {
    return balanceCents >= costFor(mode);
  }

  /**
   * Joga uma rodada. Lanca se o saldo for insuficiente — o chamador deve
   * checar {@link canAfford} antes e desabilitar o botao.
   *
   * @param {object} [args]
   * @param {import('./round.js').ModeName} [args.mode]
   * @param {boolean} [args.trace]
   * @returns {{ result: import('./round.js').RoundResult, balanceBefore: number, balanceAfter: number, proof: object }}
   */
  function play({ mode = Mode.BASE, trace = true } = {}) {
    const cost = costFor(mode);
    if (balanceCents < cost) {
      throw new RangeError(`Saldo insuficiente: precisa de ${cost}, tem ${balanceCents}.`);
    }

    const balanceBefore = balanceCents;
    const roundNonce = nonce;
    const rng = rngMode === 'provablyFair'
      ? createProvablyFairRng({ serverSeed, clientSeed, nonce: roundNonce })
      : secureRng;

    balanceCents -= cost;
    const result = engine.playRound({ rng, betCents, mode, trace });
    balanceCents += result.totalWinCents;
    nonce += 1;

    stats.rounds += 1;
    stats.wageredCents += cost;
    stats.wonCents += result.totalWinCents;
    if (result.totalWinCents > stats.biggestWinCents) {
      stats.biggestWinCents = result.totalWinCents;
      stats.biggestWinX = result.totalWinCents / betCents;
    }
    if (result.featureTriggered) {
      if (mode === Mode.BUY_FREE_SPINS || mode === Mode.BUY_SUPER_FREE_SPINS) stats.featuresBought += 1;
      else stats.featuresTriggered += 1;
    }

    history.unshift(result);
    if (history.length > HISTORY_LIMIT) history.pop();

    return {
      result,
      balanceBefore,
      balanceAfter: balanceCents,
      proof: {
        mode: rngMode,
        clientSeed,
        nonce: roundNonce,
        serverSeedHash: serverSeedHash(),
      },
    };
  }

  function serverSeedHash() {
    return toHex(sha256(utf8(serverSeed)));
  }

  /**
   * Revela a semente atual e sorteia uma nova. O jogador pode entao conferir
   * que sha256(sementeRevelada) bate com o compromisso publicado antes das
   * rodadas ja jogadas.
   * @returns {{ revealedServerSeed: string, revealedHash: string, roundsCovered: number, newServerSeedHash: string }}
   */
  function rotateServerSeed() {
    const revealed = serverSeed;
    const revealedHash = serverSeedHash();
    const roundsCovered = nonce;
    serverSeed = randomServerSeed();
    nonce = 0;
    return {
      revealedServerSeed: revealed,
      revealedHash,
      roundsCovered,
      newServerSeedHash: serverSeedHash(),
    };
  }

  /** @returns {SessionStats} */
  function getStats() {
    return {
      ...stats,
      netCents: stats.wonCents - stats.wageredCents,
      rtp: stats.wageredCents > 0 ? stats.wonCents / stats.wageredCents : 0,
    };
  }

  return {
    play,
    canAfford,
    costFor,
    getStats,
    rotateServerSeed,
    serverSeedHash,
    get history() { return history; },
    get balanceCents() { return balanceCents; },
    get betCents() { return betCents; },
    get nonce() { return nonce; },
    get clientSeed() { return clientSeed; },
    get rngMode() { return rngMode; },
    /** @param {number} value */
    setBet(value) { assertBetLevel(value); betCents = value; },
    /** @param {string} value */
    setClientSeed(value) {
      const trimmed = String(value).trim();
      if (!trimmed) throw new RangeError('A semente do cliente nao pode ser vazia.');
      clientSeed = trimmed.slice(0, 64);
      nonce = 0;
    },
    /** @param {'secure'|'provablyFair'} value */
    setRngMode(value) { rngMode = value; },
    /** @param {number} cents Deposito de creditos de demonstracao. */
    deposit(cents) { assertInt(cents, 'cents'); balanceCents += cents; },
  };
}

export { Mode, BET_LEVELS_CENTS };
