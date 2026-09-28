import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularChance, PESOS, TETO_ELIMINATORIO } from '../src/core/match.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { motorista, HOJE } from './ajuda.js';

const vagas = vagasDeExemplo(HOJE);
const porId = (/** @type {string} */ id) => /** @type {import('../src/core/tipos.js').Vaga} */ (vagas.find((v) => v.id === id));

test('pesos somam 100', () => {
  assert.equal(Object.values(PESOS).reduce((a, b) => a + b, 0), 100);
});

test('motorista experiente em SP tem chance alta na vaga de motorista em SP', () => {
  const r = calcularChance(motorista(), porId('v01'));
  assert.equal(r.faixa, 'alta');
  assert.ok(r.nota >= 85, `nota ${r.nota}`);
  assert.ok(r.requisitosAtendidos.includes('CNH categoria B'));
  assert.ok(r.motivos.some((m) => m.includes('50+')));
});

test('sem CNH, vaga que exige CNH fica no teto eliminatório', () => {
  const r = calcularChance(motorista({ temCnh: false }), porId('v01'));
  assert.ok(r.eliminatorio);
  assert.ok(r.nota <= TETO_ELIMINATORIO);
  assert.match(r.faltando[0], /CNH/);
});

test('vaga presencial em outro estado é eliminatória', () => {
  const r = calcularChance(motorista(), porId('v18')); // Goiânia
  assert.ok(r.eliminatorio);
  assert.ok(r.nota <= TETO_ELIMINATORIO);
});

test('quem só aceita remoto não recebe nota alta em vaga presencial', () => {
  const r = calcularChance(motorista({ aceitaRemoto: 'sim' }), porId('v01'));
  assert.ok(r.eliminatorio);
});

test('vaga remota pontua o local cheio para quem aceita remoto', () => {
  const dev = motorista({
    cidade: 'Recife', uf: 'PE', cargoDesejado: 'Desenvolvedor Front-end', area: 'Tecnologia', aceitaRemoto: 'sim',
    habilidades: ['JavaScript', 'React', 'HTML', 'CSS', 'Git'], escolaridade: 'superior', anosExperiencia: 4, salarioMin: 0, experiencias: [],
  });
  const r = calcularChance(dev, porId('v06'));
  assert.equal(r.nota, 100);
  assert.deepEqual(r.faltando, []);
});

test('falta de requisito vira instrução acionável', () => {
  const r = calcularChance(motorista(), porId('v05')); // auxiliar administrativo
  assert.ok(r.faltando.some((f) => f.startsWith('Requisito: excel')));
  assert.ok(r.nota < 70);
});

test('salário abaixo do pedido reduz a nota e avisa', () => {
  const caro = calcularChance(motorista({ salarioMin: 1_000_000 }), porId('v01'));
  const ok = calcularChance(motorista(), porId('v01'));
  assert.ok(caro.nota < ok.nota);
  assert.ok(caro.faltando.some((f) => f.includes('abaixo')));
});

test('nota é sempre inteira entre 0 e 100 para todo par perfil × vaga', () => {
  const perfis = [motorista(), motorista({ temCnh: false, aceitaRemoto: 'sim', anosExperiencia: 0, habilidades: [] })];
  for (const p of perfis) for (const v of vagas) {
    const { nota } = calcularChance(p, v);
    assert.ok(Number.isInteger(nota) && nota >= 0 && nota <= 100, `${v.id}: ${nota}`);
  }
});
