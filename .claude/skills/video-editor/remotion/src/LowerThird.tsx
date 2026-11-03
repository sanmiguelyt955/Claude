import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
export type Brand = {primary: string; accent: string; text: string; font: string};
export type LowerThirdProps = {name: string; role: string; brand: Brand};
export const LowerThird: React.FC<LowerThirdProps> = ({name, role, brand}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const inn = spring({frame: f, fps, config: {damping: 15}});
  const out = interpolate(f, [durationInFrames - 15, durationInFrames], [1, 0], {extrapolateLeft: 'clamp'});
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', padding: '0 60px 700px', fontFamily: brand.font}}>
      <div style={{transform: `translateX(${(1 - inn) * -600}px)`, opacity: out, display: 'flex'}}>
        <div style={{width: 14, background: brand.accent}} />
        <div style={{background: brand.primary, padding: '24px 36px'}}>
          <div style={{color: brand.text, fontSize: 64, fontWeight: 800}}>{name}</div>
          <div style={{color: brand.accent, fontSize: 38}}>{role}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
