"""Música de suspenso sintetizada a medida (sin derechos): tic-tac, latido grave, pad oscuro, golpe en cada cambio
de escena y crescendo antes del giro.

Uso: python3 musica.py salida.wav DUR1 DUR2 ... [--giro N]   (duraciones de escena en s; N = escena del giro, 1-based)
"""
import sys
import numpy as np
import soundfile as sf

SR = 44100


def env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / r)


def main():
    args = sys.argv[1:]
    giro = None
    if "--giro" in args:
        i = args.index("--giro"); giro = int(args[i + 1]); del args[i:i + 2]
    salida, durs = args[0], [float(x) for x in args[1:]]
    total = sum(durs) + 0.8
    n = int(total * SR)
    t = np.arange(n) / SR
    mix = np.zeros(n)
    rng = np.random.default_rng(7)
    cortes = np.cumsum([0] + durs)
    t_giro = cortes[giro - 1] if giro else cortes[-2]

    # Pad oscuro (Re menor) que respira; sube antes del giro
    for f, g in [(73.42, 0.5), (87.31, 0.3), (110.0, 0.35), (146.83, 0.15)]:
        mix += g * np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.11 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t + f))
    sube = np.clip((t - (t_giro - 3.5)) / 3.5, 0, 1) * (t < t_giro)
    mix *= 0.10 * (1 + 1.5 * sube)

    # Tic-tac de reloj (más rápido en el crescendo)
    k = 0.0
    while k < total - 0.5:
        i0 = int(k * SR); m = min(int(0.03 * SR), n - i0)
        ruido = rng.standard_normal(m) * env(m, 0.0005, 0.004)
        tono = np.sin(2 * np.pi * (2400 if int(k * 2) % 2 else 1800) * np.arange(m) / SR) * env(m, 0.0005, 0.006)
        mix[i0:i0 + m] += 0.07 * (ruido + tono)
        k += 0.25 if (t_giro - 3.5) < k < t_giro else 0.5

    # Latido grave cada 1 s (doble golpe)
    for b in np.arange(0.0, total - 0.6, 1.0):
        for d, g in [(0, 1.0), (0.22, 0.6)]:
            i0 = int((b + d) * SR); m = min(int(0.35 * SR), n - i0)
            tt = np.arange(m) / SR
            mix[i0:i0 + m] += 0.28 * g * np.sin(2 * np.pi * (55 + 40 * np.exp(-tt * 30)) * tt) * env(m, 0.002, 0.12)

    # Golpe en cada cambio de escena (y uno fuerte en el giro)
    for c in cortes[1:-1]:
        i0 = int(c * SR); m = min(int(1.6 * SR), n - i0)
        tt = np.arange(m) / SR
        fuerte = 1.8 if abs(c - t_giro) < 0.01 else 1.0
        golpe = np.sin(2 * np.pi * (45 + 60 * np.exp(-tt * 12)) * tt) * env(m, 0.002, 0.45)
        golpe += 0.25 * rng.standard_normal(m) * env(m, 0.001, 0.08)
        mix[i0:i0 + m] += 0.35 * fuerte * golpe
        # «whoosh» previo
        w0 = max(0, i0 - int(0.5 * SR)); mw = i0 - w0
        if mw > 0:
            mix[w0:i0] += 0.06 * rng.standard_normal(mw) * np.linspace(0, 1, mw) ** 2

    # Silencio justo antes del giro (tensión) y salida suave
    hueco = (t > t_giro - 0.35) & (t < t_giro)
    mix[hueco] *= 0.15
    mix *= np.clip((total - t) / 1.2, 0, 1)
    mix = np.tanh(mix * 1.4) / np.tanh(1.4)
    mix /= np.max(np.abs(mix)) + 1e-9
    est = np.stack([mix, np.roll(mix, 220)], 1) * 0.9
    sf.write(salida, est, SR)
    print(salida, round(total, 2))


if __name__ == "__main__":
    main()
