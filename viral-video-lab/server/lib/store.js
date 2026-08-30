const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LIBRARY_DIR = path.join(DATA_DIR, 'library');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');

for (const dir of [DATA_DIR, UPLOADS_DIR, LIBRARY_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function writeJSON(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readVideos() {
  return readJSON(VIDEOS_FILE, []);
}

function writeVideos(videos) {
  writeJSON(VIDEOS_FILE, videos);
}

function getVideo(id) {
  return readVideos().find((v) => v.id === id) || null;
}

function upsertVideo(video) {
  const videos = readVideos();
  const idx = videos.findIndex((v) => v.id === video.id);
  if (idx === -1) videos.push(video);
  else videos[idx] = { ...videos[idx], ...video };
  writeVideos(videos);
  return getVideo(video.id);
}

function removeVideo(id) {
  const videos = readVideos().filter((v) => v.id !== id);
  writeVideos(videos);
}

function videoDir(id) {
  const dir = path.join(LIBRARY_DIR, id);
  fs.mkdirSync(path.join(dir, 'thumbs'), { recursive: true });
  return dir;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

// Stable id derived from the absolute path, so re-scanning a folder never creates
// duplicate library entries for the same file.
function idForPath(absPath) {
  return crypto.createHash('sha1').update(path.resolve(absPath)).digest('hex').slice(0, 16);
}

// Cheap existence checks (no directory creation) so the library list can show a
// status pill (sin analizar / analizado / con estructura / validado) at a glance.
function getVideoStatus(id) {
  const dir = path.join(LIBRARY_DIR, id);
  const reportFile = path.join(dir, 'report.json');
  const hasFrames = fs.existsSync(path.join(dir, 'frame_index.json'));
  const hasStructure = fs.existsSync(path.join(dir, 'structure.json'));
  const hasLessons = fs.existsSync(path.join(dir, 'lessons.json'));
  const hasReport = fs.existsSync(reportFile);
  let veredicto = null;
  if (hasReport) {
    try {
      veredicto = readJSON(reportFile, {}).validation?.veredicto_global || null;
    } catch {
      veredicto = null;
    }
  }
  return { hasFrames, hasStructure, hasLessons, hasReport, veredicto };
}

module.exports = {
  DATA_DIR,
  UPLOADS_DIR,
  LIBRARY_DIR,
  readJSON,
  writeJSON,
  readVideos,
  writeVideos,
  getVideo,
  upsertVideo,
  removeVideo,
  videoDir,
  newId,
  idForPath,
  getVideoStatus,
};
