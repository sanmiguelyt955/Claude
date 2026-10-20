import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { describeWithFallback, shouldFallback } from '../src/chain.ts'
import { BadReplyError, MinuteBudget, ProviderOverloadedError, parseRetryAfter, postJson, type VisionProvider } from '../src/providers/types.ts'

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

test('the minute budget waits for requests and tokens to leave the last minute', () => {
  let now = 0
  const b = new MinuteBudget(2, 100_000, () => now, 60_000) // 90k usable tokens
  assert.equal(b.readyInMs(80_000), 0)
  b.reserve(80_000)
  assert.equal(b.readyInMs(20_000), 60_000, 'tokens: wait until the first request leaves the minute')
  assert.equal(b.readyInMs(10_000), 0)
  b.reserve(10_000)
  now = 20_000
  assert.equal(b.readyInMs(1), 40_000, 'requests: two per minute already sent')
  now = 60_001
  assert.equal(b.readyInMs(80_000), 0, 'the first request left; 10k + 80k fit')
})

test('waits a little for the better model instead of dropping to Flash-Lite', async () => {
  const waits: number[] = []
  let busy = 20_000
  const main: VisionProvider = { ...fake(async () => '{"main":true}'), readyInMs: () => busy }
  const lite: VisionProvider = { ...fake(async () => '{"lite":true}'), fallbackOnly: true }
  const out = await describeWithFallback([main, lite], req, { sleep: async (ms) => { waits.push(ms); busy = 0 } })
  assert.equal(out.provider, main.name)
  assert.deepEqual(waits, [20_000])
})

test('uses Flash-Lite when the better model would keep the request waiting too long', async () => {
  const main: VisionProvider = { ...fake(async () => '{"main":true}'), readyInMs: () => 90_000 }
  const lite: VisionProvider = { ...fake(async () => '{"lite":true}'), fallbackOnly: true }
  const out = await describeWithFallback([main, lite], req, { sleep: noSleep })
  assert.equal(out.provider, lite.name)
})

test('a ready second model is used at once, without waiting for the first', async () => {
  const waits: number[] = []
  const first: VisionProvider = { ...fake(async () => '{}'), readyInMs: () => 30_000 }
  const second = fake(async () => '{}')
  const out = await describeWithFallback([first, second], req, { sleep: async (ms) => { waits.push(ms) } })
  assert.equal(out.provider, second.name)
  assert.deepEqual(waits, [])
})

test('a model out of daily quota stays out across the retry rounds', async () => {
  let daily = 0
  let flaky = 0
  const spent = fake(async () => { daily++; throw new ProviderOverloadedError('p', 429, '[GenerateRequestsPerDayPerProjectPerModel-FreeTier] quota', 10 * 3_600_000) })
  const busy = fake(async () => { flaky++; if (flaky < 3) throw overload(1_000); return '{"ok":true}' })
  const out = await describeWithFallback([spent, busy], req, { sleep: noSleep })
  assert.equal(out.text, '{"ok":true}')
  assert.equal(daily, 1, 'asked once, not again every round')
})

test('when every model is out of daily quota it says so at once instead of waiting', async () => {
  const spent = () => fake(async () => { throw new ProviderOverloadedError('p', 429, '[GenerateRequestsPerDayPerProjectPerModel-FreeTier] quota', 10 * 3_600_000) })
  const waits: number[] = []
  await assert.rejects(describeWithFallback([spent(), spent()], req, { sleep: async (ms) => { waits.push(ms) } }), /cuota del día/)
  assert.deepEqual(waits, [])
})

test('a demand spike (503) on every good model waits and retries them before using Flash-Lite', async () => {
  let a = 0
  let b = 0
  const first = fake(async () => { if (++a === 1) throw new ProviderOverloadedError('p', 503, 'UNAVAILABLE high demand'); return '{"first":true}' })
  const second = fake(async () => { b++; throw new ProviderOverloadedError('p', 503, 'UNAVAILABLE high demand') })
  const lite: VisionProvider = { ...fake(async () => '{"lite":true}'), fallbackOnly: true }
  const waits: number[] = []
  let clock = Date.now()
  const out = await describeWithFallback([first, second, lite], req, { now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms } })
  assert.equal(out.provider, first.name)
  assert.equal(waits.length, 1)
  assert.ok(waits[0]! <= 20_000, `a 503 pauses briefly, waited ${waits[0]}`)
})

test('a good model that keeps failing gives way to Flash-Lite instead of looping', async () => {
  const main = fake(async () => { throw new ProviderOverloadedError('p', 503, 'UNAVAILABLE high demand') })
  const lite: VisionProvider = { ...fake(async () => '{"lite":true}'), fallbackOnly: true }
  let clock = Date.now()
  const out = await describeWithFallback([main, lite], req, { now: () => clock, sleep: async (ms) => { clock += ms } })
  assert.equal(out.provider, lite.name)
})

test('waiting for its own per-minute turn is not a failed round, even with Flash-Lite alone', async () => {
  let clock = Date.now()
  let ready = clock + 200_000
  const lite: VisionProvider = { ...fake(async () => '{"lite":true}'), fallbackOnly: true, readyInMs: () => Math.max(0, ready - clock) }
  const out = await describeWithFallback([lite], req, { now: () => clock, maxRounds: 2, sleep: async (ms) => { clock += ms } })
  assert.equal(out.provider, lite.name)
})

test('a reply cut by the length limit goes to the next model, like an unparseable one', async () => {
  const cut = fake(async () => { throw new BadReplyError('respuesta cortada por el límite de longitud (MAX_TOKENS)') })
  const whole = fake(async () => '{"ok":true}')
  const out = await describeWithFallback([cut, whole], req, { sleep: noSleep })
  assert.equal(out.provider, whole.name)
  await assert.rejects(describeWithFallback([fake(async () => { throw new BadReplyError('cortada') })], req, { sleep: noSleep }), /Ningún proveedor/, 'so a window no model answers whole can be split')
})

test('a model that does not exist is set aside for the day instead of failing the job', async () => {
  let calls = 0
  const retired = fake(async () => { calls++; throw new ProviderOverloadedError('p', 404, 'el modelo no existe o fue retirado', 24 * 3_600_000) })
  const ok = fake(async () => '{"ok":true}')
  assert.equal((await describeWithFallback([retired, ok], req, { sleep: noSleep })).provider, ok.name)
  assert.equal((await describeWithFallback([retired, ok], req, { sleep: noSleep })).provider, ok.name)
  assert.equal(calls, 1)
})
