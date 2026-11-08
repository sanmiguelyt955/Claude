/* REA DSP: ecualizador de 4 bandas (biquads RBJ), de-esser, compresor y limitador.
 * Sin dependencias de OBS para poder probarlo aparte. GPL-2.0-or-later. */
#pragma once
#include <math.h>
#include <stdint.h>
#include <string.h>

#define REA_BANDS 4
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef struct { float b0, b1, b2, a1, a2, z1, z2; } rea_bq;
enum { REA_PEAK, REA_LOWSHELF, REA_HIGHSHELF, REA_HIGHPASS, REA_BANDPASS };

static inline void rea_bq_set(rea_bq *q, int type, float fs, float f0, float gain_db, float Q)
{
	float A = powf(10.f, gain_db / 40.f), w = 2.f * (float)M_PI * f0 / fs;
	float cw = cosf(w), sw = sinf(w), al = sw / (2.f * Q), sA = 2.f * sqrtf(A) * al;
	float b0, b1, b2, a0, a1, a2;
	switch (type) {
	case REA_LOWSHELF:
		b0 = A * ((A + 1) - (A - 1) * cw + sA); b1 = 2 * A * ((A - 1) - (A + 1) * cw);
		b2 = A * ((A + 1) - (A - 1) * cw - sA); a0 = (A + 1) + (A - 1) * cw + sA;
		a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sA; break;
	case REA_HIGHSHELF:
		b0 = A * ((A + 1) + (A - 1) * cw + sA); b1 = -2 * A * ((A - 1) + (A + 1) * cw);
		b2 = A * ((A + 1) + (A - 1) * cw - sA); a0 = (A + 1) - (A - 1) * cw + sA;
		a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sA; break;
	case REA_HIGHPASS:
		b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
	case REA_BANDPASS:
		b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
	default: /* PEAK */
		b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
	}
	q->b0 = b0 / a0; q->b1 = b1 / a0; q->b2 = b2 / a0; q->a1 = a1 / a0; q->a2 = a2 / a0;
}
static inline float rea_bq_run(rea_bq *q, float x)
{
	float y = q->b0 * x + q->z1;
	q->z1 = q->b1 * x - q->a1 * y + q->z2;
	q->z2 = q->b2 * x - q->a2 * y;
	return y;
}

typedef struct {
	float fs;
	/* parametros */
	float hp_hz;
	float eq_f[REA_BANDS], eq_g[REA_BANDS], eq_q[REA_BANDS]; /* banda 0 low-shelf, 3 high-shelf, 1-2 peak */
	float deess_db;   /* reduccion maxima (dB, >=0; 0 = apagado) */
	float deess_hz;   /* centro de las eses */
	float deess_thr;  /* umbral dB */
	float comp_thr, comp_ratio, comp_att_ms, comp_rel_ms, makeup_db;
	float lim_db;
	/* estado */
	rea_bq hp, eq[REA_BANDS], sib;
	float env_c, env_s, gr_s;
} rea_chain;

static inline void rea_chain_defaults(rea_chain *c, float fs)
{
	memset(c, 0, sizeof(*c));
	c->fs = fs; c->hp_hz = 80;
	float f[REA_BANDS] = {120, 400, 3000, 9000}, q[REA_BANDS] = {0.7f, 1.0f, 1.0f, 0.7f};
	for (int i = 0; i < REA_BANDS; i++) { c->eq_f[i] = f[i]; c->eq_q[i] = q[i]; }
	c->deess_db = 6; c->deess_hz = 6500; c->deess_thr = -30;
	c->comp_thr = -18; c->comp_ratio = 3; c->comp_att_ms = 8; c->comp_rel_ms = 80; c->makeup_db = 0;
	c->lim_db = -1;
}
/* llamar tras cambiar parametros (conserva estado) */
static inline void rea_chain_update(rea_chain *c)
{
	rea_bq_set(&c->hp, REA_HIGHPASS, c->fs, c->hp_hz > 10 ? c->hp_hz : 10, 0, 0.707f);
	rea_bq_set(&c->eq[0], REA_LOWSHELF, c->fs, c->eq_f[0], c->eq_g[0], c->eq_q[0]);
	rea_bq_set(&c->eq[1], REA_PEAK, c->fs, c->eq_f[1], c->eq_g[1], c->eq_q[1]);
	rea_bq_set(&c->eq[2], REA_PEAK, c->fs, c->eq_f[2], c->eq_g[2], c->eq_q[2]);
	rea_bq_set(&c->eq[3], REA_HIGHSHELF, c->fs, c->eq_f[3], c->eq_g[3], c->eq_q[3]);
	rea_bq_set(&c->sib, REA_BANDPASS, c->fs, c->deess_hz, 0, 2.0f);
}
static inline float rea_db2lin(float d) { return powf(10.f, d / 20.f); }
static inline float rea_coef(float ms, float fs) { return expf(-1.f / (0.001f * ms * fs)); }

/* procesa un canal (mono) en sitio */
static inline void rea_chain_process(rea_chain *c, float *x, uint32_t n)
{
	float ca = rea_coef(c->comp_att_ms, c->fs), cr = rea_coef(c->comp_rel_ms, c->fs);
	float cs = rea_coef(2.f, c->fs), cd = rea_coef(60.f, c->fs);
	float ceil = rea_db2lin(c->lim_db), mk = rea_db2lin(c->makeup_db);
	for (uint32_t i = 0; i < n; i++) {
		float s = x[i];
		if (c->hp_hz > 0) s = rea_bq_run(&c->hp, s);
		for (int b = 0; b < REA_BANDS; b++) if (c->eq_g[b] != 0.f) s = rea_bq_run(&c->eq[b], s);
		/* de-esser: detecta energia en banda de sibilantes y baja la ganancia */
		if (c->deess_db > 0) {
			float sb = fabsf(rea_bq_run(&c->sib, s));
			c->env_s = sb > c->env_s ? cs * c->env_s + (1 - cs) * sb : cd * c->env_s + (1 - cd) * sb;
			float lv = 20.f * log10f(c->env_s + 1e-9f), over = lv - c->deess_thr;
			float red = over > 0 ? (over < c->deess_db ? over : c->deess_db) : 0;
			c->gr_s = 0.9f * c->gr_s + 0.1f * red;
			s *= rea_db2lin(-c->gr_s);
		}
		/* compresor */
		float a = fabsf(s);
		c->env_c = a > c->env_c ? ca * c->env_c + (1 - ca) * a : cr * c->env_c + (1 - cr) * a;
		float lv = 20.f * log10f(c->env_c + 1e-9f), g = 0;
		if (lv > c->comp_thr) g = -(lv - c->comp_thr) * (1.f - 1.f / c->comp_ratio);
		s *= rea_db2lin(g) * mk;
		/* limitador suave */
		x[i] = ceil * tanhf(s / ceil);
	}
}
