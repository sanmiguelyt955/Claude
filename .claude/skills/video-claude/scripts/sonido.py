"""Banda sonora procedural para videos de historia (sin derechos, sin conectores): efectos de sonido sintetizados,
música que cambia de ánimo por secciones y mezcla con «ducking» bajo la voz.

En el guion de collage, cada escena puede llevar:
  "animo": "misterio" | "robo" | "panico" | "investigacion" | "giro" | "final" | "alegre" | "caos"
           (la música cambia al cambiar; alegre/caos van con el estilo «caricatura» de Kubo)
  "sfx":   ["pasos", {"tipo": "sello", "en": "clave"}, {"tipo": "silbato", "en": 1.2}]
           en = "inicio" (por defecto) | "clave" (cuando la voz dice la palabra *clave*) | segundos desde el inicio
Además se pone solo un «whoosh» en cada transición y un golpe cuando aparece un «titular».

Efectos: whoosh, impacto, sello, camara, pasos, puerta, llave, silbato, multitud, maquina, papel, tren, riser,
latido, reloj, campana, revelacion, caja, vine_boom, zumbido, pasos_alfombra, remate, pop.
Caricatura (Kubo): boing, grito, ronquido, fuego, soplido, masticar, deslizar, caida, burbuja, tada.

Uso directo: python3 sonido.py props.json voz.mp3 salida.wav   (props con escenas ya alineadas)
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
RNG = np.random.default_rng(11)


# ------------------------------------------------------------------ utilidades

def _t(d):
    return np.arange(int(d * SR)) / SR


def _env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)


def _ruido(d):
    return RNG.standard_normal(int(d * SR))


def _lp(x, fc):
    """Paso bajo de un polo (fc puede ser un arreglo: filtro que barre)."""
    from scipy.signal import lfilter
    if np.isscalar(fc):
        a = np.exp(-2 * np.pi * fc / SR)
        return lfilter([1 - a], [1, -a], x)
    a = np.exp(-2 * np.pi * np.asarray(fc) / SR)
    y, prev = np.empty_like(x), 0.0
    for i in range(len(x)):
        prev = (1 - a[i]) * x[i] + a[i] * prev
        y[i] = prev
    return y


def _bp(x, f1, f2):
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(2, [f1, f2], btype="band", fs=SR, output="sos"), x)


def _hp(x, f):
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(2, f, btype="high", fs=SR, output="sos"), x)


def _norm(x, pico=0.9):
    m = np.max(np.abs(x)) if len(x) else 0
    return x * (pico / m) if m > 0 else x


def _reverb(x, d=1.2, mezcla=0.3):
    ir = _ruido(d) * np.exp(-_t(d) / (d / 5))
    ir = _lp(ir, 5000)
    from scipy.signal import fftconvolve
    h = fftconvolve(x, ir)[: len(x) + int(d * SR)]
    h = _norm(h, np.max(np.abs(x)) + 1e-9)
    y = np.zeros(len(h))
    y[: len(x)] += x
    return y * (1 - mezcla) + h * mezcla


def _pluck(f, d=0.6, brillo=0.5):
    """Cuerda pulsada (Karplus-Strong): pizzicato, bajo."""
    n, p = int(d * SR), max(2, int(SR / f))
    buf = RNG.uniform(-1, 1, p)
    y = np.empty(n)
    for i in range(n):
        y[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * (0.993 + 0.006 * brillo)
    return y * _env(n, 0.001, d / 2.5)


def _nota(f, d, timbre="piano"):
    t = _t(d)
    if timbre == "piano":
        y = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.6 for k in range(1, 6)) * _env(len(t), 0.004, d / 3)
    elif timbre == "campana":
        y = sum(g * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (1.5 + k)) for k, g in [(1, 1), (2.76, .5), (5.4, .25), (8.9, .12)])
    else:  # pad
        y = sum(np.sin(2 * np.pi * f * (1 + dt) * t) for dt in (-0.004, 0, 0.005)) / 3
        y *= np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4)
    return y


def _f(nombre):
    notas = {"C": -9, "C#": -8, "Db": -8, "D": -7, "D#": -6, "Eb": -6, "E": -5, "F": -4, "F#": -3, "Gb": -3, "G": -2,
             "G#": -1, "Ab": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2}
    n, o = nombre[:-1], int(nombre[-1])
    return 440 * 2 ** ((notas[n] + 12 * (o - 4)) / 12)


# ------------------------------------------------------------------ efectos

def whoosh(d=0.55):
    t = _t(d)
    forma = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    return _norm(_lp(_ruido(d), 300 + 5000 * forma) * forma, 0.8)


def impacto(d=1.8):
    t = _t(d)
    cuerpo = np.sin(2 * np.pi * (38 + 70 * np.exp(-t * 14)) * t) * _env(len(t), 0.002, 0.5)
    golpe = _lp(_ruido(d), 2500) * _env(len(t), 0.001, 0.06)
    return _norm(_reverb(cuerpo + 0.6 * golpe, 1.5, 0.25))


def sello(d=0.5):
    t = _t(d)
    thud = np.sin(2 * np.pi * (60 + 90 * np.exp(-t * 40)) * t) * _env(len(t), 0.001, 0.07)
    slap = _hp(_ruido(d), 1500) * _env(len(t), 0.0005, 0.02)
    return _norm(thud + 0.5 * slap)


def camara(d=0.9):
    y = np.zeros(int(d * SR))
    for s in (0.0, 0.05):
        i = int(s * SR); c = _hp(_ruido(0.02), 2000) * _env(int(0.02 * SR), 0.0002, 0.004)
        y[i:i + len(c)] += c
    poof = _lp(_ruido(0.6), 1800) * _env(int(0.6 * SR), 0.01, 0.15)
    i = int(0.08 * SR); y[i:i + len(poof)] += 0.7 * poof[: len(y) - i]
    return _norm(y)


def pasos(d=2.0, ritmo=0.42):
    y = np.zeros(int(d * SR))
    for k, s in enumerate(np.arange(0, d - 0.2, ritmo)):
        i = int(s * SR)
        thump = _lp(_ruido(0.12), 400) * _env(int(0.12 * SR), 0.002, 0.03)
        click = _bp(_ruido(0.04), 1800, 5000) * _env(int(0.04 * SR), 0.0005, 0.008) * 0.5
        y[i:i + len(thump)] += thump * (0.8 + 0.2 * (k % 2))
        y[i:i + len(click)] += click
    return _norm(_reverb(y, 1.0, 0.35))


def puerta(d=1.4):
    t = _t(d * 0.75)
    f0 = 170 + 70 * np.sin(2 * np.pi * 0.9 * t) + 25 * RNG.standard_normal(len(t)).cumsum() / np.sqrt(len(t))
    fase = 2 * np.pi * np.cumsum(f0) / SR
    creak = (2 * ((fase / (2 * np.pi)) % 1) - 1) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 11 * t)))
    creak = _bp(creak, 400, 3000) * np.minimum(1, t / 0.1)
    y = np.zeros(int(d * SR)); y[: len(creak)] += creak * 0.6
    clack = sello(0.3); i = int(d * 0.75 * SR); y[i:i + len(clack)] += clack[: len(y) - i]
    return _norm(_reverb(y, 0.8, 0.3))


def llave(d=1.0):
    y = np.zeros(int(d * SR))
    for s in RNG.uniform(0, 0.45, 5):
        i = int(s * SR); n = int(0.15 * SR); t = np.arange(n) / SR
        c = sum(np.sin(2 * np.pi * f * t) for f in RNG.uniform(2500, 6500, 3)) * np.exp(-t * 40)
        y[i:i + n] += c[: len(y) - i] * 0.3
    clack = sello(0.3); i = int(0.6 * SR); y[i:i + len(clack)] += clack[: len(y) - i]
    return _norm(y)


def silbato(d=1.3):
    y = np.zeros(int(d * SR))
    for s, dur in ((0.0, 0.45), (0.6, 0.6)):
        t = _t(dur)
        f = 2900 + 180 * np.sign(np.sin(2 * np.pi * 28 * t))
        tono = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.03)
        tono += 0.15 * _bp(_ruido(dur), 2000, 6000)
        i = int(s * SR); y[i:i + len(tono)] += tono[: len(y) - i]
    return _norm(_reverb(y, 1.0, 0.3), 0.6)


def multitud(d=3.0, voces=36):
    y = np.zeros(int(d * SR)); t = _t(d)
    for _ in range(voces):
        f1 = RNG.uniform(250, 600)
        v = _bp(_ruido(d), f1, f1 * 2.4)
        silabas = np.clip(np.sin(2 * np.pi * RNG.uniform(3, 6) * t + RNG.uniform(0, 6)), 0, 1) ** 2
        frases = np.clip(np.sin(2 * np.pi * RNG.uniform(0.2, 0.5) * t + RNG.uniform(0, 6)) + 0.3, 0, 1)
        y += v * silabas * frases
    y *= np.minimum(1, t / 0.5) * np.minimum(1, (d - t) / 0.5)
    return _norm(_reverb(y, 1.5, 0.4), 0.7)


def maquina(d=1.6):
    y = np.zeros(int(d * SR)); s = 0.0
    while s < d - 0.4:
        i = int(s * SR); c = _bp(_ruido(0.03), 1500, 6000) * _env(int(0.03 * SR), 0.0003, 0.006)
        y[i:i + len(c)] += c * RNG.uniform(0.6, 1)
        s += RNG.uniform(0.07, 0.14)
    ding = _nota(2093, 0.5, "campana") * 0.5; i = int((d - 0.5) * SR); y[i:i + len(ding)] += ding[: len(y) - i]
    return _norm(y)


def papel(d=0.8):
    t = _t(d)
    am = np.clip(_lp(np.abs(_ruido(d)), 25) * 6, 0, 1)
    return _norm(_hp(_ruido(d), 2500) * am * np.sin(np.pi * t / d), 0.6)


def tren(d=3.0):
    y = np.zeros(int(d * SR)); s, paso = 0.0, 0.32
    while s < d - 0.2:
        i = int(s * SR); ch = _lp(_ruido(0.18), 900) * _env(int(0.18 * SR), 0.01, 0.05)
        y[i:i + len(ch)] += ch
        s += paso; paso = max(0.16, paso * 0.96)
    t = _t(1.0)
    pito = (np.sin(2 * np.pi * 620 * t) + np.sin(2 * np.pi * 780 * t)) * np.minimum(1, t / 0.08) * np.minimum(1, (1 - t) / 0.2)
    y[: len(pito)] += 0.35 * pito
    return _norm(_reverb(y, 1.2, 0.3), 0.8)


def riser(d=2.5):
    t = _t(d); x = t / d
    sw = np.sin(2 * np.pi * np.cumsum(200 + 1800 * x ** 2) / SR) * 0.3
    return _norm((_lp(_ruido(d), 500 + 7000 * x ** 2) + sw) * x ** 2.2, 0.8)


def latido(d=1.0):
    y = np.zeros(int(d * SR))
    for s, g in ((0, 1), (0.22, 0.6)):
        t = _t(0.35); b = np.sin(2 * np.pi * (50 + 40 * np.exp(-t * 30)) * t) * _env(len(t), 0.002, 0.1) * g
        i = int(s * SR); y[i:i + len(b)] += b[: len(y) - i]
    return _norm(y)


def reloj(d=2.0):
    y = np.zeros(int(d * SR))
    for k, s in enumerate(np.arange(0, d - 0.05, 0.5)):
        i = int(s * SR); n = int(0.03 * SR); tt = np.arange(n) / SR
        c = np.sin(2 * np.pi * (2400 if k % 2 else 1800) * tt) * _env(n, 0.0003, 0.005) + _ruido(0.03)[:n] * _env(n, 0.0003, 0.003)
        y[i:i + n] += c
    return _norm(y, 0.5)


def campana(d=2.0):
    return _norm(_reverb(_nota(_f("A5"), d, "campana"), 1.5, 0.4), 0.6)


def revelacion(d=2.5):
    y = sum(_nota(_f(n), d, "campana") for n in ("D5", "F#5", "A5", "D6"))
    return _norm(_reverb(y + 0.5 * impacto(d)[: int(d * SR)], 2.0, 0.4))


def caja(d=1.2):
    """Cobro: monedas + «ding» de caja registradora."""
    y = llave(0.6)
    out = np.zeros(int(d * SR)); out[: len(y)] += y * 0.6
    ding = _nota(_f("E6"), 0.8, "campana"); i = int(0.35 * SR); out[i:i + len(ding)] += ding[: len(out) - i]
    return _norm(out)


def vine_boom(d=1.6):
    """Golpe grave de remate de chiste (sub + saturación + cola larga)."""
    t = _t(d)
    sub = np.sin(2 * np.pi * (52 + 90 * np.exp(-t * 18)) * t) * _env(len(t), 0.001, 0.55)
    y = np.tanh(3.0 * (sub + 0.35 * _lp(_ruido(d), 900) * _env(len(t), 0.001, 0.05)))
    return _norm(_reverb(y, 1.2, 0.2))


def zumbido(d=3.0):
    """Zumbido de lámparas fluorescentes (60 Hz + armónicos y parpadeo)."""
    t = _t(d)
    y = sum(np.sin(2 * np.pi * 60 * k * t) / k for k in (1, 2, 3, 5)) * (0.85 + 0.15 * np.sin(2 * np.pi * 7.3 * t))
    y += 0.08 * _bp(_ruido(d), 2000, 6000)
    return _norm(y * np.minimum(1, t / 0.2) * np.minimum(1, (d - t) / 0.3), 0.5)


def pasos_alfombra(d=2.0, ritmo=0.45):
    """Pasos apagados sobre alfombra húmeda."""
    y = np.zeros(int(d * SR))
    for k, s in enumerate(np.arange(0, d - 0.2, ritmo)):
        i = int(s * SR); n = int(0.16 * SR)
        y[i:i + n] += _lp(_ruido(0.16), 260)[:n] * _env(n, 0.004, 0.05) * (0.8 + 0.2 * (k % 2))
        y[i:i + n] += 0.15 * _bp(_ruido(0.16), 600, 1800)[:n] * _env(n, 0.002, 0.03)
    return _norm(_reverb(y, 0.6, 0.2))


def remate(d=0.6):
    """Golpe seco y corto para un remate o una palabra clave (más corto que impacto)."""
    t = _t(d)
    y = np.sin(2 * np.pi * (80 + 160 * np.exp(-t * 35)) * t) * _env(len(t), 0.001, 0.12)
    y += 0.5 * _hp(_ruido(d), 1200) * _env(len(t), 0.0005, 0.02)
    return _norm(y)


def pop(d=0.18):
    """«Pop» corto para la entrada de una palabra o un objeto."""
    t = _t(d)
    return _norm(np.sin(2 * np.pi * (600 + 900 * np.exp(-t * 60)) * t) * _env(len(t), 0.0005, 0.03), 0.6)


# ------------------------------------------------------------------ efectos de caricatura (Kubo)

def boing(d=0.6):
    """Resorte de caricatura (salto, rebote)."""
    t = _t(d)
    f = 180 + 260 * np.abs(np.sin(2 * np.pi * 9 * t)) * np.exp(-t * 3)
    return _norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(len(t), 0.002, d / 2), 0.7)


def grito(d=1.2):
    """Grito exagerado de caricatura (sierra que sube con vibrato y saturación)."""
    t = _t(d)
    f = 320 + 380 * np.minimum(1, t / 0.25) + 25 * np.sin(2 * np.pi * 7 * t)
    fase = np.cumsum(f) / SR
    y = sum(((2 * ((k * fase) % 1) - 1) / k) for k in (1, 2, 3))
    y = _bp(np.tanh(2.5 * y), 400, 4000) * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.15)
    return _norm(y, 0.7)


def ronquido(d=2.0):
    """Ronquido: inhalación ruidosa y exhalación con silbido."""
    t = _t(d)
    ciclo = (t % 1.0)
    inh = _lp(_ruido(d), 500) * (np.sin(2 * np.pi * 45 * t) > 0) * (ciclo < 0.55) * np.sin(np.pi * np.clip(ciclo / 0.55, 0, 1))
    exh = np.sin(2 * np.pi * (900 + 300 * ciclo) * t) * 0.2 * (ciclo >= 0.6) * np.sin(np.pi * np.clip((ciclo - 0.6) / 0.4, 0, 1))
    return _norm(inh + exh, 0.6)


def fuego(d=2.0):
    """Fogata: rumor grave + chasquidos."""
    t = _t(d)
    y = 0.4 * _lp(_ruido(d), 400) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.7 * t))
    for s in RNG.uniform(0, d - 0.05, int(d * 14)):
        i = int(s * SR); n = int(0.01 * SR)
        y[i:i + n] += RNG.uniform(0.3, 1) * _hp(_ruido(0.01), 2000)[:n]
    return _norm(y * np.minimum(1, t / 0.1) * np.minimum(1, (d - t) / 0.2), 0.6)


def soplido(d=0.8):
    t = _t(d)
    return _norm(_bp(_ruido(d), 300, 2500) * np.sin(np.pi * t / d) ** 1.5, 0.5)


def masticar(d=1.0):
    y = np.zeros(int(d * SR))
    for s in np.arange(0, d - 0.1, 0.22):
        i = int(s * SR); n = int(0.09 * SR)
        y[i:i + n] += _bp(_ruido(0.09), 500, 3000)[:n] * _env(n, 0.002, 0.03)
    return _norm(y, 0.5)


def deslizar(d=0.7, sube=True):
    """Silbato de émbolo (slide whistle): sube o baja de tono."""
    t = _t(d)
    f = (500 + 1100 * t / d) if sube else (1600 - 1100 * t / d)
    return _norm(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.01 * np.sin(2 * np.pi * 6 * t))) / SR)
                 * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.08), 0.6)


def caida(d=0.9):
    return deslizar(d, sube=False)


def burbuja(d=0.25):
    t = _t(d)
    return _norm(np.sin(2 * np.pi * (300 + 1500 * t / d) * t) * _env(len(t), 0.002, 0.08), 0.5)


def tada(d=1.6):
    """Fanfarria corta de logro."""
    y = np.zeros(int(d * SR))
    for k, (nota, s) in enumerate((("C5", 0), ("E5", 0.1), ("G5", 0.2), ("C6", 0.3))):
        x = _nota(_f(nota), d - s, "campana")
        i = int(s * SR); y[i:i + len(x)] += x[: len(y) - i] * (0.6 if k < 3 else 1)
    return _norm(y, 0.7)


MOTIVO = ["F5", "A5", "C6"]      # las 3 notas de la marca Kubo (firma + tema de la música)


def firma(d=1.3):
    """Firma sonora de Kubo: «bip-bip-DING» (el foco que se prende). Va al inicio y al final de cada video para que el
    canal se reconozca solo por el oído (como un logotipo de sonido)."""
    y = np.zeros(int(d * SR))
    for k, (nota, s, dd) in enumerate(((MOTIVO[0], 0, 0.12), (MOTIVO[1], 0.13, 0.12), (MOTIVO[2], 0.28, d - 0.3))):
        t = _t(dd)
        f = _f(nota)
        x = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * _env(len(t), 0.002, 0.05 if k < 2 else 0.4)
        if k == 2:
            x = 0.6 * x + 0.5 * _nota(f, dd, "campana")
        i = int(s * SR); y[i:i + len(x)] += x[: len(y) - i]
    return _norm(y, 0.8)


EFECTOS = {f.__name__: f for f in (whoosh, impacto, sello, camara, pasos, puerta, llave, silbato, multitud, maquina,
                                    papel, tren, riser, latido, reloj, campana, revelacion, caja,
                                    vine_boom, zumbido, pasos_alfombra, remate, pop,
                                    boing, grito, ronquido, fuego, soplido, masticar, deslizar, caida, burbuja, tada, firma)}
VOLUMEN = {"whoosh": 0.35, "impacto": 0.7, "sello": 0.7, "camara": 0.6, "pasos": 0.45, "puerta": 0.5, "llave": 0.5,
           "silbato": 0.45, "multitud": 0.35, "maquina": 0.45, "papel": 0.4, "tren": 0.5, "riser": 0.45, "latido": 0.6,
           "reloj": 0.35, "campana": 0.45, "revelacion": 0.6, "caja": 0.5,
           "vine_boom": 0.75, "zumbido": 0.25, "pasos_alfombra": 0.45, "remate": 0.55, "pop": 0.35,
           "boing": 0.5, "grito": 0.45, "ronquido": 0.45, "fuego": 0.4, "soplido": 0.4, "masticar": 0.45, "deslizar": 0.45,
           "caida": 0.45, "burbuja": 0.4, "tada": 0.5, "firma": 0.55}


# ------------------------------------------------------------------ música por secciones

BPM = 100
ACORDES = [("D3", "F3", "A3"), ("Bb2", "D3", "F3"), ("G2", "Bb2", "D3"), ("A2", "C#3", "E3")]   # i-VI-iv-V en Re menor
ESCALA = ["D4", "E4", "F4", "G4", "A4", "Bb4", "C#5", "D5"]


# ------------------------------------------------------------------ estilos musicales (misma estructura, otro sonido)
ESTILOS = {
    # Suspenso de cine: Re menor, 100 BPM, pads y pizzicatos (el de la versión actual)
    "cinematico": dict(bpm=100, acordes=ACORDES, escala=ESCALA, pad=0.10, melodia="piano"),
    # Años 20: Do mayor, 120 BPM, piano «stride» a contratiempo y melodía de piano
    "vintage": dict(bpm=120, escala=["C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5"], pad=0.06, melodia="piano", swing=True,
                    acordes=[("C3", "E3", "G3"), ("A2", "C3", "E3"), ("D3", "F3", "A3"), ("G2", "B2", "D3")]),
    # Pulso moderno: La menor, 110 BPM, bombo y hi-hat, arpegios de campana (para tendencias de Shorts/Reels)
    "pulso": dict(bpm=110, escala=["A4", "C5", "D5", "E5", "G5", "A5"], pad=0.07, melodia="campana", kick=True,
                  acordes=[("A2", "C3", "E3"), ("F2", "A2", "C3"), ("C3", "E3", "G3"), ("G2", "B2", "D3")]),
    # Caricatura (Kubo): Fa mayor, 128 BPM, bombo, palmas y marimba alegre — para animos «alegre» y «caos»
    "caricatura": dict(bpm=128, escala=["F4", "G4", "A4", "C5", "D5", "F5"], pad=0.04, melodia="campana", kick=True,
                       motivo=["F5", "A5", "C6"],
                       acordes=[("F2", "A2", "C3"), ("D2", "F2", "A2"), ("Bb2", "D3", "F3"), ("C3", "E3", "G3")]),
}


def _seccion(animo, d, t0, cfg):
    n = int(d * SR); y = np.zeros(n + SR * 2)
    beat = 60 / cfg["bpm"]
    compas = 4 * beat

    def poner(x, s, g=1.0):
        i = int(s * SR)
        if 0 <= i < len(y):
            y[i:i + len(x)] += g * x[: len(y) - i]

    nb = int(np.ceil(d / beat)) + 1
    for b in range(nb):
        s = b * beat
        acorde = cfg["acordes"][int((t0 + s) // compas) % 4]
        if cfg.get("kick") and animo != "giro":          # pulso electrónico: bombo en cada tiempo y hi-hat en cada corchea
            tt = _t(0.2)
            poner(np.sin(2 * np.pi * (48 + 50 * np.exp(-tt * 25)) * tt) * _env(len(tt), 0.001, 0.09), s, 0.35)
            poner(_hp(_ruido(0.05), 7000) * _env(int(0.05 * SR), 0.0005, 0.012), s + beat / 2, 0.10)
        if cfg.get("swing") and animo not in ("giro", "final") and b % 2 == 1:   # vintage: acordes «stride» a contratiempo
            for nota in acorde:
                poner(_nota(_f(nota), 0.35, "piano"), s, 0.07)
        if b % 4 == 0 and animo != "giro":
            for nota in acorde:
                poner(_nota(_f(nota), compas + 0.3, "pad"), s, cfg["pad"] if animo != "final" else cfg["pad"] * 1.6)
        if animo == "misterio":
            poner(reloj(0.06), s, 0.25)
            if b % 2 == 0 and RNG.random() < 0.6:
                poner(_nota(_f(RNG.choice(cfg["escala"])), 1.5, cfg["melodia"]), s + beat * 0.5, 0.18)
            if b % 4 == 0:
                poner(latido(0.6), s, 0.35)
        elif animo == "robo":           # pizzicato sigiloso + bombo suave + shaker
            raiz = acorde[0][:-1] + "3"
            patron = [raiz, acorde[1][:-1] + "4", acorde[2][:-1] + "4", acorde[1][:-1] + "4"]
            for k in range(2):
                poner(_pluck(_f(patron[(2 * b + k) % 4]), 0.35), s + k * beat / 2, 0.22)
            if b % 2 == 0:
                poner(latido(0.35)[: int(0.3 * SR)], s, 0.4)
            for k in range(4):
                poner(_hp(_ruido(0.04), 6000) * _env(int(0.04 * SR), 0.001, 0.01), s + k * beat / 4, 0.08)
        elif animo == "panico":         # trémolo de cuerdas + toms rápidos + bombo en cada tiempo
            for nota in acorde:
                tt = _t(beat)
                trem = (2 * ((_f(nota) * 2 * tt) % 1) - 1) * (0.6 + 0.4 * np.sin(2 * np.pi * 12 * tt))
                poner(_lp(trem, 2500), s, 0.06)
            poner(impacto(0.4)[: int(0.35 * SR)], s, 0.35)
            for k in range(4):
                tt = _t(0.12)
                tom = np.sin(2 * np.pi * (140 - 30 * (k % 2)) * tt) * _env(len(tt), 0.001, 0.05)
                poner(tom, s + k * beat / 4, 0.18)
        elif animo == "investigacion":  # bajo caminante + escobillas en 2 y 4
            bajo = [acorde[0], acorde[1], acorde[2], acorde[1]][b % 4]
            poner(_pluck(_f(bajo[:-1] + "2"), 0.5, 0.2), s, 0.4)
            if b % 2 == 1:
                poner(_bp(_ruido(0.18), 2000, 8000) * _env(int(0.18 * SR), 0.01, 0.06), s, 0.12)
            poner(reloj(0.06), s + beat / 2, 0.12)
            if b % 4 == 2:
                poner(_nota(_f(RNG.choice(cfg["escala"][:5])), 0.9, cfg["melodia"]), s, 0.12)
        elif animo == "giro":           # casi silencio: dron grave que crece
            tt = _t(beat)
            poner(np.sin(2 * np.pi * 36.7 * tt) * 0.5 * min(1, (s + beat) / d), s, 0.5)
        elif animo in ("alegre", "caos"):   # caricatura: bajo saltarín, palmas en 2 y 4, marimba en corcheas
            rapido = animo == "caos"
            poner(_pluck(_f(acorde[0][:-1] + "2"), 0.3, 0.3), s, 0.35)
            poner(_pluck(_f(acorde[2][:-1] + "2"), 0.25, 0.3), s + beat / 2, 0.22)
            if b % 2 == 1:
                poner(_bp(_ruido(0.08), 900, 5000) * _env(int(0.08 * SR), 0.001, 0.025), s, 0.25)
            if b % 8 == 0 and not rapido:            # el tema de la marca (mismas notas que la firma) cada 2 compases
                for k, nota in enumerate(cfg.get("motivo", [])):
                    poner(_nota(_f(nota), 0.4 if k < 2 else 0.9, "campana"), s + k * beat / 2, 0.11)
                continue
            for k in range(4 if rapido else 2):
                nota = cfg["escala"][(b * 3 + k * 2) % len(cfg["escala"])]
                poner(_nota(_f(nota), 0.25, "campana"), s + k * beat / (4 if rapido else 2), 0.09)
        elif animo == "final":          # resolución en mayor con arpegio de campana
            if b % 4 == 0:
                for nota in ("D3", "F#3", "A3"):
                    poner(_nota(_f(nota), compas + 0.3, "pad"), s, 0.10)
            poner(_nota(_f(["D5", "F#5", "A5", "F#5"][b % 4]), 1.2, "campana"), s, 0.12)
    return y[:n]


def musica(secciones, total, cfg):
    y = np.zeros(int((total + 1) * SR))
    for animo, t0, t1 in secciones:
        x = _seccion(animo, t1 - t0 + 0.4, t0, cfg)
        x *= np.minimum(1, np.arange(len(x)) / (0.25 * SR)) * np.minimum(1, (len(x) - np.arange(len(x))) / (0.35 * SR))
        i = int(t0 * SR); y[i:i + len(x)] += _norm(x, 0.6 if animo != "giro" else 0.35)[: len(y) - i]
    return y


# ------------------------------------------------------------------ mezcla completa

def _env_voz(voz, n):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(voz), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True).stdout
    v = np.frombuffer(raw, np.float32).astype(np.float64)
    v = np.pad(v, (0, max(0, n - len(v))))[:n]
    e = _lp(np.abs(v), 4.0)
    return np.clip(e / (np.percentile(e[e > 1e-4], 70) + 1e-9), 0, 1) if np.any(e > 1e-4) else e


def banda(escenas, voz, salida, estilo="cinematico", con_musica=True, densidad="medios", stems=None):
    """densidad: «pocos» (solo los sfx del guion), «medios» (+ whoosh en transiciones y golpe en titulares) o «muchos»
    (+ «pop» en cada palabra clave y golpe de remate al final de cada escena con titular). stems: carpeta donde guardar
    musica.wav y efectos.wav por separado (para editar después)."""
    """escenas ya alineadas (con dur y palabras). Escribe la banda (música + efectos) en WAV estéreo."""
    total = sum(e["dur"] for e in escenas) + 0.8
    n = int(total * SR)
    fx = np.zeros(n)
    inicios = np.cumsum([0] + [e["dur"] for e in escenas])

    def poner(x, s, g):
        i = int(max(0, s) * SR)
        if i < n:
            fx[i:i + len(x)] += g * x[: n - i]

    secciones, actual = [], None
    for k, e in enumerate(escenas):
        t0 = inicios[k]
        clave = next((t0 + w["t"] for w in e.get("palabras", []) if w["p"].startswith("*")), t0 + e["dur"] * 0.4)
        animo = e.get("animo") or (actual[0] if actual else "misterio")
        if not actual or animo != actual[0]:
            if actual:
                secciones.append((actual[0], actual[1], t0))
            actual = (animo, t0)
        if densidad != "pocos" and k > 0 and (escenas[k - 1].get("transicion") or "fundido") != "corte":
            poner(whoosh(), t0 - 0.45, VOLUMEN["whoosh"])
        if densidad != "pocos" and e.get("titular"):
            poner(sello(), clave, 0.65)
        if densidad == "muchos":
            for w in e.get("palabras", []):
                if w["p"].startswith("*"):
                    poner(pop(), t0 + w["t"], VOLUMEN["pop"])
        for s in e.get("sfx", []):
            s = {"tipo": s} if isinstance(s, str) else s
            f = EFECTOS.get(s["tipo"])
            if not f:
                continue
            en = s.get("en", "inicio")
            cuando = clave if en == "clave" else t0 + (en if isinstance(en, (int, float)) else 0)
            x = f(s["dur"]) if "dur" in s else f()
            if s["tipo"] in ("riser",):        # el riser termina justo en el momento indicado
                cuando -= len(x) / SR
            poner(x, cuando, s.get("vol", VOLUMEN[s["tipo"]]))
    secciones.append((actual[0], actual[1], total))
    # Una sección de menos de 2 s suena a corte brusco: se une a la anterior (salvo «giro», que es un silencio a propósito)
    unidas = []
    for sec in secciones:
        if unidas and (sec[2] - sec[1] < 2.0 and sec[0] != "giro" or sec[0] == unidas[-1][0]):
            unidas[-1] = (unidas[-1][0], unidas[-1][1], sec[2])
        else:
            unidas.append(sec)
    secciones = unidas
    mus = musica(secciones, total, ESTILOS[estilo])[:n] if con_musica else np.zeros(n)   # sin música: para poner un sonido de la app (Shorts/Reels)
    mus = np.pad(mus, (0, n - len(mus)))
    # Mezcla: la VOZ manda. Al hablar, la música baja ~14 dB y los efectos ~8 dB más; en silencio, la banda queda
    # unos 12 dB por debajo de la voz. Sin normalizar a pico (eso subía todo y tapaba la voz).
    env = _env_voz(voz, n) if voz else np.zeros(n)
    duck_mus = 1 - 0.85 * env
    duck_fx = 1 - 0.85 * env
    mezcla = mus * 0.22 * duck_mus + fx * 0.16 * duck_fx   # efectos bajos: la música y la voz mandan
    mezcla *= np.minimum(1, (total - np.arange(n) / SR) / 0.8)
    mezcla = np.tanh(mezcla * 1.2) / np.tanh(1.2)
    est = np.stack([mezcla, np.roll(mezcla, 180)], 1)
    import soundfile as sf
    sf.write(str(salida), est, SR)
    if stems:                                    # pistas separadas, sin ducking, para mezclar en otro editor
        Path(stems).mkdir(parents=True, exist_ok=True)
        sf.write(str(Path(stems) / "musica.wav"), np.stack([mus * 0.5] * 2, 1).clip(-1, 1), SR)
        sf.write(str(Path(stems) / "efectos.wav"), np.stack([fx * 0.5] * 2, 1).clip(-1, 1), SR)
    return salida, secciones


if __name__ == "__main__":
    props = json.loads(Path(sys.argv[1]).read_text())
    print(banda(props["escenas"], sys.argv[2], sys.argv[3])[1])
