import test from 'node:test';
import assert from 'node:assert/strict';
import { completude, inferirArea, habilidadesSugeridas } from '../src/core/perfil.js';
import { perfilVazio } from '../src/core/tipos.js';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { motorista, HOJE } from './ajuda.js';

test('perfil vazio está 0% e pede o cargo primeiro', () => {
  assert.deepEqual(completude(perfilVazio()), { porcento: 0, proximo: 'o cargo que você procura' });
});

test('perfil do motorista de exemplo chega perto de completo e diz o que falta', () => {
  const c = completude(motorista());
  assert.equal(c.porcento, 95);
  assert.equal(c.proximo, 'um resumo sobre você');
  assert.equal(completude(motorista({ resumo: 'Motorista experiente, sem acidentes em 25 anos.' })).porcento, 100);
});

test('inferirArea acha a área pelo cargo, inclusive por sinônimo', () => {
  const vagas = vagasDeExemplo(HOJE);
  assert.equal(inferirArea('motorista', vagas), 'Logística');
  assert.equal(inferirArea('faxineira', vagas), 'Limpeza e Conservação');
  assert.equal(inferirArea('programador', vagas), 'Tecnologia');
  assert.equal(inferirArea('', vagas), '');
  assert.equal(inferirArea('astronauta', vagas), '');
});

test('habilidadesSugeridas: mais pedidas da área, sem CNH e sem repetir', () => {
  const vagas = vagasDeExemplo(HOJE);
  const s = habilidadesSugeridas('Logística', vagas);
  assert.equal(s[0], 'direção defensiva');
  assert.ok(s.every((h) => !/cnh/i.test(h)));
  assert.equal(new Set(s.map((h) => h.toLowerCase())).size, s.length);
  assert.ok(s.length <= 10);
});
