import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { estimateTokens, geminiModel, geminiProviders, maxFramesPerRequest } from '../src/providers/gemini.ts'
import { ProviderOverloadedError, quotaDetail, retryAfterOf } from '../src/providers/types.ts'
import { describeWithFallback } from '../src/chain.ts'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// A fake Gemini API: each model name in the URL picks a behaviour.
const requests: Array<{ url: string; key: string | undefined; body: Record<string, unknown> }> = []
const sse = (res: http.ServerResponse, events: unknown[]) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\r\n\r\n`)
  res.end()
}
const textChunk = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    requests.push({ url: req.url ?? '', key: req.headers['x-goog-api-key'] as string | undefined, body: JSON.parse(raw) })
    const model = /models\/([^:]+):/.exec(req.url ?? '')?.[1]
    if (model === 'ok') return sse(res, [textChunk('{"a":'), { candidates: [{ content: { parts: [{ text: '', thought: true }, { text: '1}' }] } }] }])
    if (model === 'busy') {
      res.writeHead(503, { 'retry-after': '7' })
      return res.end('{"error":{"code":503,"status":"UNAVAILABLE","message":"high demand"}}')
    }
    if (model === 'drops') return sse(res, [textChunk('{"a":'), { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } }])
    if (model === 'bad') {
      res.writeHead(400)
      return res.end('{"error":{"code":400,"message":"bad request"}}')
    }
    if (model === 'picky' && /thinkingConfig/.test(raw)) {
      res.writeHead(400)
      return res.end('{"error":{"code":400,"message":"Unknown name \\"thinkingConfig\\" at generation_config"}}')
    }
    if (model === 'picky') return sse(res, [textChunk('{"ok":true}')])
    if (model === 'silent') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      return // never writes: the idle timeout must cut it
    }
    res.writeHead(404)
    res.end()
  })
})

const saved = { ...process.env }
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.GEMINI_API_KEY = 'test-key'
})
after(() => {
  server.closeAllConnections()
  server.close()
  process.env = saved
})

const req = { frames: [], instruction: 'di algo' }

test('streams the reply, skips thought parts and sends no sampling parameters', async () => {
  requests.length = 0
  assert.equal(await geminiModel('ok').describe(req), '{"a":1}')
  const sent = requests[0]!
  assert.match(sent.url, /\/v1beta\/models\/ok:streamGenerateContent\?alt=sse$/)
  assert.equal(sent.key, 'test-key')
  assert.deepEqual(sent.body.generationConfig, { responseMimeType: 'application/json' })
  assert.doesNotMatch(JSON.stringify(sent.body), /temperature|topP|topK/)
})

test('a 503 is an overload with its Retry-After; a 400 is a real error', async () => {
  const busy = await geminiModel('busy').describe(req).catch((e) => e)
  assert.ok(busy instanceof ProviderOverloadedError)
  assert.equal(busy.retryAfterMs, 7000)
  const bad = await geminiModel('bad').describe(req).catch((e) => e)
  assert.ok(!(bad instanceof ProviderOverloadedError))
  assert.match(String(bad), /HTTP 400/)
})

test('an error event in the middle of the stream counts as an overload', async () => {
  await assert.rejects(geminiModel('drops').describe(req), ProviderOverloadedError)
})

test('a stream that goes quiet is cut by the idle timeout', async () => {
  process.env.VISION_IDLE_TIMEOUT_MS = '300'
  try {
    const err = await geminiModel('silent').describe(req).catch((e) => e)
    assert.ok(err instanceof ProviderOverloadedError)
    assert.match(String(err), /timeout/)
  } finally {
    delete process.env.VISION_IDLE_TIMEOUT_MS
  }
})

test('a saturated model falls over to the next Gemini model', async () => {
  process.env.GEMINI_VISION_MODELS = 'busy, drops ,ok'
  try {
    const providers = geminiProviders()
    assert.deepEqual(providers.map((p) => p.name), ['gemini:busy', 'gemini:drops', 'gemini:ok'])
    const { provider, text } = await describeWithFallback(providers, req, { sleep: async () => {} })
    assert.equal(provider, 'gemini:ok')
    assert.equal(text, '{"a":1}')
  } finally {
    delete process.env.GEMINI_VISION_MODELS
  }
})

test('without a list, the defaults are models on Google’s current list', () => {
  delete process.env.GEMINI_VISION_MODEL
  assert.deepEqual(geminiProviders().map((p) => p.name), [
    'gemini:gemini-3.8-flash',
    'gemini:gemini-3.6-flash',
    'gemini:gemini-3.5-flash-lite',
  ])
})

const framePath = path.join(mkdtempSync(path.join(tmpdir(), 'gemini-frame-')), 'f.jpg')
writeFileSync(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
const withFrames = { frames: [{ path: framePath, time: 1.5 }], transcript: '', instruction: 'describe', thinking: 'low' as const }

test('frame windows go at low resolution with little thinking', async () => {
  requests.length = 0
  await geminiModel('ok').describe(withFrames)
  assert.deepEqual(requests[0]!.body.generationConfig, {
    responseMimeType: 'application/json',
    mediaResolution: 'MEDIA_RESOLUTION_LOW',
    thinkingConfig: { thinkingLevel: 'low' },
  })
  process.env.GEMINI_MEDIA_RESOLUTION = ''
  try {
    requests.length = 0
    await geminiModel('ok').describe({ ...withFrames, thinking: undefined })
    assert.deepEqual(requests[0]!.body.generationConfig, { responseMimeType: 'application/json' }, 'empty leaves Google defaults')
  } finally {
    delete process.env.GEMINI_MEDIA_RESOLUTION
  }
})

test('a model that rejects a cost setting is asked again without it', async () => {
  requests.length = 0
  assert.equal(await geminiModel('picky').describe(withFrames), '{"ok":true}')
  assert.equal(requests.length, 2)
  assert.deepEqual(
    requests[1]!.body.generationConfig,
    { responseMimeType: 'application/json', mediaResolution: 'MEDIA_RESOLUTION_LOW' },
    'only the rejected setting is dropped: the frames stay at low resolution',
  )
  // Any other 400 is still a real error, asked once.
  requests.length = 0
  await assert.rejects(geminiModel('bad').describe(withFrames), /HTTP 400/)
  assert.equal(requests.length, 1)
})

test('a 429 waits what Google asks and names the quota it hit', () => {
  const body = JSON.stringify({ error: { code: 429, details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateContentInputTokensPerModelPerMinute-FreeTier' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '23.4s' },
  ] } }, null, 2)
  assert.equal(retryAfterOf(null, body), 23_400)
  assert.equal(retryAfterOf('5', body), 5_000, 'the header wins')
  assert.equal(retryAfterOf(null, '{}'), undefined)
  // A daily quota is spent until midnight in California: no retry before that.
  const daily = '{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},{"retryDelay":"20s"}]}}'
  const at = Date.parse('2026-10-18T20:30:00Z') // 13:30 in Los Angeles (PDT)
  assert.equal(retryAfterOf(null, daily, at), (10 * 60 + 30) * 60_000)
  assert.equal(retryAfterOf('5', daily, at), (10 * 60 + 30) * 60_000, 'even over a short header')
  // The days the clocks change are 25 and 23 hours long in California.
  assert.equal(retryAfterOf(null, daily, Date.parse('2026-11-01T07:30:00Z')), 24.5 * 3_600_000, '00:30 PDT, midnight comes in PST (it said 23.5 h)')
  assert.equal(retryAfterOf(null, daily, Date.parse('2026-03-08T09:30:00Z')), 21.5 * 3_600_000, '01:30 PST, midnight comes in PDT (it said 22.5 h)')
  assert.match(quotaDetail(body), /^\[GenerateContentInputTokensPerModelPerMinute-FreeTier\] /)
})

test('a request carries no more frames than fit the per-minute token limit at the chosen resolution', () => {
  const saved = process.env.GEMINI_MEDIA_RESOLUTION
  try {
    delete process.env.GEMINI_MEDIA_RESOLUTION
    assert.ok(maxFramesPerRequest() >= 300, 'low resolution (the default): the usual 300-frame windows fit')
    process.env.GEMINI_MEDIA_RESOLUTION = ''
    const n = maxFramesPerRequest()
    assert.equal(n, 175, "Google's own resolution, 1110 tokens a frame")
    const frames = Array.from({ length: n }, (_, i) => ({ path: '', time: i }))
    assert.ok(estimateTokens({ frames, instruction: 'x'.repeat(60_000), audio: { path: '', mimeType: 'audio/ogg', seconds: 120 } }) <= 225_000)
  } finally {
    if (saved === undefined) delete process.env.GEMINI_MEDIA_RESOLUTION
    else process.env.GEMINI_MEDIA_RESOLUTION = saved
  }
})
