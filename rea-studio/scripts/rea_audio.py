"""REA Studio - cadenas de filtros de audio con parametros editables. Elige una fuente de audio y un preset."""
import obspython as obs

# (id del filtro, nombre, ajustes)
PRESETS = {
    "Voz limpia": [
        ("noise_suppress_filter_v2", "REA Supresion de ruido", {"method": "rnnoise"}),
        ("noise_gate_filter", "REA Puerta de ruido", {"open_threshold": -36.0, "close_threshold": -42.0}),
        ("compressor_filter", "REA Compresor", {"ratio": 4.0, "threshold": -18.0, "attack_time": 6, "release_time": 60, "output_gain": 3.0}),
        ("limiter_filter", "REA Limitador", {"threshold": -2.0}),
    ],
    "Voz fuerte (ambiente ruidoso)": [
        ("noise_suppress_filter_v2", "REA Supresion de ruido", {"method": "rnnoise"}),
        ("noise_gate_filter", "REA Puerta de ruido", {"open_threshold": -28.0, "close_threshold": -34.0}),
        ("compressor_filter", "REA Compresor", {"ratio": 6.0, "threshold": -22.0, "output_gain": 6.0}),
        ("limiter_filter", "REA Limitador", {"threshold": -1.0}),
    ],
    "Musica de fondo": [
        ("compressor_filter", "REA Compresor", {"ratio": 3.0, "threshold": -20.0}),
        ("gain_filter", "REA Ganancia", {"db": -12.0}),
        ("limiter_filter", "REA Limitador", {"threshold": -3.0}),
    ],
}
fuente = ""
preset = list(PRESETS)[0]

def aplicar(props, prop):
    src = obs.obs_get_source_by_name(fuente)
    if not src:
        return False
    for fid, nom, aj in PRESETS[preset]:
        ant = obs.obs_source_get_filter_by_name(src, nom)
        if ant:
            obs.obs_source_filter_remove(src, ant)
            obs.obs_source_release(ant)
        d = obs.obs_data_create()
        for k, v in aj.items():
            (obs.obs_data_set_string if isinstance(v, str) else obs.obs_data_set_double)(d, k, v)
        f = obs.obs_source_create_private(fid, nom, d)
        obs.obs_source_filter_add(src, f)
        obs.obs_source_release(f)
        obs.obs_data_release(d)
    obs.obs_source_release(src)
    return True

def script_description():
    return "Aplica cadenas de filtros de audio (ruido, puerta, compresor, limitador) a una fuente. Edita PRESETS para tus propios ajustes."

def script_properties():
    p = obs.obs_properties_create()
    l = obs.obs_properties_add_list(p, "fuente", "Fuente de audio", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    for s in obs.obs_enum_sources() or []:
        if obs.obs_source_get_output_flags(s) & obs.OBS_SOURCE_AUDIO:
            n = obs.obs_source_get_name(s)
            obs.obs_property_list_add_string(l, n, n)
    pl = obs.obs_properties_add_list(p, "preset", "Preset", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    for n in PRESETS:
        obs.obs_property_list_add_string(pl, n, n)
    obs.obs_properties_add_button(p, "ap", "Aplicar preset", aplicar)
    return p

def script_update(s):
    global fuente, preset
    fuente = obs.obs_data_get_string(s, "fuente")
    preset = obs.obs_data_get_string(s, "preset") or preset
