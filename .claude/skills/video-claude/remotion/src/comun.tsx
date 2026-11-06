// Piezas comunes a Reel y Collage: marca, palabras al ritmo de la voz, textura y utilidades.
import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random} from 'remotion';

export type Marca = {
  primary: string;    // fondo principal
  accent: string;     // color de la palabra clave
  text: string;       // texto
  secondary?: string; // segundo acento
  font?: string;
  font_title?: string;
};

export const MARCA_DEFECTO: Marca = {primary: '#111111', accent: '#FFD400', text: '#FFFFFF', secondary: '#FF3B30', font: 'Inter, Arial, sans-serif'};

export const fuente = (m: Marca, titulo = false) => (titulo ? m.font_title || m.font : m.font) || 'Inter, Arial, sans-serif';

// Una palabra con su tiempo (segundos desde el inicio de la escena). *palabra* = destacada.
export type Palabra = {t: number; p: string};

// «*Torre Eiffel*» → cada palabra marcada por separado (*Torre* *Eiffel*), para resaltar claves de varias palabras.
export const marcarClaves = (ps: string[]): string[] => {
  let dentro = false;
  return ps.map((p) => {
    const abre = p.startsWith('*'), cierra = /\*[.,!?;:…]*$/.test(p) && (p.length > 1 || dentro);
    const base = p.replace(/^\*/, '').replace(/\*([.,!?;:…]*)$/, '$1');
    const clave = dentro || abre;
    if (abre && !cierra) dentro = true;
    else if (cierra) dentro = false;
    return clave ? `*${base.replace(/([.,!?;:…]*)$/, '*$1')}` : base;
  });
};

export const partir = (texto: string, dur: number, inicio = 0.15): Palabra[] => {
  // Sin tiempos de la voz: reparte las palabras de forma pareja en la primera mitad larga de la escena.
  const ps = marcarClaves(texto.split(/\s+/).filter(Boolean));
  // Sin voz: la frase completa en el primer ~40 % de la escena (retención: que se lea pronto y quede visible).
  const hueco = Math.max(0.09, Math.min(0.28, (dur * 0.4) / Math.max(ps.length, 1)));
  return ps.map((p, i) => ({t: inicio + i * hueco, p}));
};

export const esClave = (p: string) => /^\*.+\*[.,!?;:…]*$/.test(p);
export const limpia = (p: string) => p.replace(/^\*/, '').replace(/\*([.,!?;:…]*)$/, '$1');

// Texto que entra palabra a palabra (al ritmo de la voz si hay tiempos), con la clave en color acento.
export const PalabraAPalabra: React.FC<{
  palabras: Palabra[]; marca: Marca; tam: number; titulo?: boolean; alinear?: 'center' | 'left';
  sombra?: boolean; maxAncho?: number; colorTexto?: string; serif?: boolean;
}> = ({palabras, marca, tam, titulo, alinear = 'center', sombra, maxAncho = 900, colorTexto, serif}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: alinear === 'center' ? 'center' : 'flex-start',
      gap: `${tam * 0.12}px ${tam * 0.28}px`, maxWidth: maxAncho, textAlign: alinear}}>
      {palabras.map((w, i) => {
        const f0 = Math.round(w.t * fps);
        const s = spring({frame: frame - f0, fps, config: {damping: 14, stiffness: 180, mass: 0.6}});
        const visible = frame >= f0;
        const clave = esClave(w.p);
        return (
          <span key={i} style={{
            display: 'inline-block', opacity: visible ? Math.min(1, s * 1.4) : 0,
            transform: `translateY(${(1 - s) * tam * 0.45}px) scale(${0.85 + 0.15 * s})`,
            fontFamily: serif ? 'Georgia, "Times New Roman", serif' : fuente(marca, titulo),
            fontStyle: serif && clave ? 'italic' : 'normal',
            fontWeight: titulo ? 900 : 700, fontSize: tam, lineHeight: 1.05,
            color: clave ? marca.accent : colorTexto || marca.text,
            textShadow: sombra ? '0 6px 24px rgba(0,0,0,0.55)' : undefined,
          }}>{limpia(w.p)}</span>
        );
      })}
    </div>
  );
};

// Grano de película animado (SVG feTurbulence con semilla cambiante).
export const Grano: React.FC<{fuerza?: number}> = ({fuerza = 0.12}) => {
  const frame = useCurrentFrame();
  const semilla = Math.floor(frame / 2) % 50;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'overlay', opacity: fuerza * 3}}>
      <svg width="100%" height="100%">
        <filter id={`g${semilla}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={semilla} stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter={`url(#g${semilla})`} />
      </svg>
    </AbsoluteFill>
  );
};

// Textura de papel (fija) y viñeta.
export const Papel: React.FC<{fuerza?: number}> = ({fuerza = 0.18}) => (
  <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'multiply', opacity: fuerza}}>
    <svg width="100%" height="100%">
      <filter id="papel"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed={7} />
        <feColorMatrix values="0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 0 0.62  0 0 0 1.4 -0.2" /></filter>
      <rect width="100%" height="100%" filter="url(#papel)" />
    </svg>
  </AbsoluteFill>
);

export const Vineta: React.FC<{fuerza?: number}> = ({fuerza = 0.55}) => (
  <AbsoluteFill style={{pointerEvents: 'none', background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${fuerza}) 100%)`}} />
);

// Partículas que siempre se mueven: polvo, nieve o chispas.
export const Particulas: React.FC<{tipo?: 'polvo' | 'nieve' | 'chispas'; n?: number; color?: string}> = ({tipo = 'polvo', n = 40, color}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {new Array(n).fill(0).map((_, i) => {
        const x0 = random(`x${i}`) * width;
        const vel = tipo === 'nieve' ? 60 + random(`v${i}`) * 90 : 10 + random(`v${i}`) * 25;
        const y = tipo === 'nieve' ? ((random(`y${i}`) * height + t * vel) % (height + 40)) - 20
                                   : (random(`y${i}`) * height - t * vel + height * 10) % height;
        const x = x0 + Math.sin(t * (0.5 + random(`w${i}`)) + i) * 25;
        const r = tipo === 'nieve' ? 3 + random(`r${i}`) * 6 : 1.5 + random(`r${i}`) * 3;
        const op = tipo === 'chispas' ? 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i)) : 0.35 + random(`o${i}`) * 0.45;
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: r * 2, height: r * 2, borderRadius: '50%',
          background: color || (tipo === 'chispas' ? '#FFD27A' : '#FFFFFF'), opacity: op, filter: `blur(${tipo === 'nieve' ? 1 : 0.5}px)`}} />;
      })}
    </AbsoluteFill>
  );
};

// Luz cálida que cruza la imagen.
export const Luz: React.FC<{color?: string; fuerza?: number}> = ({color = '255,190,120', fuerza = 0.35}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width} = useVideoConfig();
  const x = interpolate(frame, [0, durationInFrames], [-0.6 * width, 1.2 * width]);
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen', opacity: fuerza}}>
      <div style={{position: 'absolute', left: x, top: '-20%', width: width * 0.6, height: '140%', transform: 'rotate(18deg)',
        background: `linear-gradient(90deg, rgba(${color},0) 0%, rgba(${color},0.9) 50%, rgba(${color},0) 100%)`, filter: 'blur(40px)'}} />
    </AbsoluteFill>
  );
};
