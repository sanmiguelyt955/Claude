// Modo 1: reel 100 % animado con código (sin video de IA). Escenas desde un guion JSON + marca + voz/música.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, CalculateMetadataFunction} from 'remotion';
import {Marca, MARCA_DEFECTO, Palabra, PalabraAPalabra, partir, fuente, Grano, Particulas, esClave, limpia} from './comun';

export type EscenaReel = {
  tipo: 'gancho' | 'frase' | 'lista' | 'dato' | 'grafica' | 'cta';
  dur: number;                 // segundos
  texto?: string;              // gancho / frase / cta (usa *palabra* para destacar)
  palabras?: Palabra[];        // tiempos reales de la voz (los pone motion.py)
  titulo?: string;             // lista / grafica / dato
  items?: string[];            // lista
  valor?: number; prefijo?: string; sufijo?: string; etiqueta?: string;  // dato
  barras?: {etiqueta: string; valor: number}[];                         // grafica
  emoji?: string;
};

export type ReelProps = {
  escenas: EscenaReel[];
  marca?: Marca;
  estilo?: 'bold' | 'neon' | 'minimal';
  voz?: string;     // archivo en la carpeta pública del trabajo
  musica?: string;
  volumenMusica?: number;
  progreso?: boolean;
};

const FPS = 30;

export const calcularReel: CalculateMetadataFunction<ReelProps> = ({props}) => ({
  durationInFrames: Math.max(1, Math.round(props.escenas.reduce((a, e) => a + e.dur, 0) * FPS)),
  fps: FPS,
});

const Fondo: React.FC<{m: Marca; estilo: string; i: number}> = ({m, estilo, i}) => {
  const frame = useCurrentFrame();
  const ang = 135 + Math.sin(frame / 90 + i) * 25;
  if (estilo === 'minimal') return <AbsoluteFill style={{background: m.primary}} />;
  if (estilo === 'neon')
    return (
      <AbsoluteFill style={{background: '#05050c'}}>
        <AbsoluteFill style={{background: `radial-gradient(circle at ${50 + Math.sin(frame / 60) * 20}% ${40 + Math.cos(frame / 70) * 15}%, ${m.accent}55, transparent 55%)`}} />
        <AbsoluteFill style={{background: `radial-gradient(circle at ${30 + Math.cos(frame / 80) * 15}% 80%, ${m.secondary || m.accent}44, transparent 50%)`}} />
        <AbsoluteFill style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '90px 90px', transform: `translateY(${(frame * 1.5) % 90}px)`}} />
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill style={{background: `linear-gradient(${ang}deg, ${m.primary} 0%, ${m.primary} 55%, ${m.secondary || m.accent} 140%)`}}>
      {[0, 1, 2].map((k) => (
        <div key={k} style={{position: 'absolute', width: 520 - k * 120, height: 520 - k * 120, borderRadius: '50%',
          border: `${10 - k * 3}px solid ${m.accent}`, opacity: 0.12,
          left: 600 - k * 160 + Math.sin(frame / (50 + k * 20)) * 60, top: 200 + k * 520 + Math.cos(frame / (60 + k * 15)) * 50}} />
      ))}
    </AbsoluteFill>
  );
};

const Entrada: React.FC<{children: React.ReactNode; dur: number}> = ({children, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 16, stiffness: 140}});
  const salida = interpolate(frame, [dur * fps - 8, dur * fps], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity: salida, transform: `scale(${0.92 + 0.08 * s})`, justifyContent: 'center', alignItems: 'center', padding: 90}}>{children}</AbsoluteFill>;
};

const Gancho: React.FC<{e: EscenaReel; m: Marca}> = ({e, m}) => (
  <Entrada dur={e.dur}>
    {e.emoji && <div style={{fontSize: 160, marginBottom: 30}}>{e.emoji}</div>}
    <PalabraAPalabra palabras={e.palabras || partir(e.texto || '', e.dur, 0.05)} marca={m} tam={118} titulo sombra />
  </Entrada>
);

const Frase: React.FC<{e: EscenaReel; m: Marca}> = ({e, m}) => (
  <Entrada dur={e.dur}><PalabraAPalabra palabras={e.palabras || partir(e.texto || '', e.dur)} marca={m} tam={96} sombra /></Entrada>
);

const Lista: React.FC<{e: EscenaReel; m: Marca}> = ({e, m}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const items = e.items || [];
  const paso = (e.dur * 0.75) / Math.max(items.length, 1);
  return (
    <Entrada dur={e.dur}>
      {e.titulo && <div style={{fontFamily: fuente(m, true), fontWeight: 900, fontSize: 104, color: m.text, marginBottom: 60, textAlign: 'center'}}>{e.titulo}</div>}
      <div style={{display: 'flex', flexDirection: 'column', gap: 34, width: '100%'}}>
        {items.map((it, i) => {
          const s = spring({frame: frame - Math.round((0.3 + i * paso) * fps), fps, config: {damping: 14}});
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 30, opacity: s, transform: `translateX(${(1 - s) * -200}px)`}}>
              <div style={{minWidth: 116, height: 116, borderRadius: 28, background: m.accent, color: m.primary, fontFamily: fuente(m, true),
                fontWeight: 900, fontSize: 72, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{i + 1}</div>
              <div style={{fontFamily: fuente(m), fontWeight: 800, fontSize: 80, color: m.text, lineHeight: 1.1}}>
                {it.split(/\s+/).map((p, k) => <span key={k} style={{color: esClave(p) ? m.accent : m.text}}>{limpia(p)} </span>)}
              </div>
            </div>
          );
        })}
      </div>
    </Entrada>
  );
};

