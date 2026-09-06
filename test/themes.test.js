import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeById, DEFAULT_THEME_ID } from '../src/ui/themes.js';
import { SYMBOLS } from '../src/engine/config.js';

test('todo tema veste todos os simbolos do motor', () => {
  for (const tema of THEMES) {
    for (const meta of SYMBOLS) {
      const pele = tema.symbols[meta.key];
      assert.ok(pele, `tema "${tema.id}" nao tem o simbolo ${meta.key}`);
      assert.ok(pele.name, `tema "${tema.id}": ${meta.key} sem nome`);
      assert.match(pele.color, /^#[0-9a-f]{6}$/i, `tema "${tema.id}": ${meta.key} com cor invalida`);
      assert.ok(pele.glyph || pele.art, `tema "${tema.id}": ${meta.key} sem arte nem emoji`);
    }
    // nenhum simbolo a mais: sobra vira arte morta que ninguem atualiza
    assert.deepEqual(
      Object.keys(tema.symbols).sort(),
      SYMBOLS.map((s) => s.key).sort(),
      `tema "${tema.id}" tem simbolos que o motor desconhece`,
    );
  }
});

test('todo tema define o mesmo conjunto de tokens', () => {
  const referencia = Object.keys(THEMES[0].tokens).sort();
  for (const tema of THEMES) {
    assert.deepEqual(Object.keys(tema.tokens).sort(), referencia,
      `tema "${tema.id}" define tokens diferentes — a interface ficaria com cor do tema anterior`);
    for (const [nome, valor] of Object.entries(tema.tokens)) {
      assert.match(nome, /^--[a-z0-9-]+$/, `token "${nome}" nao parece uma custom property`);
      assert.ok(String(valor).trim().length > 0, `token "${nome}" vazio no tema "${tema.id}"`);
    }
  }
});

test('identificadores de tema sao unicos e o padrao existe', () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ha temas com o mesmo id');
  assert.ok(ids.includes(DEFAULT_THEME_ID));
  assert.equal(themeById(DEFAULT_THEME_ID).id, DEFAULT_THEME_ID);
  assert.equal(themeById('nao-existe').id, THEMES[0].id, 'id desconhecido deve cair no primeiro tema');
});

test('cada tema tem nome, descricao e simbolo proprios', () => {
  for (const tema of THEMES) {
    assert.ok(tema.name && tema.tagline && tema.badge, `tema "${tema.id}" incompleto`);
  }
});
