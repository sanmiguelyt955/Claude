import { Input, ALL_FORMATS, FilePathSource, Output, Mp4OutputFormat, FilePathTarget, Conversion } from 'mediabunny';
const input = new Input({ source: new FilePathSource(process.argv[2]), formats: ALL_FORMATS });
console.log('formato:', (await input.getFormat()).name, '| duración:', (await input.computeDuration()).toFixed(2), 's');
const v = await input.getPrimaryVideoTrack();
console.log('vídeo:', v.codec, v.displayWidth+'x'+v.displayHeight, '| fps aprox:', (await v.computePacketStats(100)).averagePacketRate.toFixed(1));
// recorte sin re-codificar: segundos 1 a 3
const output = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(process.argv[3]) });
const conv = await Conversion.init({ input, output, trim: { start: 1, end: 3 } });
console.log('conversión válida:', conv.isValid, conv.discardedTracks.map(t=>t.reason));
await conv.execute();
console.log('recorte escrito');
