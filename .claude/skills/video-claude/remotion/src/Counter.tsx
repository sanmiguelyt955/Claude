import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Brand} from './LowerThird';
export type CounterProps = {from: number; to: number; suffix?: string; label?: string; brand: Brand};
export const Counter: React.FC<CounterProps> = ({from, to, suffix = '', label, brand}) => {
  const f = useCurrentFrame();
  const v = Math.round(interpolate(f, [0, 60], [from, to], {extrapolateRight: 'clamp'}));
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', fontFamily: brand.font}}>
      <div style={{color: brand.accent, fontSize: 240, fontWeight: 900, textShadow: '0 8px 30px rgba(0,0,0,.6)'}}>{v}{suffix}</div>
      {label && <div style={{color: brand.text, fontSize: 60, fontWeight: 700}}>{label}</div>}
    </AbsoluteFill>
  );
};
