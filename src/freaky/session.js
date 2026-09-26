/**
 * Sessao de demonstracao do Freaky Zoo: carteira, aposta, historico e
 * verificacao justa. Mesma divisao do Fortuna Real — round.js e uma funcao
 * pura, aqui mora o estado mutavel do jogador.
 *
 * Dinheiro em micro-unidades (1.000.000 = 1), a unidade da Stake Engine, para
 * que a sessao local e o RGS falem a mesma lingua. O custo e debitado ANTES do
 * sorteio e o ganho creditado depois; `play` recusa a aposta sem saldo.
 */

import { createEngine, costX100Of } from './round.js';
import { createSecureRng, createProvablyFairRng } from '../engine/rng.js';
import { sha256, utf8, toHex } from '../engine/sha256.js';
import { assertInt } from '../engine/money.js';
import { BET_LEVELS, DEFAULT_BET, DEFAULT_BALANCE, MODES, MONEY_UNIT } from './config.js';

/**
 * Converte centesimos da aposta em micro-unidades.
 * Exato porque toda aposta e multipla de 100 micro-unidades.
 * @param {number} bet  micro-unidades
 * @param {number} x100
 */
export function moneyOf(bet, x100) {
  assertInt(bet, 'bet');
  assertInt(x100, 'x100');
  const product = bet * x100;
  if (!Number.isSafeInteger(product)) throw new RangeError(`Overflow monetario: ${bet} x ${x100}.`);
  if (product % 100 !== 0) throw new RangeError(`Aposta ${bet} nao e multipla de 100 micro-unidades.`);
  return product / 100;
}

/**
 * Formata micro-unidades como moeda. Trunca para os centavos: o jogador
 * nunca ve um centavo que nao tem.
 * @param {number} micro
 * @param {string} [currency]
 * @param {string} [locale]
 */
export function formatMoney(micro, currency = 'BRL', locale = 'pt-BR') {
  const cents = Math.floor(micro / (MONEY_UNIT / 100));
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

/** Semente de servidor aleatoria de 256 bits, em hexadecimal. */
export function randomServerSeed() {
  const bytes = new Uint32Array(8);
  const g = /** @type {any} */ (globalThis);
  if (!g.crypto?.getRandomValues) throw new Error('crypto.getRandomValues indisponivel.');
  g.crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(8, '0')).join('');
}

/**
 * @param {object} [opts]
 * @param {number} [opts.balance]
 * @param {number} [opts.bet]
 * @param {import('./round.js').Engine} [opts.engine]
 * @param {'secure'|'provablyFair'} [opts.rngMode]
 * @param {string} [opts.clientSeed]
 * @param {string} [opts.serverSeed]
 */
export function createSession(opts = {}) {
  const engine = opts.engine ?? createEngine();
  let balance = opts.balance ?? DEFAULT_BALANCE;
  let bet = opts.bet ?? DEFAULT_BET;
  let rngMode = opts.rngMode ?? 'provablyFair';
  let serverSeed = opts.serverSeed ?? randomServerSeed();
  let clientSeed = opts.clientSeed ?? 'jogador';
  let nonce = 0;
  const secureRng = createSecureRng();

  const stats = {
    rounds: 0, wagered: 0, won: 0, biggestWin: 0, biggestWinX: 0,
    festa: 0, rave: 0, bought: 0, tongues: 0, spits: 0, frenzies: 0,
  };
  /** @type {import('./round.js').RoundResult[]} */
  const history = [];

  assertInt(balance, 'balance');
  assertBet(bet);

  /** @param {number} value */
  function assertBet(value) {
    if (!BET_LEVELS.includes(value)) throw new RangeError(`Aposta ${value} fora dos niveis permitidos.`);
  }

  /** @param {import('./config.js').ModeName} mode */
  const costFor = (mode) => moneyOf(bet, costX100Of(mode));

  /**
   * @param {object} [args]
   * @param {import('./config.js').ModeName} [args.mode]
   */
  function play({ mode = 'base' } = {}) {
    if (!MODES[mode]) throw new RangeError(`Modo desconhecido: ${String(mode)}`);
    const cost = costFor(mode);
    if (balance < cost) throw new RangeError(`Saldo insuficiente: precisa de ${cost}, tem ${balance}.`);

    const balanceBefore = balance;
    const roundNonce = nonce;
    const rng = rngMode === 'provablyFair'
      ? createProvablyFairRng({ serverSeed, clientSeed, nonce: roundNonce })
      : secureRng;

    balance -= cost;
    const result = engine.playRound({ rng, mode, trace: true });
    const win = moneyOf(bet, result.payoutX100);
    balance += win;
    nonce += 1;

    stats.rounds += 1;
    stats.wagered += cost;
    stats.won += win;
    if (win > stats.biggestWin) {
      stats.biggestWin = win;
      stats.biggestWinX = result.payoutX100 / 100;
    }
    if (result.feature === 'festa') stats.festa += 1;
    if (result.feature === 'rave') stats.rave += 1;
    if (result.bought) stats.bought += 1;
    for (const ev of result.events ?? []) {
      if (ev.type === 'freakyFrenzy') stats.frenzies += 1;
      if (ev.type === 'camel') {
        for (const c of ev.camels) stats[c.action === 'tongue' ? 'tongues' : 'spits'] += 1;
      }
    }
    history.unshift(result);
    if (history.length > 30) history.pop();

    return {
      result,
      bet,
      cost,
      win,
      balanceBefore,
      balanceAfter: balance,
      proof: { mode: rngMode, clientSeed, nonce: roundNonce, serverSeedHash: serverSeedHash() },
    };
  }

  function serverSeedHash() {
    return toHex(sha256(utf8(serverSeed)));
  }

  /** Revela a semente atual e sorteia outra (as rodadas passadas ficam verificaveis). */
  function rotateServerSeed() {
    const revealed = { serverSeed, hash: serverSeedHash(), rounds: nonce };
    serverSeed = randomServerSeed();
    nonce = 0;
    return { ...revealed, newHash: serverSeedHash() };
  }

  return {
    play,
    costFor,
    canAfford: (/** @type {import('./config.js').ModeName} */ mode) => balance >= costFor(mode),
    rotateServerSeed,
    serverSeedHash,
    getStats: () => ({ ...stats, rtp: stats.wagered ? stats.won / stats.wagered : 0 }),
    get history() { return history; },
    get balance() { return balance; },
    get bet() { return bet; },
    get nonce() { return nonce; },
    get clientSeed() { return clientSeed; },
    get rngMode() { return rngMode; },
    /** @param {number} value */
    setBet(value) { assertBet(value); bet = value; },
    /** @param {string} value */
    setClientSeed(value) {
      const v = String(value).trim();
      if (!v) throw new RangeError('A semente do cliente nao pode ser vazia.');
      clientSeed = v.slice(0, 64);
      nonce = 0;
    },
    /** @param {'secure'|'provablyFair'} value */
    setRngMode(value) { rngMode = value; },
    /** @param {number} value creditos de demonstracao */
    deposit(value) { assertInt(value, 'value'); balance += value; },
  };
}
