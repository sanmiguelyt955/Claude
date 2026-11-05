// Modo 2: collage animado con profundidad (2.5D). Cada escena son capas (fondo, medio, frente) a distintas
// distancias; la cámara se mueve y cada capa se desplaza según su profundidad (paralaje). Grano, papel, luz,
// partículas, transiciones con sentido y letras al ritmo de la voz.
import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig, CalculateMetadataFunction, Easing} from 'remotion';
import {Marca, MARCA_DEFECTO, Palabra, PalabraAPalabra, partir, Grano, Papel, Vineta, Particulas, Luz} from './comun';

export type Capa = {
  src: string;              // imagen en la carpeta pública (PNG con transparencia si es recorte)
  z: number;                // 0 = fondo lejano … 1 = muy cerca de la cámara
  x?: number; y?: number;   // centro (0-1) dentro del cuadro; por defecto 0.5
  ancho?: number;           // fracción del ancho del video; por defecto 1.15 para fondos, 0.6 para el resto
  mov?: 'flotar' | 'respirar' | 'balanceo';
  sombra?: boolean;
};

export type EscenaCollage = {
  dur: number;
  capas: Capa[];
  camara?: 'avanzar' | 'retroceder' | 'izquierda' | 'derecha' | 'subir' | 'bajar' | 'fija';
  fuerza?: number;          // intensidad del movimiento de cámara (1 = normal, 2 = «métete con fuerza»)
  foco?: {x: number; y: number};   // punto hacia el que avanza la cámara / por donde entra la transición «hueco»
  texto?: string;           // *palabra* destacada
  palabras?: Palabra[];
  posTexto?: 'arriba' | 'centro' | 'abajo';
  transicion?: 'hueco' | 'tapa' | 'fundido' | 'corte';   // cómo pasa a la SIGUIENTE escena
  particulas?: 'nieve' | 'polvo' | 'chispas';
};

export type CollageProps = {
  escenas: EscenaCollage[];
  marca?: Marca;
  textura?: {grano?: number; papel?: number; vineta?: number; luz?: number; colorLuz?: string};
  serif?: boolean;          // letras de estilo archivo (serif + cursiva en la clave)
  colorClave?: string;      // color de la palabra destacada sobre el papel (por defecto rojo oscuro, o el acento de la marca)
  voz?: string;
  musica?: string;
  volumenMusica?: number;
};

const FPS = 30;
const SOLAPE = 0.6;  // s que dura una transición

export const calcularCollage: CalculateMetadataFunction<CollageProps> = ({props}) => ({
  durationInFrames: Math.max(1, Math.round(props.escenas.reduce((a, e) => a + e.dur, 0) * FPS)),
  fps: FPS,
});

