import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionCoverage, parseVtt } from '../src/captions.ts'

test('reads written captions with hours, tags and entities', () => {
  const t = parseVtt(
    'WEBVTT\nKind: captions\n\n1\n00:00:01.000 --> 00:00:02.500 align:start\n<v Ana>Hola &amp; bienvenidos</v>\n\n01:00:00,000 --> 01:00:01,000\n<i>fin</i>\n',
    'es',
  )
  assert.equal(t.language, 'es')
  assert.deepEqual(t.segments, [
    { start: 1, end: 2.5, text: 'Hola & bienvenidos' },
    { start: 3600, end: 3601, text: 'fin' },
  ])
})

test('YouTube rolling automatic captions come out once per sentence', () => {
  const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.160 --> 00:00:02.270 align:start position:0%
 
hello<00:00:00.480><c> everyone</c><00:00:00.800><c> and</c>

00:00:02.270 --> 00:00:02.280 align:start position:0%
hello everyone and
 

00:00:02.280 --> 00:00:04.990 align:start position:0%
hello everyone and
welcome<00:00:02.640><c> back</c>

00:00:04.990 --> 00:00:05.000 align:start position:0%
welcome back
 
`
  const t = parseVtt(vtt, 'es')
  assert.equal(t.language, 'en', 'the header wins over the fallback')
  assert.deepEqual(t.segments, [
    { start: 0.16, end: 2.27, text: 'hello everyone and' },
    { start: 2.28, end: 4.99, text: 'welcome back' },
  ])
})

test('a line said again after a pause is kept; a cue carried over without a pause is not', () => {
  const t = parseVtt(
    'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n¡Vamos!\n\n00:00:02.500 --> 00:00:03.500\n¡Vamos!\n\n00:00:04.000 --> 00:00:05.000\nUno, dos, tres.\n\n00:00:05.000 --> 00:00:06.000\nUno, dos, tres.\n',
    'es',
  )
  assert.deepEqual(t.segments, [
    { start: 1, end: 2, text: '¡Vamos!' },
    { start: 2.5, end: 3.5, text: '¡Vamos!' }, // it was dropped as a rolling repeat
    { start: 4, end: 5, text: 'Uno, dos, tres.' },
  ])
})

test('caption coverage counts overlapping lines once', () => {
  const seg = (start: number, end: number) => ({ start, end, text: 'x' })
  assert.equal(captionCoverage([seg(0, 10), seg(5, 15), seg(50, 60)], 100), 0.25)
  assert.equal(captionCoverage([seg(0, 30)], 600), 0.05)
  assert.equal(captionCoverage([], 60), 0)
  assert.equal(captionCoverage([seg(0, 1)], 0), 1)
})
