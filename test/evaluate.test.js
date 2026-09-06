import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGrid, payoutX100, scatterPayX100 } from '../src/engine/evaluate.js';
import { buildPayLookup, buildScatterLookup, scalePaytable, COUNT_SLOTS } from '../src/engine/paytable.js';
import { GRID, Sym, PAYTABLE, SCATTER_PAYS, MIN_CLUSTER, PAYING_FIRST, PAYING_LAST } from '../src/engine/config.js';

const { CELLS } = GRID;

/**
 * Monta uma grade a partir de {simbolo: quantidade}. O resto vira SCATTER,
 * que nunca forma combinacao — assim o preenchimento nao cria ganho acidental.
 * @param {Record<number, number>} spec
 */
function gridOf(spec) {
  const grid = new Int8Array(CELLS).fill(Sym.SCATTER);
  let i = 0;
  for (const [sym, count] of Object.entries(spec)) {
    for (let k = 0; k < Number(count); k++) grid[i++] = Number(sym);
  }
  assert.ok(i <= CELLS, 'especificacao maior que a grade');
  return grid;
}

test('menos de 8 simbolos nao paga', () => {
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    for (let n = 0; n < MIN_CLUSTER; n++) {
      assert.equal(payoutX100(s, n), 0, `simbolo ${s} pagou com ${n}`);
    }
  }
});

test('as tres faixas da tabela sao respeitadas nos limites', () => {
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    const [[, , low], [, , mid], [, , high]] = PAYTABLE[s];
    assert.equal(payoutX100(s, 8), low);
    assert.equal(payoutX100(s, 9), low);
    assert.equal(payoutX100(s, 10), mid);
    assert.equal(payoutX100(s, 11), mid);
    assert.equal(payoutX100(s, 12), high);
    assert.equal(payoutX100(s, 30), high, 'a faixa mais alta deve valer ate 30');
  }
});

test('premio nunca diminui quando a contagem aumenta', () => {
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    let previous = 0;
    for (let n = MIN_CLUSTER; n <= CELLS; n++) {
      const pay = payoutX100(s, n);
      assert.ok(pay >= previous, `simbolo ${s}: pagamento caiu de ${previous} para ${pay} em ${n}`);
      previous = pay;
    }
  }
});

test('simbolos altos pagam mais que os baixos na mesma faixa', () => {
  for (let n of [8, 10, 12]) {
    for (let s = PAYING_FIRST; s < PAYING_LAST; s++) {
      assert.ok(payoutX100(s + 1, n) >= payoutX100(s, n),
        `ordem de valor quebrada entre ${s} e ${s + 1} em ${n} simbolos`);
    }
  }
});

test('scatter e orbe nunca formam combinacao', () => {
  for (let n = 0; n <= CELLS; n++) {
    assert.equal(payoutX100(Sym.SCATTER, n), 0);
    assert.equal(payoutX100(Sym.ORB, n), 0);
  }
});

test('avaliacao de uma grade com duas combinacoes soma os dois premios', () => {
  const grid = gridOf({ [Sym.CROWN]: 12, [Sym.BLUE]: 8 });
  const r = evaluateGrid(grid, 100, { collectPositions: true });

  assert.equal(r.wins.length, 2);
  const crown = r.wins.find((w) => w.symbolId === Sym.CROWN);
  const blue = r.wins.find((w) => w.symbolId === Sym.BLUE);
  assert.equal(crown?.count, 12);
  assert.equal(crown?.payCents, 5000);   // 50x sobre 1,00
  assert.equal(blue?.payCents, 25);      // 0,25x
  assert.equal(r.winCents, 5025);
  assert.equal(crown?.positions?.length, 12);
});

test('a mascara de remocao cobre exatamente as celulas vencedoras', () => {
  const grid = gridOf({ [Sym.RED]: 9, [Sym.GREEN]: 3 });
  const r = evaluateGrid(grid, 100, {});
  assert.ok(r.removeMask);
  let marked = 0;
  for (let i = 0; i < CELLS; i++) {
    if (r.removeMask[i]) { marked += 1; assert.equal(grid[i], Sym.RED); }
  }
  assert.equal(marked, 9, 'GREEN com 3 nao devia ser removido');
});

test('grade sem combinacao devolve mascara nula', () => {
  const r = evaluateGrid(gridOf({ [Sym.RED]: 7, [Sym.BLUE]: 7 }), 100, {});
  assert.equal(r.removeMask, null);
  assert.equal(r.winCents, 0);
  assert.deepEqual(r.wins, []);
});

test('scatter so paga quando payScatter esta ligado', () => {
  const grid = new Int8Array(CELLS).fill(Sym.CROWN);
  for (let i = 0; i < 4; i++) grid[i] = Sym.SCATTER;

  const semPagar = evaluateGrid(grid, 100, {});
  assert.equal(semPagar.scatterCount, 4);
  assert.equal(semPagar.scatterPayCents, 0);

  const pagando = evaluateGrid(grid, 100, { payScatter: true });
  assert.equal(pagando.scatterPayCents, SCATTER_PAYS[4]); // 3x sobre 1,00 = 300
});

test('6 ou mais scatters caem na faixa maxima', () => {
  assert.equal(scatterPayX100(6), SCATTER_PAYS[6]);
  assert.equal(scatterPayX100(12), SCATTER_PAYS[6]);
  assert.equal(scatterPayX100(3), 0);
  assert.equal(scatterPayX100(0), 0);
});

test('collectPositions=false nao aloca posicoes (caminho quente da simulacao)', () => {
  const r = evaluateGrid(gridOf({ [Sym.RED]: 10 }), 100, { collectPositions: false });
  assert.equal(r.wins[0].positions, undefined);
});

test('tabela pre-calculada bate com a leitura direta da configuracao', () => {
  const lookup = buildPayLookup();
  for (let s = PAYING_FIRST; s <= PAYING_LAST; s++) {
    for (let n = 0; n < COUNT_SLOTS; n++) {
      const direct = n < MIN_CLUSTER ? 0
        : (PAYTABLE[s].find(([min, max]) => n >= min && n <= max)?.[2]
           ?? PAYTABLE[s][PAYTABLE[s].length - 1][2]);
      assert.equal(lookup[s * COUNT_SLOTS + n], direct, `divergiu em simbolo ${s}, contagem ${n}`);
    }
  }
  const sc = buildScatterLookup();
  assert.equal(sc[4], SCATTER_PAYS[4]);
  assert.equal(sc[30], SCATTER_PAYS[SCATTER_PAYS.length - 1]);
});

test('escalar a tabela mantem premios inteiros e multiplos de 5', () => {
  const scaled = scalePaytable(PAYTABLE, 0.5274);
  for (const tiers of scaled) {
    for (const [, , pay] of tiers) {
      assert.ok(Number.isInteger(pay) && pay % 5 === 0, `premio invalido apos escala: ${pay}`);
      assert.ok(pay >= 5, 'premio escalado nao pode zerar');
    }
  }
});

test('tabela alternativa e usada quando injetada', () => {
  const dobrada = buildPayLookup(scalePaytable(PAYTABLE, 2));
  const grid = gridOf({ [Sym.CROWN]: 12 });
  const normal = evaluateGrid(grid, 100, {});
  const dobro = evaluateGrid(grid, 100, { payLookup: dobrada });
  assert.equal(dobro.winCents, normal.winCents * 2);
});
