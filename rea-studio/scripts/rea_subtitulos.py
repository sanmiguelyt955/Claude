"""REA Studio - muestra subtitulos en una fuente de texto leyendo un archivo que escribe subtitulos_whisper.py."""
import os
import obspython as obs

archivo = os.path.expanduser("~/subtitulos.txt")
fuente = "Subtitulos"

def _tick():
    try:
        with open(archivo, encoding="utf-8") as f:
            texto = f.read()[-160:]
    except OSError:
        return
    src = obs.obs_get_source_by_name(fuente)
    if src:
        d = obs.obs_data_create()
        obs.obs_data_set_string(d, "text", texto)
        obs.obs_source_update(src, d)
        obs.obs_data_release(d)
        obs.obs_source_release(src)

def script_description():
    return "Subtitulos en vivo: ejecuta subtitulos_whisper.py y crea una fuente de texto llamada 'Subtitulos'."

def script_properties():
    p = obs.obs_properties_create()
    obs.obs_properties_add_path(p, "archivo", "Archivo de subtitulos", obs.OBS_PATH_FILE, "*.txt", archivo)
    obs.obs_properties_add_text(p, "fuente", "Nombre de la fuente de texto", obs.OBS_TEXT_DEFAULT)
    return p

def script_update(s):
    global archivo, fuente
    archivo = obs.obs_data_get_string(s, "archivo") or archivo
    fuente = obs.obs_data_get_string(s, "fuente") or fuente

def script_load(s):
    obs.timer_add(_tick, 500)

def script_unload():
    obs.timer_remove(_tick)
