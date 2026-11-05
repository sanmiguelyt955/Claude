import React from 'react';
import {Composition} from 'remotion';
import {LowerThird, LowerThirdProps} from './LowerThird';
import {TitleCard, TitleCardProps} from './TitleCard';
import {Counter, CounterProps} from './Counter';
import {Reel, ReelProps, calcularReel} from './Reel';
import {Collage, CollageProps, calcularCollage} from './Collage';

// Todas las composiciones reciben `brand` (colores/fuentes del JSON de marca) por props.
const brand = {primary: '#111111', accent: '#FFD400', text: '#FFFFFF', font: 'Arial'};

export const Root: React.FC = () => (
  <>
    <Composition id="LowerThird" component={LowerThird} durationInFrames={120} fps={30} width={1080} height={1920}
      defaultProps={{name: 'Nombre Apellido', role: 'Cargo / Descripción', brand} as LowerThirdProps} />
    <Composition id="TitleCard" component={TitleCard} durationInFrames={90} fps={30} width={1080} height={1920}
      defaultProps={{title: 'TÍTULO', subtitle: 'subtítulo', brand} as TitleCardProps} />
    <Composition id="Counter" component={Counter} durationInFrames={90} fps={30} width={1080} height={1920}
      defaultProps={{from: 0, to: 100, suffix: '%', label: 'Crecimiento', brand} as CounterProps} />
    {/* Modo 1 y 2: la duración sale del guion (suma de escenas). Tamaño por defecto vertical; --width/--height para otros. */}
    <Composition id="Reel" component={Reel} calculateMetadata={calcularReel} durationInFrames={300} fps={30} width={1080} height={1920}
      defaultProps={{estilo: 'bold', escenas: [{tipo: 'gancho', dur: 2.5, texto: '¿Sabías *esto*?'}]} as ReelProps} />
    <Composition id="Collage" component={Collage} calculateMetadata={calcularCollage} durationInFrames={300} fps={30} width={1080} height={1920}
      defaultProps={{escenas: []} as CollageProps} />
  </>
);
