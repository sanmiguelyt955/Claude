import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'

export type ChatMessageRow = {
  id: string
  video_id: string
  role: 'user' | 'assistant'
  text: string
  provider: string | null
  created_at: string
}

/** The conversation with one video, oldest turn first. */
export function listChatMessages(videoId: string, db: Db = getDb()): ChatMessageRow[] {
  // rowid breaks ties between turns written in the same millisecond.
  return db
    .prepare('SELECT * FROM video_chat_messages WHERE video_id = ? ORDER BY created_at, rowid')
    .all(videoId) as ChatMessageRow[]
}

export function addChatMessage(
  input: { videoId: string; role: 'user' | 'assistant'; text: string; provider?: string | null },
  db: Db = getDb(),
): ChatMessageRow {
  const id = randomUUID()
  db.prepare('INSERT INTO video_chat_messages (id, video_id, role, text, provider) VALUES (?, ?, ?, ?, ?)').run(
    id,
    input.videoId,
    input.role,
    input.text,
    input.provider ?? null,
  )
  return db.prepare('SELECT * FROM video_chat_messages WHERE id = ?').get(id) as ChatMessageRow
}

export function clearChatMessages(videoId: string, db: Db = getDb()): number {
  return db.prepare('DELETE FROM video_chat_messages WHERE video_id = ?').run(videoId).changes
}
