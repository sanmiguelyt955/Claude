'use strict';

// Vista previa en el navegador. Sincroniza varios <video>, <img>, <audio>, textos y formas
// con la posición de la línea de tiempo. Es una aproximación: la exportación es la referencia
// (por ejemplo, el croma y las transiciones se ven simplificados aquí).
(function () {
  const PRESET_CSS = {
    none: '',
    warm: 'sepia(0.2) saturate(1.1)',
    cool: 'hue-rotate(-10deg) saturate(0.95)',
    bw: 'grayscale(1)',
    vintage: 'sepia(0.3) saturate(0.7)',
    vivid: 'saturate(1.5) contrast(1.1)',
    dramatic: 'contrast(1.35) brightness(0.95) saturate(1.2)',
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  class Preview {
    constructor(stage, { urlFor, mediaFor }) {
      this.stage = stage;
      this.urlFor = urlFor;      // id -> url
      this.mediaFor = mediaFor;  // id -> { type, hasAudio }
      this.els = new Map();      // clipId -> { el, mediaId, kind }
      this.project = null;
      this.baseTrackId = null;
      this.canvas = { w: 1280, h: 720 };
    }

    setProject(project) {
      this.project = project;
      const [w, h] = VEModel.RATIOS[project.ratio] || VEModel.RATIOS['16:9'];
      this.canvas = { w, h };
      this.stage.style.aspectRatio = `${w} / ${h}`;
      const firstVideo = project.tracks.find((t) => t.kind === 'video');
      this.baseTrackId = firstVideo ? firstVideo.id : null;
      this.gc();
    }

    // Quita los elementos de clips que ya no existen.
    gc() {
      const ids = new Set();
      for (const t of this.project.tracks) for (const c of t.clips) ids.add(c.id);
      for (const [id, entry] of this.els) {
        if (!ids.has(id)) {
          entry.el.remove();
          this.els.delete(id);
        }
      }
    }

    scale() {
      return (this.stage.clientHeight || 1) / this.canvas.h;
    }

    ensure(clip, kind) {
      let entry = this.els.get(clip.id);
      if (entry && entry.kind === kind && entry.mediaId === clip.mediaId) return entry;
      if (entry) entry.el.remove();
      let el;
      if (kind === 'video') {
        el = document.createElement('video');
        el.playsInline = true;
        el.preload = 'auto';
      } else if (kind === 'image') {
        el = document.createElement('img');
        el.alt = '';
      } else if (kind === 'audio') {
        el = document.createElement('audio');
        el.preload = 'auto';
      } else {
        el = document.createElement('div');
      }
      el.className = `layer layer-${kind}`;
      if (kind !== 'div') el.src = this.urlFor(clip.mediaId);
      el.dataset.clip = clip.id;
      this.stage.appendChild(el);
      entry = { el, mediaId: clip.mediaId, kind };
      this.els.set(clip.id, entry);
      return entry;
    }

    // Aplica la posición de t (segundos) a todos los clips. `playing` decide si cada medio suena.
    sync(t, playing) {
      if (!this.project) return;
      const s = this.scale();
      const { w: W, h: H } = this.canvas;
      let zIndex = 1;
      for (const track of this.project.tracks) {
        const isBase = track.id === this.baseTrackId;
        for (const clip of track.clips) {
          const dur = VEModel.clipDuration(clip);
          const active = t >= clip.at - 1e-6 && t < clip.at + dur;
          const isMedia = clip.type === 'video' || clip.type === 'image' || clip.type === 'audio';
          if (clip.type === 'text' || clip.type === 'shape') {
            this.syncGraphic(clip, track, active, t, s, zIndex++);
            continue;
          }
          if (!isMedia) continue;
          const m = this.mediaFor(clip.mediaId);
          if (!m) continue;
          const kind = clip.type === 'audio' ? 'audio' : clip.type === 'image' ? 'image' : 'video';
          const entry = this.ensure(clip, kind);
          const el = entry.el;
          if (kind === 'image') {
            el.style.display = active ? '' : 'none';
            this.placeVisual(el, clip, isBase, t, s, W, H, zIndex++);
            continue;
          }
          if (!active) {
            el.style.display = 'none';
            if (!el.paused) el.pause();
            continue;
          }
          el.style.display = kind === 'audio' ? 'none' : '';
          if (kind === 'video') this.placeVisual(el, clip, isBase, t, s, W, H, zIndex++);

          const local = clip.in + (t - clip.at) * clip.speed;
          if (el.readyState >= 1 && Math.abs(el.currentTime - local) > 0.25) {
            try { el.currentTime = local; } catch (_) { /* aún no listo */ }
          }
          el.playbackRate = clamp(clip.speed, 0.0625, 16);
          const fade = this.fadeFactor(clip, t, dur);
          const trackMuted = track.muted || clip.muted || !m.hasAudio;
          el.muted = trackMuted;
          el.volume = trackMuted ? 0 : clamp(clip.volume * fade, 0, 1);
          if (playing && el.paused) el.play().catch(() => {});
          if (!playing && !el.paused) el.pause();
        }
      }
    }

    fadeFactor(clip, t, dur) {
      let f = 1;
      if (clip.fadeIn > 0) f = Math.min(f, clamp((t - clip.at) / clip.fadeIn, 0, 1));
      if (clip.fadeOut > 0) f = Math.min(f, clamp((clip.at + dur - t) / clip.fadeOut, 0, 1));
      return f;
    }

    placeVisual(el, clip, isBase, t, s, W, H, z) {
      el.style.zIndex = String(z);
      el.style.filter = this.filterCss(clip);
      const elapsed = t - clip.at;
      let tp = 1;
      let dx = 0;
      let dy = 0;
      const tr = clip.transitionIn;
      if (tr && elapsed < tr.dur) {
        const p = clamp(elapsed / tr.dur, 0, 1);
        if (tr.type === 'fade') tp = p;
        if (tr.type === 'slide-left') dx = (1 - p) * 100;
        if (tr.type === 'slide-right') dx = -(1 - p) * 100;
        if (tr.type === 'slide-up') dy = (1 - p) * 100;
        if (tr.type === 'slide-down') dy = -(1 - p) * 100;
      }
      el.style.opacity = String(clip.opacity * tp);
      if (isBase) {
        el.classList.add('layer-base');
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.objectFit = 'contain';
        el.style.left = '0';
        el.style.top = '0';
        el.style.transform = dx || dy ? `translate(${dx}%, ${dy}%)` : '';
        return;
      }
      const wPct = clip.scale;
      el.style.width = `${wPct}%`;
      el.style.height = 'auto';
      el.style.left = `calc(${clip.x}% + ${dx}%)`;
      el.style.top = `calc(${clip.y}% + ${dy}%)`;
      el.style.transform = 'translate(-50%, -50%)';
    }

    filterCss(clip) {
      const f = clip.filter || {};
      const parts = [PRESET_CSS[f.preset] || ''];
      if (f.brightness) parts.push(`brightness(${1 + f.brightness})`);
      if (f.contrast !== undefined && f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
      if (f.saturation !== undefined && f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
      return parts.filter(Boolean).join(' ');
    }

    syncGraphic(clip, track, active, t, s, z) {
      let entry = this.els.get(clip.id);
      if (!entry) {
        const el = document.createElement('div');
        el.className = `layer layer-${clip.type}`;
        el.dataset.clip = clip.id;
        this.stage.appendChild(el);
        entry = { el, mediaId: null, kind: clip.type };
        this.els.set(clip.id, entry);
      }
      const el = entry.el;
      el.style.zIndex = String(100 + z);
      el.style.display = active ? '' : 'none';
      if (!active) return;
      if (clip.type === 'text') {
        if (el.textContent !== clip.text) el.textContent = clip.text;
        el.style.left = `${clip.x}%`;
        el.style.top = `${clip.y}%`;
        el.style.transform = 'translate(-50%, -50%)';
        el.style.fontSize = `${clip.size * s}px`;
        el.style.color = clip.color;
        el.style.whiteSpace = 'pre';
        el.style.textAlign = 'center';
        el.style.fontWeight = '700';
        el.style.textShadow = '0 0 3px #000, 0 0 3px #000';
        el.style.background = clip.bg ? hexAlpha(clip.bg, clip.bgOpacity) : 'transparent';
        el.style.padding = clip.bg ? `${14 * s}px ${20 * s}px` : '0';
        el.style.borderRadius = clip.bg ? `${10 * s}px` : '0';
        el.style.position = 'absolute';
        el.style.lineHeight = '1.15';
        el.style.maxWidth = '90%';
      } else {
        el.style.position = 'absolute';
        el.style.left = `${clip.x}%`;
        el.style.top = `${clip.y}%`;
        el.style.width = `${clip.w}%`;
        el.style.height = `${clip.h}%`;
        el.style.transform = 'translate(-50%, -50%)';
        el.style.background = clip.color;
        el.style.opacity = String(clip.opacity);
      }
    }
  }

  function hexAlpha(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  globalThis.VEPreview = Preview;
})();
