import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/engine/session.js';
import { Mode, costOf } from '../src/engine/round.js';
import { sha256, utf8, toHex } from '../src/engine/sha256.js';
import { BET_LEVELS_CENTS } from '../src/engine/config.js';

test('a carteira fecha: saldo final = inicial - apostado + ganho', () => {
  const inicial = 500000;
  const s = createSession({ balanceCents: inicial, serverSeed: 'semente-fixa' });
  for (let i = 0; i < 800; i++) {
    if (!s.canAfford(Mode.BASE)) break;
    s.play({ mode: Mode.BASE, trace: false });
  }
  const st = s.getStats();
  assert.equal(s.balanceCents, inicial - st.wageredCents + st.wonCents);
});

test('cada rodada debita exatamente o custo do modo', () => {
  const s = createSession({ balanceCents: 10_000_000, betCents: 100, serverSeed: 'debito' });
  for (const mode of [Mode.BASE, Mode.ANTE, Mode.BUY_FREE_SPINS, Mode.BUY_SUPER_FREE_SPINS]) {
    const antes = s.balanceCents;
    const { result } = s.play({ mode, trace: false });
    assert.equal(result.costCents, costOf(100, mode));
    assert.equal(s.balanceCents, antes - result.costCents + result.totalWinCents);
  }
});

test('o saldo nunca fica negativo e a aposta sem fundos e recusada', () => {
  const s = createSession({ balanceCents: 150, betCents: 100, serverSeed: 'fundos' });
  s.play({ mode: Mode.BASE, trace: false });
  // apos uma rodada perdedora sobram 50 centavos: nao da para outra
  if (s.balanceCents < 100) {
    assert.equal(s.canAfford(Mode.BASE), false);
    assert.throws(() => s.play({ mode: Mode.BASE }), RangeError);
  }
  assert.ok(s.balanceCents >= 0);
});

test('compra de bonus sem saldo e recusada antes de sortear', () => {
  const s = createSession({ balanceCents: 1000, betCents: 100, serverSeed: 'compra' });
  assert.equal(s.canAfford(Mode.BUY_FREE_SPINS), false);
  const antes = s.balanceCents;
  assert.throws(() => s.play({ mode: Mode.BUY_FREE_SPINS }), RangeError);
  assert.equal(s.balanceCents, antes, 'o saldo mudou numa rodada recusada');
  assert.equal(s.nonce, 0, 'a rodada recusada nao pode consumir nonce');
});

test('so niveis de aposta configurados sao aceitos', () => {
  const s = createSession({ serverSeed: 'aposta' });
  for (const nivel of BET_LEVELS_CENTS) assert.doesNotThrow(() => s.setBet(nivel));
  assert.throws(() => s.setBet(37), RangeError);
  assert.throws(() => s.setBet(0), RangeError);
  assert.throws(() => createSession({ betCents: 33 }), RangeError);
});

test('estatisticas da sessao sao consistentes', () => {
  const s = createSession({ balanceCents: 1_000_000, serverSeed: 'stats' });
  for (let i = 0; i < 400; i++) s.play({ mode: Mode.BASE, trace: false });
  const st = s.getStats();
  assert.equal(st.rounds, 400);
  assert.equal(st.wageredCents, 400 * s.betCents);
  assert.equal(st.netCents, st.wonCents - st.wageredCents);
  assert.ok(Math.abs(st.rtp - st.wonCents / st.wageredCents) < 1e-12);
  assert.ok(st.biggestWinCents >= 0);
  assert.equal(st.featuresTriggered + st.featuresBought >= 0, true);
});

test('o nonce avanca uma vez por rodada e a rodada e reproduzivel', () => {
  const opts = { balanceCents: 1_000_000, serverSeed: 'reproduzivel', clientSeed: 'eu' };
  const a = createSession(opts);
  const b = createSession(opts);
  for (let i = 0; i < 25; i++) {
    const ra = a.play({ mode: Mode.BASE, trace: false });
    const rb = b.play({ mode: Mode.BASE, trace: false });
    assert.equal(ra.result.totalWinCents, rb.result.totalWinCents, `rodada ${i} divergiu`);
    assert.equal(ra.proof.nonce, i);
  }
  assert.equal(a.nonce, 25);
});

test('trocar a semente do cliente muda os resultados e zera o nonce', () => {
  const a = createSession({ balanceCents: 1_000_000, serverSeed: 'sc', clientSeed: 'alfa' });
  const b = createSession({ balanceCents: 1_000_000, serverSeed: 'sc', clientSeed: 'beta' });
  const seqA = Array.from({ length: 20 }, () => a.play({ trace: false }).result.totalWinCents);
  const seqB = Array.from({ length: 20 }, () => b.play({ trace: false }).result.totalWinCents);
  assert.notDeepEqual(seqA, seqB);

  a.setClientSeed('gama');
  assert.equal(a.nonce, 0);
  assert.throws(() => a.setClientSeed('   '), RangeError);
});

test('o compromisso publicado bate com a semente revelada', () => {
  const s = createSession({ balanceCents: 1_000_000, serverSeed: 'segredo-do-servidor' });
  const compromisso = s.serverSeedHash();
  assert.equal(compromisso, toHex(sha256(utf8('segredo-do-servidor'))));

  for (let i = 0; i < 5; i++) s.play({ trace: false });
  const r = s.rotateServerSeed();

  assert.equal(r.revealedServerSeed, 'segredo-do-servidor');
  assert.equal(r.revealedHash, compromisso);
  assert.equal(r.roundsCovered, 5);
  assert.notEqual(r.newServerSeedHash, compromisso, 'a nova semente deve ser diferente');
  assert.equal(s.nonce, 0, 'a rotacao reinicia o nonce');
});

test('o modo seguro tambem joga (sem reproducibilidade)', () => {
  const s = createSession({ balanceCents: 1_000_000, rngMode: 'secure' });
  const { proof } = s.play({ trace: false });
  assert.equal(proof.mode, 'secure');
  assert.ok(s.balanceCents > 0);
});

test('o historico guarda as rodadas mais recentes com limite', () => {
  const s = createSession({ balanceCents: 10_000_000, serverSeed: 'hist' });
  for (let i = 0; i < 120; i++) s.play({ trace: false });
  assert.equal(s.history.length, 50);
  assert.equal(s.history[0].mode, Mode.BASE);
});

test('deposito de creditos de demonstracao soma ao saldo', () => {
  const s = createSession({ balanceCents: 100, serverSeed: 'dep' });
  s.deposit(50000);
  assert.equal(s.balanceCents, 50100);
  assert.throws(() => s.deposit(-1), RangeError);
  assert.throws(() => s.deposit(1.5), TypeError);
});
