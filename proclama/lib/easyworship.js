// Importa la biblioteca de canciones de EasyWorship 6.1+ (Songs.db + SongWords.db, SQLite).
// Esquema documentado por el proyecto jamesinglis/ew61-export: tabla `song` (title, author, copyright,
// reference_number…) y tabla `word` (song_id, words en RTF).
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { easyWorshipRowToSong } from '../public/shared/importers.js';

export async function importEasyWorship(songsDb, wordsDb) {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'proclama-ew-'));
  const a = path.join(dir, 'Songs.db'), b = path.join(dir, 'SongWords.db');
  await fsp.writeFile(a, songsDb);
  await fsp.writeFile(b, wordsDb);
  const songs = new DatabaseSync(a, { readOnly: true });
  const words = new DatabaseSync(b, { readOnly: true });
  try {
    const getWords = words.prepare('SELECT words FROM word WHERE song_id = ?');
    const out = [];
    for (const row of songs.prepare('SELECT rowid AS _id, * FROM song').all()) {
      const w = getWords.get(row._id);
      if (!w?.words) continue;
      const rtf = typeof w.words === 'string' ? w.words : Buffer.from(w.words).toString('utf8');
      const song = easyWorshipRowToSong(row, rtf);
      if (song.text) out.push(song);
    }
    return out;
  } finally {
    songs.close(); words.close();
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
