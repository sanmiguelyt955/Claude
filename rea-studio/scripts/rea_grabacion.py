"""REA Studio - automatizacion de grabacion: nombre, carpeta, registro y division por tiempo."""
import os, time, json
import obspython as obs

carpeta = os.path.expanduser("~/Videos/REA")
prefijo = "REA"
dividir_min = 0
_ultimo = 0.0

def _aplicar():
    os.makedirs(carpeta, exist_ok=True)
    perfil = obs.obs_frontend_get_profile_config()
    obs.config_set_string(perfil, "SimpleOutput", "FilePath", carpeta)
    obs.config_set_string(perfil, "AdvOut", "RecFilePath", carpeta)
    obs.config_set_string(perfil, "Output", "FilenameFormatting", prefijo + "_%CCYY-%MM-%DD_%hh-%mm-%ss")

def _evento(ev):
    global _ultimo
    if ev == obs.OBS_FRONTEND_EVENT_RECORDING_STARTED:
        _ultimo = time.time()
    elif ev == obs.OBS_FRONTEND_EVENT_RECORDING_STOPPED:
        ruta = obs.obs_frontend_get_last_recording()
        reg = os.path.join(carpeta, "registro.jsonl")
        with open(reg, "a", encoding="utf-8") as f:
            f.write(json.dumps({"archivo": ruta, "segundos": round(time.time() - _ultimo)}) + "\n")

def _tick():
    global _ultimo
    if dividir_min and obs.obs_frontend_recording_active() and time.time() - _ultimo > dividir_min * 60:
        _ultimo = time.time()
        obs.obs_frontend_recording_split_file()

def script_description():
    return "Carpeta y nombre automaticos, registro de grabaciones (registro.jsonl) y division cada N minutos."

def script_properties():
    p = obs.obs_properties_create()
    obs.obs_properties_add_path(p, "carpeta", "Carpeta", obs.OBS_PATH_DIRECTORY, "", carpeta)
    obs.obs_properties_add_text(p, "prefijo", "Prefijo", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_int(p, "dividir", "Dividir cada (min, 0=no)", 0, 600, 1)
    return p

def script_update(s):
    global carpeta, prefijo, dividir_min
    carpeta = os.path.expanduser(obs.obs_data_get_string(s, "carpeta") or carpeta)
    prefijo = obs.obs_data_get_string(s, "prefijo") or prefijo
    dividir_min = obs.obs_data_get_int(s, "dividir")
    _aplicar()

def script_load(s):
    obs.obs_frontend_add_event_callback(_evento)
    obs.timer_add(_tick, 5000)

def script_unload():
    obs.timer_remove(_tick)
