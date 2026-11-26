#!/usr/bin/env python3
"""vidiq_presupuesto.py — cuánto gastamos de vidIQ y cuánto podemos gastar para que alcance hasta el reinicio.

Usa las «fotos» de saldos guardadas en registros/vidiq_saldos.jsonl (una línea por cuenta y por consulta).
Cada vez que Claude revisa saldos con vidiq_balance (gratis), agrega una foto con:
    python3 herramientas/vidiq_presupuesto.py --agregar CUENTA SALDO REINICIO_ISO [--extra N]
Ver el reporte:
    python3 herramientas/vidiq_presupuesto.py

Cálculos por cuenta (el plan gratis da 150 créditos por ciclo de ~30 días):
- gastado en el ciclo = 150 - saldo renovable
- ritmo = gastado / tiempo transcurrido del ciclo  → por día, por hora y por minuto
- se acaban el … = ahora + saldo / ritmo  (si es antes del reinicio: ⚠️)
- presupuesto seguro por día = saldo / días que faltan para el reinicio
"""
import json, sys, os
from datetime import datetime, timedelta, timezone

RUTA = os.path.join(os.path.dirname(__file__), "..", "registros", "vidiq_saldos.jsonl")
CICLO = timedelta(days=30)
COSTOS = "Costos: balance/idea 0 · transcript/búsqueda/trending/outliers/keywords/comentarios/stats 5 · short (ver) 10 · auditoría 10 · miniatura 22 · ver video largo 25"

def fecha(s): return datetime.fromisoformat(s.replace("Z", "+00:00"))

def cargar():
    if not os.path.exists(RUTA): return []
    return [json.loads(l) for l in open(RUTA) if l.strip()]

def agregar(cuenta, saldo, reinicio, extra=0):
    with open(RUTA, "a") as f:
        f.write(json.dumps({"t": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "cuenta": cuenta,
                            "renovables": int(saldo), "max": 150, "extra": int(extra), "reinicio": reinicio}) + "\n")

def reporte():
    fotos = cargar()
    if not fotos: print("Sin fotos todavía."); return
    ult = {}
    for f in fotos: ult[f["cuenta"]] = f                      # última foto de cada cuenta
    ahora = max(fecha(f["t"]) for f in ult.values())
    tot_saldo = tot_gasto = tot_seguro = 0
    print(f"Reporte vidIQ · {ahora:%Y-%m-%d %H:%M} UTC\n")
    print(f"{'Cuenta':26} {'Saldo':>6} {'Gastado':>8} {'/día':>7} {'/hora':>7} {'Se acaba':>12} {'Reinicio':>11} {'Seguro/día':>11}")
    for c, f in sorted(ult.items()):
        rein = fecha(f["reinicio"]); inicio = rein - CICLO
        saldo = f["renovables"] + f.get("extra", 0); gasto = f["max"] - f["renovables"]
        dias = max((fecha(f["t"]) - inicio).total_seconds() / 86400, 1 / 24)   # mínimo 1 hora para no dividir entre ~0
        dia = gasto / dias; falta = max((rein - ahora).total_seconds() / 86400, 0.01)
        if dia > 0:
            acaba = ahora + timedelta(days=saldo / dia)
            txt = acaba.strftime("%d-%b") + (" ⚠️" if acaba < rein else " ✅")
        else: txt = "nunca ✅"
        seguro = saldo / falta
        print(f"{c:26} {saldo:>6} {gasto:>8} {dia:>7.1f} {dia/24:>7.2f} {txt:>12} {rein:%d-%b}{'':>5} {seguro:>11.1f}")
        tot_saldo += saldo; tot_gasto += gasto; tot_seguro += seguro
    print(f"\nTOTAL: {tot_saldo} créditos disponibles · {tot_gasto} gastados en los ciclos actuales")
    print(f"Presupuesto seguro de TODAS las cuentas juntas: {tot_seguro:.0f} créditos/día "
          f"(≈ {tot_seguro/25:.1f} videos largos vistos, o {tot_seguro/5:.0f} transcripciones/búsquedas por día)")
    print(COSTOS)
    print("Nota: con pocas horas de datos el ritmo exagera (pruebas). Se vuelve confiable después de varios días de fotos.")

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["--agregar"]:
        extra = int(a[a.index("--extra") + 1]) if "--extra" in a else 0
        agregar(a[1], a[2], a[3], extra); print("Foto guardada.")
    else: reporte()
