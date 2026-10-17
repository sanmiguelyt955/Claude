import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { describeWithFallback, shouldFallback } from '../src/chain.ts'
import { ProviderOverloadedError, parseRetryAfter, postJson, type VisionProvider } from '../src/providers/types.ts'

const req = { frames: [], transcript: '', instruction: 'x' }
let seq = 0
const fake = (impl: () => Promise<string>, available = true): VisionProvider => ({
  name: `p${++seq}`,
  available: () => available,
  describe: impl,
})
const overload = (retryAfterMs?: number) => new ProviderOverloadedError('p', 503, 'high demand', retryAfterMs)
const noSleep = async () => {}

test('falls back to the next provider on overload', async () => {
  const primary = fake(async () => { throw overload() })
  const backup = fake(async () => '{"ok":true}')
  const out = await describeWithFallback([primary, backup], req, { sleep: noSleep })
  assert.equal(out.provider, backup.name)
})

test('skips providers without a key without calling them', async () => {
  let called = false
  const noKey = fake(async () => { called = true; return '' }, false)
  await describeWithFallback([noKey, fake(async () => '{}')], req)
  assert.equal(called, false)
})

test('does not fall back on a real request error', async () => {
  const bad = fake(async () => { throw new Error('claude HTTP 400: invalid image') })
  await assert.rejects(describeWithFallback([bad, fake(async () => '{}')], req), /invalid image/)
})

test('an overloaded provider is skipped by later requests while paused', async () => {
  let calls = 0
  const p = fake(async () => { calls++; throw overload() })
  const backup = fake(async () => '{}')
  await describeWithFallback([p, backup], req, { cooldownMs: 60_000 })
  await describeWithFallback([p, backup], req, { cooldownMs: 60_000 })
  assert.equal(calls, 1)
})

test('with a single provider, a 503 waits for Retry-After and retries instead of failing', async () => {
  let calls = 0
  const only = fake(async () => {
    calls++
    if (calls === 1) throw overload(5_000)
    return '{"ok":true}'
  })
  const waits: number[] = []
  const out = await describeWithFallback([only], req, { sleep: async (ms) => { waits.push(ms) } })
  assert.equal(out.text, '{"ok":true}')
  assert.equal(calls, 2)
  assert.equal(waits.length, 1)
  assert.ok(waits[0]! > 4_000 && waits[0]! <= 5_000, `waited ${waits[0]}`)
})

test('a huge Retry-After is capped by maxWaitMs', async () => {
  let calls = 0
  const only = fake(async () => { if (++calls === 1) throw overload(3_600_000); return 'ok' })
  const waits: number[] = []
  await describeWithFallback([only], req, { maxWaitMs: 1_000, sleep: async (ms) => { waits.push(ms) } })
  assert.equal(waits[0], 1_000)
})

test('gives up after maxRounds when the provider never recovers', async () => {
  let calls = 0
  const only = fake(async () => { calls++; throw overload(10) })
  await assert.rejects(describeWithFallback([only], req, { maxRounds: 3, sleep: noSleep }), /Ningún proveedor/)
  assert.equal(calls, 3)
})

test('an unparseable reply goes to the next provider', async () => {
  const garbage = fake(async () => 'no es json')
  const good = fake(async () => '{"a":1}')
  const out = await describeWithFallback([garbage, good], req, { parse: (t) => JSON.parse(t) as { a: number } })
  assert.equal(out.provider, good.name)
  assert.deepEqual(out.value, { a: 1 })
})

test('when every reply is unparseable it fails without waiting', async () => {
  let slept = false
  const garbage = fake(async () => 'nope')
  await assert.rejects(
    describeWithFallback([garbage], req, { parse: (t) => JSON.parse(t), sleep: async () => { slept = true } }),
    /respuesta no válida/,
  )
  assert.equal(slept, false)
})

test('classifies overload messages', () => {
  assert.equal(shouldFallback(new Error('model UNAVAILABLE, high demand')), true)
  assert.equal(shouldFallback(new Error('HTTP 400 bad request')), false)
})

test('parseRetryAfter reads seconds and HTTP dates', () => {
  assert.equal(parseRetryAfter('7'), 7_000)
  assert.equal(parseRetryAfter(null), undefined)
  const inTen = new Date(Date.now() + 10_000).toUTCString()
  const ms = parseRetryAfter(inTen)!
  assert.ok(ms > 8_000 && ms <= 10_000, `got ${ms}`)
})

test('postJson maps 529, timeouts and 400 correctly', async () => {
  const server = http.createServer((r, res) => {
    if (r.url === '/overloaded') { res.writeHead(529, { 'retry-after': '7' }); res.end('{"type":"overloaded_error"}'); return }
    if (r.url === '/slow') { setTimeout(() => { res.writeHead(200); res.end('{}') }, 500); return }
    res.writeHead(400); res.end('bad image')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const saved = process.env.VISION_TIMEOUT_MS
  process.env.VISION_TIMEOUT_MS = '100'
  try {
    await assert.rejects(postJson('claude', `${base}/overloaded`, {}, {}), (e: unknown) =>
      e instanceof ProviderOverloadedError && e.retryAfterMs === 7_000)
    await assert.rejects(postJson('claude', `${base}/slow`, {}, {}), (e: unknown) =>
      e instanceof ProviderOverloadedError && /timeout/.test(e.message))
    await assert.rejects(postJson('claude', `${base}/bad`, {}, {}), (e: unknown) =>
      !(e instanceof ProviderOverloadedError) && /HTTP 400/.test(String(e)))
  } finally {
    if (saved === undefined) delete process.env.VISION_TIMEOUT_MS
    else process.env.VISION_TIMEOUT_MS = saved
    server.close()
  }
})
