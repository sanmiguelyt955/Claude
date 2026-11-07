'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { uniqueCombinations, totalCombinations } = require('../src/combinations');
const { buildFfmpegArgs } = require('../src/render');

const roles = { apertura: ['a1', 'a2'], demo: ['d1', 'd2', 'd3'], cierre: ['c1', 'c2'] };

test('total de combinaciones es el producto de los roles', () => {
  assert.equal(totalCombinations(roles), 12);
});

test('no repite combinaciones y respeta el límite', () => {
  const combos = uniqueCombinations(roles, 8, 42);
  assert.equal(combos.length, 8);
  const keys = combos.map((c) => c.clips.join('|'));
  assert.equal(new Set(keys).size, keys.length);
});

test('si se pide más de lo posible, devuelve todas sin repetir', () => {
  const combos = uniqueCombinations(roles, 100, 7);
  assert.equal(combos.length, 12);
});

test('el mismo seed produce el mismo resultado', () => {
  const a = uniqueCombinations(roles, 5, 3).map((c) => c.clips);
  const b = uniqueCombinations(roles, 5, 3).map((c) => c.clips);
  assert.deepEqual(a, b);
});

test('cada combinación respeta el orden de roles', () => {
  for (const { clips } of uniqueCombinations(roles, 12, 1)) {
    assert.ok(roles.apertura.includes(clips[0]));
    assert.ok(roles.demo.includes(clips[1]));
    assert.ok(roles.cierre.includes(clips[2]));
  }
});

test('un rol vacío es un error', () => {
  assert.throws(() => uniqueCombinations({ apertura: [] }, 1), /no tiene clips/);
});

test('los argumentos de FFmpeg generan salida 1080x1920', () => {
  const args = buildFfmpegArgs(['x.mp4', 'y.mp4'], 'out.mp4');
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /scale=1080:1920/);
  assert.match(filter, /crop=1080:1920/);
  assert.match(filter, /concat=n=2:v=1:a=1/);
  assert.equal(args[args.length - 1], 'out.mp4');
});