const Dato: React.FC<{e: EscenaReel; m: Marca}> = ({e, m}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = interpolate(frame, [0.2 * fps, Math.min(e.dur * 0.6, 2.2) * fps], [0, e.valor || 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: (x) => 1 - Math.pow(1 - x, 3)});
  const dec = Number.isInteger(e.valor) ? 0 : 1;
  return (
    <Entrada dur={e.dur}>
      {e.titulo && <div style={{fontFamily: fuente(m), fontWeight: 800, fontSize: 76, color: m.text, opacity: 0.9, marginBottom: 10, textAlign: 'center'}}>{e.titulo}</div>}
      <div style={{fontFamily: fuente(m, true), fontWeight: 900, fontSize: 260, color: m.accent, lineHeight: 1}}>
        {e.prefijo || ''}{v.toLocaleString('es-MX', {minimumFractionDigits: dec, maximumFractionDigits: dec})}{e.sufijo || ''}
      </div>
      {e.etiqueta && <div style={{fontFamily: fuente(m), fontWeight: 800, fontSize: 76, color: m.text, marginTop: 24, textAlign: 'center'}}>{e.etiqueta}</div>}
    </Entrada>
  );
};

const Grafica: React.FC<{e: EscenaReel; m: Marca}> = ({e, m}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const barras = e.barras || [];
  const max = Math.max(...barras.map((b) => b.valor), 1);
  return (
    <Entrada dur={e.dur}>
      {e.titulo && <div style={{fontFamily: fuente(m, true), fontWeight: 900, fontSize: 100, color: m.text, marginBottom: 70, textAlign: 'center'}}>{e.titulo}</div>}
      <div style={{display: 'flex', flexDirection: 'column', gap: 36, width: '100%'}}>
        {barras.map((b, i) => {
          const s = spring({frame: frame - Math.round((0.3 + i * 0.25) * fps), fps, config: {damping: 18}});
          const destacada = b.valor === max;
          return (
            <div key={i}>
              <div style={{fontFamily: fuente(m), fontWeight: 800, fontSize: 64, color: m.text, marginBottom: 12}}>{b.etiqueta}</div>
              <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
                <div style={{height: 96, borderRadius: 20, width: `${(b.valor / max) * 75 * s}%`, background: destacada ? m.accent : m.text, opacity: destacada ? 1 : 0.6}} />
                <div style={{fontFamily: fuente(m, true), fontWeight: 900, fontSize: 72, color: destacada ? m.accent : m.text, opacity: s}}>{b.valor}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Entrada>
  );
};

const Cta: React.FC<{e: EscenaReel; m: Marca}> = ({e, m}) => {
  const frame = useCurrentFrame();
  const pulso = 1 + Math.sin(frame / 6) * 0.03;
  return (
    <Entrada dur={e.dur}>
      <PalabraAPalabra palabras={e.palabras || partir(e.texto || '', e.dur, 0.05)} marca={m} tam={100} titulo sombra />
      <div style={{marginTop: 70, transform: `scale(${pulso})`, background: m.accent, color: m.primary, borderRadius: 999, padding: '28px 70px',
        fontFamily: fuente(m, true), fontWeight: 900, fontSize: 58}}>{e.etiqueta || 'Síguenos'}</div>
    </Entrada>
  );
};

const VISTAS = {gancho: Gancho, frase: Frase, lista: Lista, dato: Dato, grafica: Grafica, cta: Cta};

export const Reel: React.FC<ReelProps> = ({escenas, marca, estilo = 'bold', voz, musica, volumenMusica = 0.25, progreso = true}) => {
  const m = {...MARCA_DEFECTO, ...(marca || {})};
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  let desde = 0;
  return (
    <AbsoluteFill style={{background: m.primary}}>
      {escenas.map((e, i) => {
        const dur = Math.round(e.dur * fps);
        const Vista = VISTAS[e.tipo] || Frase;
        const bloque = (
          <Sequence key={i} from={desde} durationInFrames={dur}>
            <Fondo m={m} estilo={estilo} i={i} />
            {estilo === 'neon' && <Particulas tipo="chispas" n={25} color={m.accent} />}
            <Vista e={e} m={m} />
          </Sequence>
        );
        desde += dur;
        return bloque;
      })}
      {estilo !== 'minimal' && <Grano fuerza={0.06} />}
      {progreso && <div style={{position: 'absolute', left: 0, bottom: 0, height: 14, width: `${(frame / durationInFrames) * 100}%`, background: m.accent}} />}
      {voz && <Audio src={staticFile(voz)} />}
      {musica && <Audio src={staticFile(musica)} volume={voz ? volumenMusica : 0.8} />}
    </AbsoluteFill>
  );
};
