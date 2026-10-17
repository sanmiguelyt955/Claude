const $ = (id) => document.getElementById(id)
const fileInput = $('file')
const drop = $('drop')
const statusEl = $('status')
const player = $('player')
const reanalyzeBtn = $('reanalyze')

let current = null
let localUrl = null

function setStatus(message, kind = '') {
  statusEl.textContent = message
  statusEl.className = `status ${kind}`
}

function formatTime(total) {
  const seconds = Math.max(0, Math.floor(Number(total) || 0))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null && text !== '') node.textContent = text
  return node
}

async function request(url, options) {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

async function upload(file) {
  if (localUrl) URL.revokeObjectURL(localUrl)
  localUrl = URL.createObjectURL(file)
  player.src = localUrl
  player.hidden = false
  reanalyzeBtn.hidden = true
  $('result').hidden = true
  $('chat-card').hidden = true

  setStatus(`Subiendo ${file.name} y esperando a que Gemini lo procese…`, 'busy')
  try {
    current = await request(`/api/videos?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    await analyze()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function analyze() {
  setStatus('Gemini está viendo y escuchando el video. Puede tardar varios minutos si es largo…', 'busy')
  reanalyzeBtn.hidden = true
  try {
    current = await request(`/api/videos/${current.id}/analyze`, { method: 'POST' })
    renderAnalysis(current.analysis)
    renderChat(current.chat)
    setStatus('Análisis listo.', 'ok')
  } catch (error) {
    setStatus(error.message, 'error')
  } finally {
    reanalyzeBtn.hidden = false
  }
}

function renderAnalysis(analysis) {
  $('summary').textContent = analysis.summary
  $('meta').textContent = [
    analysis.duration_seconds ? `Duración: ${formatTime(analysis.duration_seconds)}` : '',
    analysis.language ? `Idioma: ${analysis.language}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const scenes = $('scenes')
  scenes.replaceChildren(
    ...analysis.scenes.map((scene) => {
      const item = el('li', 'item')
      item.append(el('span', 'time', `${formatTime(scene.start)}–${formatTime(scene.end)}`))
      const body = el('div', 'body')
      body.append(el('p', '', scene.visual))
      if (scene.on_screen_text) body.append(el('p', 'onscreen', `En pantalla: “${scene.on_screen_text}”`))
      item.append(body)
      return item
    }),
  )

  const transcript = $('transcript')
  transcript.replaceChildren(
    ...analysis.transcript.map((line) => {
      const item = el('li', 'item')
      item.append(el('span', 'time', formatTime(line.start)))
      const body = el('div', 'body')
      if (line.speaker) body.append(el('span', 'speaker', line.speaker))
      body.append(el('p', '', line.text))
      item.append(body)
      return item
    }),
  )

  const audio = $('audio')
  audio.replaceChildren()
  const rows = [
    ['Música', analysis.audio?.music],
    ['Efectos', analysis.audio?.sound_effects],
    ['Tono de voz', analysis.audio?.voice_tone],
  ]
  for (const [label, value] of rows) {
    if (!value) continue
    audio.append(el('dt', '', label), el('dd', '', value))
  }

  $('result').hidden = false
  $('chat-card').hidden = false
}

function renderChat(chat) {
  const messages = $('messages')
  messages.replaceChildren(...chat.map((message) => el('div', `bubble ${message.role}`, message.text)))
  messages.scrollTop = messages.scrollHeight
}

async function ask(event) {
  event.preventDefault()
  const input = $('question')
  const message = input.value.trim()
  if (!message || !current) return

  const button = event.submitter ?? event.target.querySelector('button')
  button.disabled = true
  input.value = ''
  try {
    const data = await request(`/api/videos/${current.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    current.chat = data.chat
    renderChat(data.chat)
  } catch (error) {
    input.value = message
    setStatus(error.message, 'error')
  } finally {
    button.disabled = false
    input.focus()
  }
}

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) upload(fileInput.files[0])
  fileInput.value = ''
})

drop.addEventListener('dragover', (event) => {
  event.preventDefault()
  drop.classList.add('over')
})
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', (event) => {
  event.preventDefault()
  drop.classList.remove('over')
  const file = event.dataTransfer.files[0]
  if (file) upload(file)
})

reanalyzeBtn.addEventListener('click', analyze)
$('chat-form').addEventListener('submit', ask)
