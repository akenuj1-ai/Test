import test from 'node:test';
import assert from 'node:assert/strict';
import { lerLocal, lerSalario, limparHtml, vagaExterna, hashTexto } from '../src/sources/comum.js';
import { converter as deJooble, buscarJooble } from '../src/sources/jooble.js';
import { converter as deCareerjet, buscarCareerjet, paraMensal } from '../src/sources/careerjet.js';
import { criarAgregador } from '../src/sources/agregador.js';

test('lerLocal entende os formatos comuns', () => {
  assert.deepEqual(lerLocal('Campinas, SP'), { cidade: 'Campinas', uf: 'SP' });
  assert.deepEqual(lerLocal('Belo Horizonte - Minas Gerais'), { cidade: 'Belo Horizonte', uf: 'MG' });
  assert.deepEqual(lerLocal('São Paulo'), { cidade: 'São Paulo', uf: 'SP' });
  assert.deepEqual(lerLocal('Recife, PE, Brasil'), { cidade: 'Recife', uf: 'PE' });
  assert.deepEqual(lerLocal(''), { cidade: '', uf: 'BR' });
});

test('lerSalario converte texto em centavos por mês', () => {
  assert.deepEqual(lerSalario('R$ 2.500 - R$ 3.000 por mês'), { min: 250000, max: 300000 });
  assert.deepEqual(lerSalario('R$ 1.800,50'), { min: 180100, max: 180100 });
  assert.deepEqual(lerSalario('R$ 36 mil por ano'), { min: 300000, max: 300000 });
  assert.deepEqual(lerSalario('R$ 48.000'), { min: 400000, max: 400000 }, 'valor alto é anual');
  assert.deepEqual(lerSalario('R$ 10 por hora'), { min: null, max: null }, 'abaixo de 100 é ignorado');
  assert.deepEqual(lerSalario('R$ 150 por hora'), { min: 3300000, max: 3300000 });
  assert.deepEqual(lerSalario('A combinar'), { min: null, max: null });
});

test('limparHtml e hashTexto', () => {
  assert.equal(limparHtml('<b>Auxiliar</b>&nbsp;de&amp;  estoque'), 'Auxiliar de& estoque');
  assert.equal(hashTexto('abc'), hashTexto('abc'));
  assert.notEqual(hashTexto('abc'), hashTexto('abd'));
});

test('vagaExterna preenche o que falta e detecta remoto e CNH', () => {
  const v = vagaExterna({ id: 'x', titulo: 'Vendedor home office', descricao: 'Necessário CNH e Excel.' });
  assert.equal(v.modalidade, 'remoto');
  assert.equal(v.cidade, 'Remoto');
  assert.ok(v.exigeCnh);
  assert.deepEqual(v.requisitos, ['excel', 'cnh']);
});

test('Jooble: converte e envia a busca por POST', async () => {
  const bruto = { id: 7, title: 'Porteiro', company: 'Condomínio X', location: 'Santos, SP', salary: 'R$ 2.000', snippet: '<b>Escala</b> 12x36', updated: '2026-09-27T10:00:00', link: 'https://br.jooble.org/desc/7', type: 'Tempo integral' };
  const v = deJooble(bruto);
  assert.equal(v.id, 'joo-7');
  assert.equal(v.uf, 'SP');
  assert.equal(v.cidade, 'Santos');
  assert.equal(v.salarioMin, 200000);
  assert.equal(v.descricao, 'Escala 12x36');
  assert.equal(v.fonte, 'Jooble');

  /** @type {any[]} */
  const chamadas = [];
  /** @type {any} */
  const f = async (/** @type {string} */ url, /** @type {any} */ init) => { chamadas.push([url, init]); return { ok: true, json: async () => ({ jobs: [bruto] }) }; };
  const r = await buscarJooble({ what: 'porteiro', where: 'SP', chave: 'k' }, f);
  assert.equal(r.length, 1);
  assert.equal(chamadas[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(chamadas[0][1].body), { keywords: 'porteiro', location: 'SP', page: '1' });
});

test('Careerjet: salário por período, id estável e erro da API', async () => {
  assert.equal(paraMensal(36000, 'Y'), 300000);
  assert.equal(paraMensal(3000, 'M'), 300000);
  assert.equal(paraMensal(undefined, 'M'), null);
  const bruto = { title: 'Soldador', company: 'Metal', locations: 'Joinville, SC', salary_min: 3200, salary_max: 3800, salary_type: 'M', date: 'Sat, 26 Sep 2026 10:00:00 GMT', url: 'https://jobviewtrack.com/x', description: 'Solda MIG' };
  const v = deCareerjet(bruto);
  assert.equal(v.id, deCareerjet(bruto).id);
  assert.equal(v.uf, 'SC');
  assert.equal(v.salarioMax, 380000);
  assert.equal(v.publicadaEm, '2026-09-26');

  /** @type {any} */
  const erro = async () => ({ ok: true, json: async () => ({ type: 'ERROR', error: 'affid inválido' }) });
  await assert.rejects(buscarCareerjet({ affid: 'x' }, erro), /affid/);
});

test('agregador: junta, remove repetidas, sobrevive a falha e tempo esgotado', async () => {
  const base = vagaExterna({ id: 'a', titulo: 'Motorista', empresa: 'X', cidade: 'Recife', uf: 'PE' });
  const ag = criarAgregador({
    tempoLimiteMs: 50,
    fontes: [
      { nome: 'boa', buscar: async () => [base, { ...base, id: 'b', titulo: 'Porteiro' }] },
      { nome: 'repetida', buscar: async () => [{ ...base, id: 'c' }] },
      { nome: 'quebrada', buscar: async () => { throw new Error('500'); } },
      { nome: 'lenta', buscar: () => new Promise((ok) => setTimeout(() => ok([]), 500)) },
    ],
  });
  const r = await ag.buscar({ what: 'x' });
  assert.deepEqual(r.vagas.map((v) => v.id), ['a', 'b']);
  assert.deepEqual(r.fontes.map((f) => [f.nome, f.ok]), [['boa', true], ['repetida', true], ['quebrada', false], ['lenta', false]]);
  assert.match(/** @type {string} */ (r.fontes[3].erro), /tempo/);
});

test('agregador: cache por busca normalizada, expira e não guarda falha total', async () => {
  let t = 0;
  let chamadas = 0;
  let falhar = true;
  const ag = criarAgregador({
    ttlMs: 1000, agora: () => t,
    fontes: [{ nome: 'f', buscar: async () => { chamadas++; if (falhar) throw new Error('fora'); return []; } }],
  });
  await ag.buscar({ what: 'Motorista' });
  await ag.buscar({ what: 'Motorista' });
  assert.equal(chamadas, 2, 'falha total não fica em cache');
  falhar = false;
  await ag.buscar({ what: 'Motorista' });
  const r = await ag.buscar({ what: 'motorista ' });
  assert.equal(chamadas, 3);
  assert.equal(r.cache, true);
  t = 2000;
  await ag.buscar({ what: 'motorista' });
  assert.equal(chamadas, 4, 'expirou');
});