const CapaVista: React.FC<{c: Capa; p: number; e: EscenaCollage; zoomExtra: number}> = ({c, p, e, zoomExtra}) => {
  const {width, height, fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;
  const z = Math.max(0, Math.min(1, c.z));
  const f = e.fuerza ?? 1;
  const ancho = (c.ancho ?? (z < 0.15 ? 1.15 : 0.6)) * width;
  let dx = 0, dy = 0, esc = 1;
  const cam = e.camara || 'avanzar';
  const desp = (40 + 320 * z) * f;
  if (cam === 'avanzar') esc = 1 + p * (0.06 + 0.4 * z) * f;
  if (cam === 'retroceder') esc = 1 + (1 - p) * (0.06 + 0.4 * z) * f;
  if (cam === 'izquierda') dx = (0.5 - p) * desp * 2;
  if (cam === 'derecha') dx = (p - 0.5) * desp * 2;
  if (cam === 'subir') dy = (0.5 - p) * desp * 2;
  if (cam === 'bajar') dy = (p - 0.5) * desp * 2;
  // Hacia el foco: al acercarse, las capas se alejan del punto de foco (sensación de meterse dentro)
  const foco = e.foco || {x: 0.5, y: 0.5};
  const zoom = esc * (1 + zoomExtra * (0.5 + z));
  const cx = (c.x ?? 0.5) * width, cy = (c.y ?? 0.5) * height;
  const fx = foco.x * width, fy = foco.y * height;
  const x = fx + (cx - fx) * zoom + dx;
  const y = fy + (cy - fy) * zoom + dy;
  let rot = 0, extra = 1, flot = 0;
  if (c.mov === 'flotar') flot = Math.sin(t * 1.3 + z * 5) * 12;
  if (c.mov === 'respirar') extra = 1 + Math.sin(t * 1.6) * 0.012;
  if (c.mov === 'balanceo') rot = Math.sin(t * 1.1) * 2.5;
  const desenfoque = z < 0.12 ? 2.2 : z > 0.92 ? 3 : 0;   // profundidad de campo: fondo y primerísimo plano suaves
  return (
    <Img src={staticFile(c.src)} style={{position: 'absolute', width: ancho * zoom * extra, left: x - (ancho * zoom * extra) / 2,
      top: y + flot, transform: `translateY(-50%) rotate(${rot}deg)`, filter: `blur(${desenfoque}px)${c.sombra !== false && z > 0.15 ? ' drop-shadow(0 18px 28px rgba(0,0,0,0.45))' : ''}`}} />
  );
};

const EscenaVista: React.FC<{e: EscenaCollage; m: Marca; serif?: boolean; entra?: EscenaCollage['transicion']; durTotal: number; offset: number;
  focoPrevio?: {x: number; y: number}; colorClave: string}> = ({e, m, serif, entra, durTotal, offset, focoPrevio, colorClave}) => {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();
  const n = durTotal * fps;
  const p = interpolate(frame, [0, n], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const sol = SOLAPE * fps;
  // Salida (hacia la siguiente escena)
  const fin = interpolate(frame, [n - sol, n], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
  const sale = e.transicion || 'fundido';
  // Entrada (según cómo sale la escena anterior)
  const ini = interpolate(frame, [0, sol], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  let opacidad = 1, zoomExtra = 0, escalaEntrada = 1, recorte: string | undefined;
  const {width} = useVideoConfig();
  if (sale === 'hueco') zoomExtra = fin * 3.2;           // la cámara se mete por el foco
  if (sale === 'fundido') opacidad *= 1 - fin;
  // La escena que entra se dibuja encima: «hueco» aparece por un círculo que crece desde el foco de la anterior;
  // «tapa» se descubre de derecha a izquierda detrás de una franja oscura.
  if (entra === 'hueco') {
    escalaEntrada = 1.25 - 0.25 * ini;
    const fc = focoPrevio || {x: 0.5, y: 0.5};
    recorte = `circle(${Math.pow(ini, 1.6) * 125}% at ${fc.x * 100}% ${fc.y * 100}%)`;
  }
  if (entra === 'tapa') recorte = `inset(0 0 0 ${(1 - ini) * 100}%)`;
  if (entra === 'fundido') opacidad *= ini;
  const capas = [...e.capas].sort((a, b) => a.z - b.z);
  const palabras = e.palabras || (e.texto ? partir(e.texto, e.dur) : []);
  const pos = e.posTexto || 'abajo';
  return (
    <AbsoluteFill style={{opacity: opacidad, transform: `scale(${escalaEntrada})`, overflow: 'hidden', clipPath: frame < sol ? recorte : undefined}}>
      {capas.map((c, i) => <CapaVista key={i} c={c} p={p} e={e} zoomExtra={zoomExtra} />)}
      {e.particulas && <Particulas tipo={e.particulas} n={e.particulas === 'nieve' ? 70 : 35} />}
      {palabras.length > 0 && (
        <AbsoluteFill style={{justifyContent: pos === 'arriba' ? 'flex-start' : pos === 'centro' ? 'center' : 'flex-end', alignItems: 'center',
          padding: `${height * 0.12}px 70px`}}>
          <Sequence from={Math.round(offset * fps)} layout="none">
            <div style={{background: 'rgba(245,236,214,0.92)', padding: '26px 38px', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', transform: 'rotate(-1.2deg)'}}>
              <PalabraAPalabra palabras={palabras} marca={{...m, text: '#2a1f14', accent: colorClave}} tam={62} serif={serif} maxAncho={860} />
            </div>
          </Sequence>
        </AbsoluteFill>
      )}
      {entra === 'tapa' && frame < sol && (
        <div style={{position: 'absolute', top: 0, bottom: 0, width: width * 0.18, left: `${(1 - ini) * 100}%`,
          background: 'linear-gradient(90deg, rgba(20,14,8,0.95) 0%, rgba(20,14,8,0) 100%)'}} />
      )}
    </AbsoluteFill>
  );
};

export const Collage: React.FC<CollageProps> = ({escenas, marca, textura, serif = true, voz, musica, volumenMusica = 0.22, colorClave}) => {
  const m = {...MARCA_DEFECTO, ...(marca || {})};
  const {fps} = useVideoConfig();
  const tx = {grano: 0.12, papel: 0.16, vineta: 0.5, luz: 0.3, colorLuz: '255,190,120', ...(textura || {})};
  let t = 0;
  return (
    <AbsoluteFill style={{background: '#140e08'}}>
      {escenas.map((e, i) => {
        const prev = i > 0 ? escenas[i - 1].transicion || 'fundido' : undefined;
        const solapa = prev && prev !== 'corte' ? SOLAPE : 0;
        const desde = Math.max(0, Math.round((t - solapa) * fps));
        const dur = Math.round((e.dur + solapa) * fps);
        t += e.dur;
        return (
          <Sequence key={i} from={desde} durationInFrames={dur}>
            <EscenaVista e={e} m={m} serif={serif} entra={prev} durTotal={e.dur + solapa} offset={solapa}
              focoPrevio={i > 0 ? escenas[i - 1].foco : undefined} colorClave={colorClave || (marca ? m.accent : '#8B1E1E')} />
          </Sequence>
        );
      })}
      {tx.luz > 0 && <Luz color={tx.colorLuz} fuerza={tx.luz} />}
      {tx.papel > 0 && <Papel fuerza={tx.papel} />}
      {tx.vineta > 0 && <Vineta fuerza={tx.vineta} />}
      {tx.grano > 0 && <Grano fuerza={tx.grano} />}
      {voz && <Audio src={staticFile(voz)} />}
      {musica && <Audio src={staticFile(musica)} volume={voz ? volumenMusica : 0.8} />}
    </AbsoluteFill>
  );
};
