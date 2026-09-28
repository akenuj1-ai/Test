import test from 'node:test';
import assert from 'node:assert/strict';
import { converter, montarUrl, buscarAdzuna, salarioMensal, extrairRequisitos } from '../src/sources/adzuna.js';

const EXEMPLO = {
  id: '4242',
  title: '<strong>Auxiliar</strong> de Estoque',
  company: { display_name: 'Loja Exemplo' },
  location: { display_name: 'Campinas, São Paulo', area: ['Brasil', 'São Paulo', 'Campinas'] },
  salary_min: 24000, salary_max: 30000,
  description: 'Controle de estoque e uso de Excel. Necessário CNH.',
  created: '2026-09-20T10:00:00Z',
  redirect_url: 'https://www.adzuna.com.br/details/4242',
  category: { label: 'Logística Vagas' },
  contract_type: 'permanent',
};

test('converte resultado da Adzuna para Vaga', () => {
  const v = converter(EXEMPLO);
  assert.equal(v.id, 'adz-4242');
  assert.equal(v.titulo, 'Auxiliar de Estoque');
  assert.equal(v.uf, 'SP');
  assert.equal(v.cidade, 'Campinas');
  assert.equal(v.contrato, 'CLT');
  assert.equal(v.area, 'Logística');
  assert.equal(v.publicadaEm, '2026-09-20');
  assert.ok(v.exigeCnh);
  assert.deepEqual(v.requisitos, ['excel', 'cnh', 'controle de estoque']);
  assert.equal(v.salarioMin, 200000); // 24.000/ano → R$ 2.000/mês
});

test('salário: anual vira mensal, mensal fica, ausente vira null', () => {
  assert.equal(salarioMensal(24000), 200000); // anual → R$ 2.000/mês
  assert.equal(salarioMensal(120000), 1000000); // anual → R$ 10.000/mês
  assert.equal(salarioMensal(3000), 300000); // já mensal
  assert.equal(salarioMensal(undefined), null);
});

test('extrairRequisitos só reconhece termos conhecidos inteiros', () => {
  assert.deepEqual(extrairRequisitos('Excel avançado e inglês'), ['excel', 'inglês']);
  assert.deepEqual(extrairRequisitos('excelente comunicação'), []);
});

test('montarUrl e buscarAdzuna usam a API do Brasil e tratam erro', async () => {
  const url = montarUrl({ what: 'motorista', where: 'São Paulo', appId: 'a', appKey: 'b' });
  assert.match(url, /\/jobs\/br\/search\/1\?/);
  assert.match(url, /what=motorista/);

  /** @type {any} */
  const ok = async () => ({ ok: true, json: async () => ({ results: [EXEMPLO] }) });
  const vagas = await buscarAdzuna({ appId: 'a', appKey: 'b' }, ok);
  assert.equal(vagas.length, 1);

  /** @type {any} */
  const falha = async () => ({ ok: false, status: 401 });
  await assert.rejects(buscarAdzuna({ appId: 'a', appKey: 'b' }, falha), /401/);
});
