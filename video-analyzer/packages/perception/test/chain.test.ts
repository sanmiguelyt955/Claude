import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeWithFallback, shouldFallback } from '../src/chain.ts'
import { ProviderOverloadedError, type VisionProvider } from '../src/providers/types.ts'

const req = { frames: [], transcript: '', instruction: 'x' }
const fake = (name: string, impl: () => Promise<string>, available = true): VisionProvider => ({
  name,
  available: () => available,
  describe: impl,
})

test('falls back to the next provider on overload', async () => {
  const primary = fake('primary-' + Math.random(), async () => {
    throw new ProviderOverloadedError('primary', 503, 'high demand')
  })
  const backup = fake('backup-' + Math.random(), async () => '{"ok":true}')
  const out = await describeWithFallback([primary, backup], req)
  assert.equal(out.provider, backup.name)
})

test('skips providers without a key without calling them', async () => {
  let called = false
  const noKey = fake('nokey-' + Math.random(), async () => { called = true; return '' }, false)
  const ok = fake('ok-' + Math.random(), async () => '{}')
  await describeWithFallback([noKey, ok], req)
  assert.equal(called, false)
})

test('does not fall back on a non-overload error', async () => {
  const bad = fake('bad-' + Math.random(), async () => { throw new Error('HTTP 400: invalid image') })
  const backup = fake('backup2-' + Math.random(), async () => '{}')
  await assert.rejects(describeWithFallback([bad, backup], req), /invalid image/)
})

test('an overloaded provider is paused for the cooldown', async () => {
  const name = 'paused-' + Math.random()
  let calls = 0
  const p = fake(name, async () => { calls++; throw new ProviderOverloadedError(name, 429, 'quota') })
  const backup = fake('b-' + Math.random(), async () => '{}')
  await describeWithFallback([p, backup], req, { cooldownMs: 60_000 })
  await describeWithFallback([p, backup], req, { cooldownMs: 60_000 })
  assert.equal(calls, 1)
})

test('classifies overload messages', () => {
  assert.equal(shouldFallback(new Error('model UNAVAILABLE, high demand')), true)
  assert.equal(shouldFallback(new Error('HTTP 400 bad request')), false)
})
