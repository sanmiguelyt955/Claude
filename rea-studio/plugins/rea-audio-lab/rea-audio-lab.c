/* REA Audio Lab: filtro de audio para OBS con pasa-altos, EQ de 4 bandas, de-esser, compresor y limitador.
 * El procesado vive en rea_dsp.h (probado con test_dsp.c). El cableado a libobs NO esta probado. GPL-2.0-or-later. */
#include <obs-module.h>
#include "rea_dsp.h"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("rea-audio-lab", "en-US")

#define MAXCH 8
struct lab { obs_source_t *ctx; rea_chain ch[MAXCH]; size_t nch; };

static const char *lab_name(void *u) { UNUSED_PARAMETER(u); return "REA Audio Lab"; }

static void lab_update(void *d, obs_data_t *s)
{
	struct lab *f = d;
	f->nch = audio_output_get_channels(obs_get_audio());
	if (f->nch > MAXCH) f->nch = MAXCH;
	float fs = (float)audio_output_get_sample_rate(obs_get_audio());
	for (size_t c = 0; c < f->nch; c++) {
		rea_chain *r = &f->ch[c];
		r->fs = fs;
		r->hp_hz = (float)obs_data_get_double(s, "hp_hz");
		char k[24];
		for (int b = 0; b < REA_BANDS; b++) {
			snprintf(k, sizeof k, "eq%d_hz", b); r->eq_f[b] = (float)obs_data_get_double(s, k);
			snprintf(k, sizeof k, "eq%d_db", b); r->eq_g[b] = (float)obs_data_get_double(s, k);
			snprintf(k, sizeof k, "eq%d_q", b);  r->eq_q[b] = (float)obs_data_get_double(s, k);
		}
		r->deess_db = (float)obs_data_get_double(s, "deess_db");
		r->deess_hz = (float)obs_data_get_double(s, "deess_hz");
		r->deess_thr = (float)obs_data_get_double(s, "deess_thr");
		r->comp_thr = (float)obs_data_get_double(s, "comp_thr");
		r->comp_ratio = (float)obs_data_get_double(s, "comp_ratio");
		r->comp_att_ms = (float)obs_data_get_double(s, "comp_att");
		r->comp_rel_ms = (float)obs_data_get_double(s, "comp_rel");
		r->makeup_db = (float)obs_data_get_double(s, "makeup_db");
		r->lim_db = (float)obs_data_get_double(s, "lim_db");
		rea_chain_update(r);
	}
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
	rea_chain d; rea_chain_defaults(&d, 48000);
	obs_data_set_default_double(s, "hp_hz", d.hp_hz);
	char k[24];
	for (int b = 0; b < REA_BANDS; b++) {
		snprintf(k, sizeof k, "eq%d_hz", b); obs_data_set_default_double(s, k, d.eq_f[b]);
		snprintf(k, sizeof k, "eq%d_db", b); obs_data_set_default_double(s, k, 0.0);
		snprintf(k, sizeof k, "eq%d_q", b);  obs_data_set_default_double(s, k, d.eq_q[b]);
	}
	obs_data_set_default_double(s, "deess_db", 0.0); /* apagado por defecto */
	obs_data_set_default_double(s, "deess_hz", d.deess_hz);
	obs_data_set_default_double(s, "deess_thr", d.deess_thr);
	obs_data_set_default_double(s, "comp_thr", 0.0);
	obs_data_set_default_double(s, "comp_ratio", 1.0);
	obs_data_set_default_double(s, "comp_att", d.comp_att_ms);
	obs_data_set_default_double(s, "comp_rel", d.comp_rel_ms);
	obs_data_set_default_double(s, "makeup_db", 0.0);
	obs_data_set_default_double(s, "lim_db", d.lim_db);
}
static obs_properties_t *lab_props(void *d)
{
	UNUSED_PARAMETER(d);
	obs_properties_t *p = obs_properties_create();
	obs_properties_add_float_slider(p, "hp_hz", "Pasa-altos (Hz, 0=off)", 0.0, 400.0, 1.0);
	static const char *nom[REA_BANDS] = {"Graves (shelf)", "Medios bajos", "Medios altos / presencia", "Agudos (shelf)"};
	char k[24], t[64];
	for (int b = 0; b < REA_BANDS; b++) {
		snprintf(k, sizeof k, "eq%d_hz", b); snprintf(t, sizeof t, "EQ %s: frecuencia (Hz)", nom[b]);
		obs_properties_add_float_slider(p, k, t, 20.0, 18000.0, 1.0);
		snprintf(k, sizeof k, "eq%d_db", b); snprintf(t, sizeof t, "EQ %s: ganancia (dB)", nom[b]);
		obs_properties_add_float_slider(p, k, t, -18.0, 18.0, 0.1);
		snprintf(k, sizeof k, "eq%d_q", b); snprintf(t, sizeof t, "EQ %s: Q", nom[b]);
		obs_properties_add_float_slider(p, k, t, 0.2, 5.0, 0.05);
	}
	obs_properties_add_float_slider(p, "deess_db", "De-esser: reduccion max (dB, 0=off)", 0.0, 20.0, 0.5);
	obs_properties_add_float_slider(p, "deess_hz", "De-esser: frecuencia (Hz)", 3000.0, 10000.0, 50.0);
	obs_properties_add_float_slider(p, "deess_thr", "De-esser: umbral (dB)", -60.0, 0.0, 0.5);
	obs_properties_add_float_slider(p, "comp_thr", "Compresor: umbral (dB)", -60.0, 0.0, 0.5);
	obs_properties_add_float_slider(p, "comp_ratio", "Compresor: ratio", 1.0, 20.0, 0.1);
	obs_properties_add_float_slider(p, "comp_att", "Compresor: ataque (ms)", 1.0, 200.0, 1.0);
	obs_properties_add_float_slider(p, "comp_rel", "Compresor: relajacion (ms)", 10.0, 1000.0, 5.0);
	obs_properties_add_float_slider(p, "makeup_db", "Ganancia de salida (dB)", -12.0, 24.0, 0.1);
	obs_properties_add_float_slider(p, "lim_db", "Techo del limitador (dB)", -24.0, 0.0, 0.1);
	return p;
}
static struct obs_audio_data *lab_filter(void *d, struct obs_audio_data *a)
{
	struct lab *f = d;
	for (size_t c = 0; c < f->nch; c++)
		if (a->data[c]) rea_chain_process(&f->ch[c], (float *)a->data[c], a->frames);
	return a;
}

struct obs_source_info rea_audio_lab = {
	.id = "rea_audio_lab", .type = OBS_SOURCE_TYPE_FILTER, .output_flags = OBS_SOURCE_AUDIO,
	.get_name = lab_name, .create = lab_create, .destroy = lab_destroy, .update = lab_update,
	.get_defaults = lab_defaults, .get_properties = lab_props, .filter_audio = lab_filter,
};
bool obs_module_load(void) { obs_register_source(&rea_audio_lab); return true; }
