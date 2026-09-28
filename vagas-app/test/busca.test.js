import test from 'node:test';
import assert from 'node:assert/strict';
import { buscar, removerRepetidas } from '../src/core/busca.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { motorista, HOJE } from './ajuda.js';

const vagas = vagasDeExemplo(HOJE);

test('removerRepetidas ignora caixa e acento e mantém a primeira', () => {
  const a = vagas[0];
  const copia = { ...a, id: 'outra', titulo: a.titulo.toUpperCase(), cidade: 'Sao Paulo' };
  const r = removerRepetidas([a, copia, vagas[1]]);
  assert.deepEqual(r.map((v) => v.id), [a.id, vagas[1].id]);
});

test('com perfil, ordena por chance e a melhor vaga do motorista é de motorista', () => {
  const r = buscar(vagas, {}, motorista(), HOJE);
  assert.equal(r.length, vagas.length);
  assert.match(r[0].vaga.titulo, /Motorista/);
  for (let i = 1; i < r.length; i++) {
    const susp = (/** @type {any} */ x) => x.alertas.some((/** @type {any} */ a) => a.nivel === 'grave');
    if (susp(r[i - 1]) === susp(r[i])) assert.ok((r[i - 1].chance?.nota ?? 0) >= (r[i].chance?.nota ?? 0));
  }
});

test('vagas suspeitas vão para o fim e podem ser escondidas', () => {
  const r = buscar(vagas, { ordenar: 'salario' }, null, HOJE);
  assert.ok(r.slice(-2).every((i) => i.vaga.id.startsWith('g')));
  const limpo = buscar(vagas, { esconderSuspeitas: true }, null, HOJE);
  assert.ok(limpo.every((i) => !i.vaga.id.startsWith('g')));
});

test('filtro de texto exige todas as palavras, sem acento', () => {
  const r = buscar(vagas, { texto: 'eletrica nr 10' }, null, HOJE);
  assert.deepEqual(r.map((i) => i.vaga.id), ['v03']);
});

test('filtro de UF mantém vagas remotas', () => {
  const r = buscar(vagas, { uf: 'PE' }, null, HOJE);
  assert.ok(r.every((i) => i.vaga.uf === 'PE' || i.vaga.modalidade === 'remoto'));
  assert.ok(r.some((i) => i.vaga.uf === 'PE'));
});

test('filtros de modalidade, contrato, salário, data e 50+', () => {
  assert.ok(buscar(vagas, { modalidades: ['hibrido'] }, null, HOJE).every((i) => i.vaga.modalidade === 'hibrido'));
  assert.ok(buscar(vagas, { contratos: ['PJ'] }, null, HOJE).every((i) => i.vaga.contrato === 'PJ'));
  assert.ok(buscar(vagas, { salarioMin: 500000 }, null, HOJE).every((i) => (i.vaga.salarioMax ?? 0) >= 500000));
  const recentes = buscar(vagas, { diasMax: 2 }, null, HOJE);
  assert.ok(recentes.length > 0 && recentes.every((i) => i.vaga.publicadaEm >= '2026-09-26'));
  assert.ok(buscar(vagas, { so50mais: true }, null, HOJE).every((i) => i.vaga.valorizaExperiencia));
});

test('sem perfil não calcula chance e ordena por data', () => {
  const r = buscar(vagas, {}, null, HOJE);
  assert.ok(r.every((i) => i.chance === null));
  const limpas = r.filter((i) => !i.vaga.id.startsWith('g'));
  for (let i = 1; i < limpas.length; i++) assert.ok(limpas[i - 1].vaga.publicadaEm >= limpas[i].vaga.publicadaEm);
});
