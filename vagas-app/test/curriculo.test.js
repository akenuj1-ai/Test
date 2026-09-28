import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarCurriculo, gerarCarta, prepararEntrevista, ordenarHabilidades } from '../src/core/curriculo.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { motorista, HOJE } from './ajuda.js';

const vagas = vagasDeExemplo(HOJE);
const v01 = /** @type {any} */ (vagas.find((v) => v.id === 'v01'));

test('habilidades pedidas pela vaga vêm primeiro', () => {
  const p = motorista({ habilidades: ['cozinhar', 'atendimento ao cliente', 'direção defensiva'] });
  const r = ordenarHabilidades(p, v01);
  assert.deepEqual(r.slice(-1), ['cozinhar']);
  assert.equal(r.length, 3);
});

test('currículo adaptado cita a vaga e a empresa e não inventa nada', () => {
  const p = motorista();
  const cv = gerarCurriculo(p, v01);
  assert.match(cv, /JOSÉ DA SILVA/);
  assert.match(cv, /Atuar como Motorista Entregador na Rota Sul Logística, com 25 anos de experiência em direção defensiva, conhecer a cidade\./);
  assert.match(cv, /Possui CNH/);
  assert.match(cv, /Transportadora X/);
  // só habilidades que a pessoa informou
  const blocos = cv.split('HABILIDADES\n')[1].split('\n\n')[0].split('\n');
  assert.deepEqual(blocos.map((l) => l.replace('• ', '')).sort(), [...p.habilidades].sort());
});

test('currículo genérico funciona sem vaga e com perfil quase vazio', () => {
  const cv = gerarCurriculo(motorista({ nome: '', experiencias: [], habilidades: [], resumo: '' }));
  assert.match(cv, /SEU NOME/);
  assert.match(cv, /FORMAÇÃO/);
});

test('carta menciona empresa, vaga e requisitos atendidos', () => {
  const carta = gerarCarta(motorista(), v01);
  assert.match(carta, /Rota Sul Logística/);
  assert.match(carta, /Motorista Entregador em São Paulo/);
  assert.match(carta, /direção defensiva/);
  assert.match(carta, /maturidade/);
});

test('entrevista inclui perguntas da área, do requisito que falta e da idade', () => {
  const p = motorista({ habilidades: [] });
  const perguntas = prepararEntrevista(p, v01).map((x) => x.pergunta);
  assert.ok(perguntas.some((q) => /multa/.test(q)));
  assert.ok(perguntas.some((q) => /Você tem experiência com/.test(q)));
  assert.ok(perguntas.some((q) => /experiência demais/.test(q)));
  assert.ok(perguntas.some((q) => /sem trabalhar/.test(q)));
});
