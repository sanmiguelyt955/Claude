import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { generate, uploadVideo } from '../lib/gemini.js'
import { mimeFromName } from '../lib/mime.js'
import { GeminiError } from '../lib/errors.js'

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })

test('uploadVideo hace el protocolo reanudable y espera a que el archivo esté ACTIVE', async () => {
  const calls = []
  const states = ['PROCESSING', 'ACTIVE']
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/upload/v1beta/files')) {
      return new Response('{}', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example/session' } })
    }
    if (String(url).includes('upload.example')) {
      return json({ file: { name: 'files/abc', uri: 'https://files/abc', mimeType: 'video/mp4', state: 'PROCESSING' } })
    }
    return json({ name: 'files/abc', uri: 'https://files/abc', mimeType: 'video/mp4', state: states.shift() })
  }

  const file = await uploadVideo({
    apiKey: 'k',
    body: Readable.toWeb(Readable.from([Buffer.from('abc')])),
    size: 3,
    mimeType: 'video/mp4',
    displayName: 'clip.mp4',
    fetchImpl: fakeFetch,
    pollMs: 1,
  })

  assert.equal(file.state, 'ACTIVE')
  assert.equal(file.uri, 'https://files/abc')
  assert.equal(calls[0].options.headers['X-Goog-Upload-Command'], 'start')
  assert.equal(calls[0].options.headers['X-Goog-Upload-Header-Content-Type'], 'video/mp4')
  assert.equal(calls[1].options.headers['X-Goog-Upload-Command'], 'upload, finalize')
  assert.equal(calls.at(-1).url, 'https://generativelanguage.googleapis.com/v1beta/files/abc')
})

test('uploadVideo falla con mensaje claro si Gemini marca el archivo como FAILED', async () => {
  const fakeFetch = async (url) => {
    if (String(url).includes('/upload/v1beta/files')) {
      return new Response('{}', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example/s' } })
    }
    if (String(url).includes('upload.example')) return json({ file: { name: 'files/x', state: 'FAILED' } })
    throw new Error('no debería consultarse el estado')
  }

  await assert.rejects(
    uploadVideo({ apiKey: 'k', body: Readable.toWeb(Readable.from([])), size: 0, mimeType: 'video/mp4', displayName: 'a.mp4', fetchImpl: fakeFetch }),
    (error) => error instanceof GeminiError && error.status === 422 && /FAILED/.test(error.message),
  )
})

test('generate adjunta el video solo al primer turno y devuelve JSON parseado con schema', async () => {
  let sent
  const fakeFetch = async (_url, options) => {
    sent = JSON.parse(options.body)
    return json({ candidates: [{ content: { parts: [{ text: '{"summary":"ok"}' }] } }] })
  }
  const video = { mimeType: 'video/mp4', uri: 'https://files/abc' }

  const result = await generate({
    apiKey: 'k',
    model: 'm',
    video,
    turns: [
      { role: 'user', text: 'uno' },
      { role: 'model', text: 'dos' },
      { role: 'user', text: 'tres' },
    ],
    schema: { type: 'OBJECT' },
    fetchImpl: fakeFetch,
  })

  assert.deepEqual(result, { summary: 'ok' })
  assert.deepEqual(sent.contents[0].parts[0], { file_data: { mime_type: 'video/mp4', file_uri: 'https://files/abc' } })
  assert.equal(sent.contents[1].parts.some((part) => part.file_data), false)
  assert.equal(sent.generationConfig.responseMimeType, 'application/json')
})

test('generate sin schema devuelve el texto tal cual', async () => {
  const fakeFetch = async () => json({ candidates: [{ content: { parts: [{ text: 'Hola' }, { text: ' mundo' }] } }] })
  const text = await generate({
    apiKey: 'k',
    model: 'm',
    video: { mimeType: 'video/mp4', uri: 'u' },
    turns: [{ role: 'user', text: 'pregunta' }],
    fetchImpl: fakeFetch,
  })
  assert.equal(text, 'Hola mundo')
})

test('mimeFromName acepta formatos de Gemini y rechaza mkv', () => {
  assert.equal(mimeFromName('Clip.MP4'), 'video/mp4')
  assert.equal(mimeFromName('nota.wav'), 'audio/wav')
  assert.equal(mimeFromName('x.bin', 'video/webm'), 'video/webm')
  assert.throws(() => mimeFromName('pelicula.mkv'), (error) => error.status === 415 && /mp4/.test(error.message))
  assert.throws(() => mimeFromName('pelicula.mkv', 'video/x-matroska'), (error) => error.status === 415)
})
