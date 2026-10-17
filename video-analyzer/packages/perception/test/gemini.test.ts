import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { geminiModel, geminiProviders } from '../src/providers/gemini.ts'
import { ProviderOverloadedError } from '../src/providers/types.ts'
import { describeWithFallback } from '../src/chain.ts'

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
