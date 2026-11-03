import React from 'react';
import {Composition} from 'remotion';
import {LowerThird, LowerThirdProps} from './LowerThird';
import {TitleCard, TitleCardProps} from './TitleCard';
import {Counter, CounterProps} from './Counter';

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
  </>
);
