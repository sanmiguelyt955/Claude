"""REA Studio - plantillas de escenas. Herramientas > Scripts > + y elegir este archivo."""
import obspython as obs

PLANTILLAS = {
    "Horizontal 16:9": (1920, 1080),
    "Vertical 9:16": (1080, 1920),
    "Cuadrado 1:1": (1080, 1080),
}
FUENTES = [  # (nombre, tipo, ajustes)
    ("Camara", "dshow_input" if __import__("sys").platform == "win32" else "v4l2_input", {}),
    ("Pantalla", "monitor_capture" if __import__("sys").platform == "win32" else "xshm_input", {}),
    ("Titulo", "text_ft2_source_v2" if __import__("sys").platform == "win32" else "text_ft2_source", {"text": "Titulo"}),
    ("Microfono", "wasapi_input_capture" if __import__("sys").platform == "win32" else "pulse_input_capture", {}),
]
_sel = list(PLANTILLAS)[0]

def crear(props, prop):
    ancho, alto = PLANTILLAS[_sel]
    v = obs.obs_video_info()
    if obs.obs_get_video_info(v):
        v.base_width, v.base_height = ancho, alto
        v.output_width, v.output_height = ancho, alto
        obs.obs_reset_video(v)  # solo si no hay salidas activas
    nombre = f"REA {_sel}"
    escena = obs.obs_scene_create(nombre)
    for n, tipo, aj in FUENTES:
        s = obs.obs_data_create()
        for k, val in aj.items():
            obs.obs_data_set_string(s, k, val)
        fuente = obs.obs_source_create(tipo, f"{nombre} - {n}", s, None)
        if fuente:
            obs.obs_scene_add(escena, fuente)
            obs.obs_source_release(fuente)
        obs.obs_data_release(s)
    obs.obs_scene_release(escena)
    return True

def script_description():
    return "Crea escenas con camara, pantalla, titulo y microfono en formato 16:9, 9:16 o 1:1. Edita FUENTES para tus propias plantillas."

def script_update(settings):
    global _sel
    _sel = obs.obs_data_get_string(settings, "plantilla") or _sel

def script_properties():
    p = obs.obs_properties_create()
    lst = obs.obs_properties_add_list(p, "plantilla", "Plantilla", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    for n in PLANTILLAS:
        obs.obs_property_list_add_string(lst, n, n)
    obs.obs_properties_add_button(p, "crear", "Crear escena", crear)
    return p
