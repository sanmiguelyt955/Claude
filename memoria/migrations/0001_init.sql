-- Notes are Markdown, addressed by their vault path ("Carpeta/Nota.md"), the
-- same layout an Obsidian vault has on disk, so a vault imports and exports 1:1.
CREATE TABLE notes (
  path        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  -- Who wrote the current content: 'web', 'mcp', 'api', 'import', 'rename'.
  updated_by  TEXT NOT NULL DEFAULT '',
  -- Set when moved to the trash: nothing is ever deleted outright.
  deleted_at  TEXT
);
CREATE INDEX idx_notes_title ON notes (title COLLATE NOCASE);
CREATE INDEX idx_notes_updated ON notes (updated_at DESC);

-- Every earlier content of every note: restoring any of them is one click.
CREATE TABLE note_versions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  path      TEXT NOT NULL,
  content   TEXT NOT NULL,
  saved_at  TEXT NOT NULL,
  -- Who wrote the content that this version replaced: 'web', 'mcp', 'api', 'import'.
  source    TEXT NOT NULL
);
CREATE INDEX idx_versions_path ON note_versions (path, id DESC);

-- [[links]] and ![[embeds]] as written; resolved to notes when read.
CREATE TABLE links (
  src     TEXT NOT NULL,
  target  TEXT NOT NULL,
  embed   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_links_src ON links (src);
CREATE INDEX idx_links_target ON links (target COLLATE NOCASE);

CREATE TABLE tags (
  path  TEXT NOT NULL,
  tag   TEXT NOT NULL
);
CREATE INDEX idx_tags_tag ON tags (tag COLLATE NOCASE);
CREATE INDEX idx_tags_path ON tags (path);

-- Folders that exist without notes in them yet.
CREATE TABLE folders (
  path  TEXT PRIMARY KEY
);

-- Attachments: bytes in R2 under the same path, metadata here.
CREATE TABLE files (
  path          TEXT PRIMARY KEY,
  size          INTEGER NOT NULL,
  content_type  TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL,
  deleted_at    TEXT
);

-- Small settings: bookmarks, daily note folder and format, template folder.
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Full-text search over title and content, accents ignored.
CREATE VIRTUAL TABLE notes_fts USING fts5(path UNINDEXED, title, content, tokenize = 'unicode61 remove_diacritics 2');
