import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand} from './LowerThird';
export type TitleCardProps = {title: string; subtitle?: string; brand: Brand};
export const TitleCard: React.FC<TitleCardProps> = ({title, subtitle, brand}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const s = spring({frame: f, fps, config: {damping: 12}});
  const out = interpolate(f, [durationInFrames - 12, durationInFrames], [1, 0], {extrapolateLeft: 'clamp'});
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', fontFamily: brand.font, opacity: out}}>
      <div style={{transform: `scale(${0.6 + 0.4 * s})`, color: brand.text, fontSize: 130, fontWeight: 900, textAlign: 'center', textShadow: '0 8px 30px rgba(0,0,0,.6)'}}>{title}</div>
      {subtitle && <div style={{marginTop: 20, background: brand.accent, color: brand.primary, fontSize: 52, padding: '8px 28px', fontWeight: 700}}>{subtitle}</div>}
    </AbsoluteFill>
  );
};
