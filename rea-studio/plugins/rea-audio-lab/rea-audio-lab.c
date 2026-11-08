/* REA Audio Lab: filtro de audio de OBS (pasa-altos 1 polo + ganancia + limitador suave tanh).
 * Compilar como plugin externo (ver CMakeLists.txt) contra libobs. SIN PROBAR. GPL-2.0-or-later. */
#include <obs-module.h>
#include <math.h>

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("rea-audio-lab", "en-US")

struct lab { obs_source_t *ctx; float hp_hz, gain_db, ceil_db; float prev_in[8], prev_out[8]; uint32_t rate; size_t ch; };

static const char *lab_name(void *u) { UNUSED_PARAMETER(u); return "REA Audio Lab"; }
static void lab_update(void *d, obs_data_t *s)
{
	struct lab *f = d;
	f->hp_hz = (float)obs_data_get_double(s, "hp_hz");
	f->gain_db = (float)obs_data_get_double(s, "gain_db");
	f->ceil_db = (float)obs_data_get_double(s, "ceil_db");
	f->rate = audio_output_get_sample_rate(obs_get_audio());
	f->ch = audio_output_get_channels(obs_get_audio());
}
static void *lab_create(obs_data_t *s, obs_source_t *src)
{
	struct lab *f = bzalloc(sizeof(*f));
	f->ctx = src;
	lab_update(f, s);
	return f;
}
static void lab_destroy(void *d) { bfree(d); }
static void lab_defaults(obs_data_t *s)
{
	obs_data_set_default_double(s, "hp_hz", 80.0);
	obs_data_set_default_double(s, "gain_db", 0.0);
	obs_data_set_default_double(s, "ceil_db", -1.0);
}
static obs_properties_t *lab_props(void *d)
{
	UNUSED_PARAMETER(d);
	obs_properties_t *p = obs_properties_create();
	obs_properties_add_float_slider(p, "hp_hz", "Pasa-altos (Hz)", 0.0, 400.0, 1.0);
	obs_properties_add_float_slider(p, "gain_db", "Ganancia (dB)", -30.0, 30.0, 0.1);
	obs_properties_add_float_slider(p, "ceil_db", "Techo limitador (dB)", -24.0, 0.0, 0.1);
	return p;
}
static struct obs_audio_data *lab_filter(void *d, struct obs_audio_data *a)
{
	struct lab *f = d;
	float rc = 1.0f / (2.0f * (float)M_PI * (f->hp_hz > 1 ? f->hp_hz : 1));
	float dt = 1.0f / (float)f->rate, alpha = rc / (rc + dt);
	float g = powf(10.0f, f->gain_db / 20.0f), ceil = powf(10.0f, f->ceil_db / 20.0f);
	for (size_t c = 0; c < f->ch && c < 8; c++) {
		float *x = (float *)a->data[c];
		if (!x) continue;
		for (uint32_t i = 0; i < a->frames; i++) {
			float in = x[i];
			float out = f->hp_hz > 0 ? alpha * (f->prev_out[c] + in - f->prev_in[c]) : in;
			f->prev_in[c] = in; f->prev_out[c] = out;
			x[i] = ceil * tanhf(out * g / ceil);
		}
	}
	return a;
}

struct obs_source_info rea_audio_lab = {
	.id = "rea_audio_lab", .type = OBS_SOURCE_TYPE_FILTER, .output_flags = OBS_SOURCE_AUDIO,
	.get_name = lab_name, .create = lab_create, .destroy = lab_destroy, .update = lab_update,
	.get_defaults = lab_defaults, .get_properties = lab_props, .filter_audio = lab_filter,
};
bool obs_module_load(void) { obs_register_source(&rea_audio_lab); return true; }
