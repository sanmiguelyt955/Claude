// Motor de pantalla: dibuja el estado en vivo sobre un lienzo lógico de 1920x1080 escalado al contenedor.
// Lo usan el proyector, OBS, la vista previa y el monitor "en vivo" del operador.
import { fmtClock } from '../shared/model.js';
import { resolveSrc } from './store.js';

const W = 1920, H = 1080;
const el = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function slideHtml(slide) {
  if (slide?.verses) return slide.verses.map(v => `<sup>${v.n}</sup>${esc(v.t)}`).join(' ');
  return esc(slide?.text).replace(/\n/g, '<br>');
}

/**
 * @param {HTMLElement} container
 * @param {{mode?: 'full'|'lower', muted?: boolean, chrome?: boolean}} opts  chrome=false oculta alerta/cuenta/logo/negro (vista previa)
 */
export function createScreen(container, opts = {}) {
  const mode = opts.mode ?? 'full';
  const root = el('pscreen' + (mode === 'lower' ? ' lower' : ''));
  const bg = el('ps-bg'), media = el('ps-media'), dim = el('ps-dim');
  const textA = el('ps-text'), textB = el('ps-text');
  const footer = el('ps-footer'), count = el('ps-count'), alertBar = el('ps-alert'), logo = el('ps-logo'), black = el('ps-black');
  alertBar.append(el('ps-alert-in', 'span'));
  root.append(bg, dim, media, textA, textB, footer, count, logo, alertBar, black);
  container.append(root);

  const fit = () => {
    const r = container.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H) || 0.1;
    root.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  const ro = new ResizeObserver(fit); ro.observe(container); fit();

  let front = textA, back = textB, lastKey = '', lastBg = '', lastMedia = '', lastAlert = '', timer = null, state = null, seq = 0;

  function styleText(box, theme) {
    const m = mode === 'lower' ? 3 : theme.margin;
    Object.assign(box.style, {
      fontFamily: theme.font, color: theme.color, fontWeight: theme.bold ? '700' : '400', fontStyle: theme.italic ? 'italic' : 'normal',
      textTransform: theme.upper ? 'uppercase' : 'none', textAlign: mode === 'lower' ? 'center' : theme.align, lineHeight: theme.lineHeight,
      justifyContent: mode === 'lower' ? 'center' : { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[theme.valign] ?? 'center',
      padding: `${m}%`, paddingBottom: mode === 'lower' ? '2%' : `calc(${m}% + ${theme.footer ? 50 : 0}px)`,
      textShadow: theme.shadow ? '0 4px 14px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9)' : 'none',
      webkitTextStroke: theme.outline ? `${theme.outline}px #000` : '0',
      transitionDuration: (theme.fade ?? 350) + 'ms',
    });
  }

  function autoFit(box, theme) {
    const inner = box.firstChild;
    let size = mode === 'lower' ? Math.min(theme.size, 64) : theme.size;
    const maxH = box.clientHeight - parseFloat(getComputedStyle(box).paddingTop) - parseFloat(getComputedStyle(box).paddingBottom);
    inner.style.fontSize = size + 'px';
    for (let i = 0; i < 40 && size > 18 && inner.scrollHeight > maxH; i++) { size = Math.floor(size * 0.94); inner.style.fontSize = size + 'px'; }
  }

  async function setBg(theme, my) {
    const b = mode === 'lower' ? { type: 'none' } : theme.bg;
    const key = JSON.stringify(b);
    if (key === lastBg) return;
    lastBg = key;
    const url = (b.type === 'image' || b.type === 'video') ? await resolveSrc(b.src) : '';
    if (my !== seq) return;
    bg.replaceChildren();
    bg.style.background = b.type === 'none' ? 'transparent' : b.type === 'gradient' ? `linear-gradient(160deg, ${b.color}, ${b.color2})` : (b.color || '#000');
    if (b.type === 'image' && url) { bg.style.background = `#000 url("${url}") center / cover no-repeat`; }
    if (b.type === 'video' && url) {
      const v = el('', 'video'); v.src = url; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
      bg.append(v); v.play().catch(() => {});
    }
  }

  async function setMedia(m, my) {
    const key = m ? m.kind + m.src : '';
    if (key === lastMedia) return;
    lastMedia = key;
    const url = m ? await resolveSrc(m.src) : '';
    if (my !== seq) return;
    media.replaceChildren();
    if (!m || !url) return;
    if (m.kind === 'video') {
      const v = el('', 'video'); v.src = url; v.playsInline = true; v.autoplay = true; v.muted = !!opts.muted; v.controls = false;
      media.append(v);
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    } else { const i = el('', 'img'); i.src = url; i.alt = ''; media.append(i); }
  }

  function tick() {
    const cd = state?.countdown;
    if (!cd?.on || opts.chrome === false) { count.classList.remove('on'); return; }
    const left = cd.endAt - Date.now();
    count.classList.add('on');
    count.classList.toggle('big', !state.pres || state.clear);
    count.innerHTML = (cd.label ? `<small>${esc(cd.label)}</small>` : '') + `<b>${fmtClock(left)}</b>`;
  }

  async function update(live) {
    state = live;
    const my = ++seq;
    const pres = live.pres, slide = pres?.slides[live.index];
    const chrome = opts.chrome !== false;
    root.classList.toggle('empty', !pres);
    if (pres) { setBg(pres.theme, my); dim.style.background = `rgba(0,0,0,${(pres.theme.dim || 0) / 100})`; }
    else if (mode !== 'lower') { lastBg = ''; bg.replaceChildren(); bg.style.background = '#000'; dim.style.background = 'transparent'; }
    setMedia(pres && !live.clear ? slide?.media : null, my);

    const showText = !!pres && !live.clear && !slide?.media && !!slide?.text;
    const key = showText ? pres.id + '|' + live.index + '|' + JSON.stringify(pres.theme) + '|' + slide.text : '';
    if (key !== lastKey) {
      lastKey = key;
      [front, back] = [back, front];
      back.classList.remove('on');
      if (showText) {
        front.innerHTML = `<div class="ps-inner">${slideHtml(slide)}</div>`;
        styleText(front, pres.theme);
        autoFit(front, pres.theme);
        front.classList.add('on');
      } else front.classList.remove('on');
    }
    const foot = showText && pres.theme.footer && mode !== 'lower' ? slide.footer : '';
    footer.textContent = foot || '';
    footer.style.color = pres?.theme.color ?? '#fff';
    footer.style.fontFamily = pres?.theme.font ?? '';
    footer.classList.toggle('on', !!foot);

    black.classList.toggle('on', chrome && !!live.black);
    logo.classList.toggle('on', chrome && !!live.logo?.on);
    if (chrome && live.logo?.on) {
      const lk = live.logo.src + '|' + live.logo.text;
      if (logo.dataset.k !== lk) {
        logo.dataset.k = lk;
        const url = await resolveSrc(live.logo.src);
        logo.innerHTML = url ? `<img src="${esc(url)}" alt="">` : `<span>${esc(live.logo.text || '')}</span>`;
      }
    }
    const a = chrome && live.alert?.on ? live.alert.text : '';
    if (a !== lastAlert) {
      lastAlert = a;
      const span = alertBar.firstChild;
      span.textContent = a;
      span.style.animation = 'none'; void span.offsetWidth;
      span.style.animation = a ? `ps-marquee ${Math.max(12, a.length * 0.28)}s linear infinite` : 'none';
    }
    alertBar.classList.toggle('on', !!a);
    tick();
    clearInterval(timer);
    if (live.countdown?.on && chrome) timer = setInterval(tick, 250);
  }

  return { update, destroy() { clearInterval(timer); ro.disconnect(); root.remove(); } };
}
