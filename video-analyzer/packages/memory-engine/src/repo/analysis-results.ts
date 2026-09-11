import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { SceneRow, TranscriptChunkRow, VideoElementRow } from '../types.js'

export type SummaryInput = {
  shortSummary: string
  fullSummary: string
  topics: string[]
  language: string
}

export type SceneInput = {
  index: number
  startSeconds: number
  endSeconds: number
  title: string | null
  description: string
  audioDescription: string | null
}

export type TranscriptChunkInput = {
  index: number
  startSeconds: number
  endSeconds: number
  speaker: string | null
  text: string
  language: string | null
}

export type VideoElementInput = {
  kind: 'object' | 'on_screen_text' | 'action' | 'person' | 'relation'
  label: string
  detail: string | null
  startSeconds: number
  endSeconds: number | null
}

export type FullAnalysisResult = {
  summary: SummaryInput
  scenes: SceneInput[]
  transcript: TranscriptChunkInput[]
  elements: VideoElementInput[]
}

/**
 * Writes an entire analysis result in one transaction, replacing whatever
 * this video already had (delete-then-insert) so re-running the analysis —
 * a manual retry, or a future re-analysis feature — never leaves duplicate
 * rows behind. Also seeds memory_chunks (text only, no vector yet: embedding
 * generation is bloque 4) so the semantic layer has something to embed the
 * moment that lands.
 */
export function saveAnalysisResult(videoId: string, result: FullAnalysisResult, db: Db = getDb()): void {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM video_summaries WHERE video_id = ?').run(videoId)
    db.prepare('DELETE FROM scenes WHERE video_id = ?').run(videoId)
    db.prepare('DELETE FROM transcript_chunks WHERE video_id = ?').run(videoId)
    db.prepare('DELETE FROM video_elements WHERE video_id = ?').run(videoId)
    // memory_chunks_fts and vec_memory_chunks follow via the triggers defined
    // in migrations/001_initial.sql and 002_vec.sql.tpl.
    db.prepare('DELETE FROM memory_chunks WHERE video_id = ?').run(videoId)

    db.prepare(
      `INSERT INTO video_summaries (video_id, short_summary, full_summary, topics_json, language)
       VALUES (@videoId, @shortSummary, @fullSummary, @topicsJson, @language)`,
    ).run({
      videoId,
      shortSummary: result.summary.shortSummary,
      fullSummary: result.summary.fullSummary,
      topicsJson: JSON.stringify(result.summary.topics),
      language: result.summary.language,
    })

    const insertMemoryChunk = db.prepare(
      `INSERT INTO memory_chunks (id, video_id, source, source_id, start_seconds, end_seconds, text)
       VALUES (@id, @videoId, @source, @sourceId, @startSeconds, @endSeconds, @text)`,
    )
    insertMemoryChunk.run({
      id: randomUUID(),
      videoId,
      source: 'summary',
      sourceId: null,
      startSeconds: null,
      endSeconds: null,
      text: result.summary.fullSummary,
    })

    const insertScene = db.prepare(
      `INSERT INTO scenes (id, video_id, scene_index, start_seconds, end_seconds, title, description, audio_description)
       VALUES (@id, @videoId, @sceneIndex, @startSeconds, @endSeconds, @title, @description, @audioDescription)`,
    )
    for (const scene of result.scenes) {
      const sceneId = randomUUID()
      insertScene.run({
        id: sceneId,
        videoId,
        sceneIndex: scene.index,
        startSeconds: scene.startSeconds,
        endSeconds: scene.endSeconds,
        title: scene.title,
        description: scene.description,
        audioDescription: scene.audioDescription,
      })
      const text = [scene.title, scene.description, scene.audioDescription].filter(Boolean).join(' — ')
      insertMemoryChunk.run({
        id: randomUUID(),
        videoId,
        source: 'scene',
        sourceId: sceneId,
        startSeconds: scene.startSeconds,
        endSeconds: scene.endSeconds,
        text,
      })
    }

    const insertTranscriptChunk = db.prepare(
      `INSERT INTO transcript_chunks (id, video_id, chunk_index, start_seconds, end_seconds, speaker, text, language)
       VALUES (@id, @videoId, @chunkIndex, @startSeconds, @endSeconds, @speaker, @text, @language)`,
    )
    for (const chunk of result.transcript) {
      const chunkId = randomUUID()
      insertTranscriptChunk.run({
        id: chunkId,
        videoId,
        chunkIndex: chunk.index,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        speaker: chunk.speaker,
        text: chunk.text,
        language: chunk.language,
      })
      insertMemoryChunk.run({
        id: randomUUID(),
        videoId,
        source: 'transcript',
        sourceId: chunkId,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        text: chunk.text,
      })
    }

    const insertElement = db.prepare(
      `INSERT INTO video_elements (id, video_id, kind, label, detail, start_seconds, end_seconds)
       VALUES (@id, @videoId, @kind, @label, @detail, @startSeconds, @endSeconds)`,
    )
    for (const element of result.elements) {
      const elementId = randomUUID()
      insertElement.run({
        id: elementId,
        videoId,
        kind: element.kind,
        label: element.label,
        detail: element.detail,
        startSeconds: element.startSeconds,
        endSeconds: element.endSeconds,
      })
      insertMemoryChunk.run({
        id: randomUUID(),
        videoId,
        source: 'element',
        sourceId: elementId,
        startSeconds: element.startSeconds,
        endSeconds: element.endSeconds,
        text: [element.label, element.detail].filter(Boolean).join(': '),
      })
    }
  })

  run()
}

export type VideoSummaryRow = {
  video_id: string
  short_summary: string
  full_summary: string
  topics_json: string
  language: string | null
  created_at: string
}

export function getVideoSummary(videoId: string, db: Db = getDb()): VideoSummaryRow | undefined {
  return db.prepare('SELECT * FROM video_summaries WHERE video_id = ?').get(videoId) as
    | VideoSummaryRow
    | undefined
}

export function listScenes(videoId: string, db: Db = getDb()): SceneRow[] {
  return db
    .prepare('SELECT * FROM scenes WHERE video_id = ? ORDER BY start_seconds')
    .all(videoId) as SceneRow[]
}

export function listTranscriptChunks(videoId: string, db: Db = getDb()): TranscriptChunkRow[] {
  return db
    .prepare('SELECT * FROM transcript_chunks WHERE video_id = ? ORDER BY start_seconds')
    .all(videoId) as TranscriptChunkRow[]
}

export function listVideoElements(videoId: string, db: Db = getDb()): VideoElementRow[] {
  return db
    .prepare('SELECT * FROM video_elements WHERE video_id = ? ORDER BY start_seconds')
    .all(videoId) as VideoElementRow[]
}
