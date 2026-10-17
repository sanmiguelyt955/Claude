// Stands in for the ffprobe-static package inside the bundled worker: the
// desktop runtime ships its own ffprobe and passes its path in FFPROBE_PATH.
export default { path: process.env.FFPROBE_PATH || 'ffprobe' }
