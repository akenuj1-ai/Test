import test from 'node:test';
import assert from 'node:assert/strict';
import { alertasDeGolpe, ehSuspeita } from '../src/core/golpe.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { HOJE } from './ajuda.js';

const vagas = vagasDeExemplo(HOJE);

test('as duas vagas-golpe de exemplo são detectadas', () => {
  for (const id of ['g01', 'g02']) {
    const v = /** @type {any} */ (vagas.find((x) => x.id === id));
    assert.ok(ehSuspeita(v), id);
  }
});

test('nenhuma vaga legítima de exemplo é marcada como golpe', () => {
  for (const v of vagas.filter((x) => !x.id.startsWith('g'))) {
    assert.deepEqual(alertasDeGolpe(v), [], v.id);
  }
});

test('cada sinal é identificado com motivo próprio', () => {
  const g01 = /** @type {any} */ (vagas.find((x) => x.id === 'g01'));
  const motivos = alertasDeGolpe(g01).map((a) => a.motivo).join(' | ');
  assert.match(motivos, /pagamento/);
  assert.match(motivos, /Salário muito acima/);
  assert.match(motivos, /WhatsApp/);
  assert.match(motivos, /Pressão/);

  const g02 = /** @type {any} */ (vagas.find((x) => x.id === 'g02'));
  const m2 = alertasDeGolpe(g02).map((a) => a.motivo).join(' | ');
  assert.match(m2, /curso pago/);
  assert.match(m2, /dados bancários/);
});
