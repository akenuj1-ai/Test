import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, palavras, termosBatem, semelhanca, formatarSalario } from '../src/core/text.js';

test('normalizar tira acento, caixa e pontuação', () => {
  assert.equal(normalizar('  Eletricista PREDIAL — São Paulo! '), 'eletricista predial sao paulo');
});

test('palavras descarta preposições e repetições', () => {
  assert.deepEqual(palavras('Auxiliar de limpeza e de limpeza'), ['auxiliar', 'limpeza']);
});

test('termosBatem aceita contido e conjunto de palavras', () => {
  assert.ok(termosBatem('excel', 'Excel avançado'));
  assert.ok(termosBatem('atendimento ao cliente', 'Cliente: atendimento'));
  assert.ok(!termosBatem('excel', 'word'));
  assert.ok(!termosBatem('', 'word'));
});

test('semelhanca é a fração de palavras do primeiro presentes no segundo', () => {
  assert.equal(semelhanca('motorista entregador', 'motorista'), 0.5);
  assert.equal(semelhanca('', 'x'), 0);
});

test('formatarSalario lida com faixa, valor único e ausência', () => {
  assert.equal(formatarSalario(null, null), 'A combinar');
  assert.match(formatarSalario(150000, 200000), /1\.500,00 a .*2\.000,00/);
  assert.match(formatarSalario(150000, 150000), /^R\$\s1\.500,00$/);
});
