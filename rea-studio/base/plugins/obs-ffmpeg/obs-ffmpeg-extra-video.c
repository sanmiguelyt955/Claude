/* REA Studio: codificadores de video extra por software (x265/HEVC y VP9), basados en obs-ffmpeg-av1.c. GPL-2.0-or-later. */
#include <obs-module.h>
#include <util/dstr.h>
#include "obs-ffmpeg-video-encoders.h"

#define do_log(level, format, ...) \
	blog(level, "[%s encoder: '%s'] " format, enc->ffve.enc_name, obs_encoder_get_name(enc->ffve.encoder), ##__VA_ARGS__)
#define warn(format, ...) do_log(LOG_WARNING, format, ##__VA_ARGS__)

enum extra_type { EXTRA_X265, EXTRA_VP9 };

struct extra_encoder {
	struct ffmpeg_video_encoder ffve;
	enum extra_type type;
	DARRAY(uint8_t) header;
};

static const char *x265_getname(void *u) { UNUSED_PARAMETER(u); return "x265 (HEVC, software)"; }
static const char *vp9_getname(void *u) { UNUSED_PARAMETER(u); return "VP9 (libvpx, software)"; }

static void extra_video_info(void *data, struct video_scale_info *info)
{
	UNUSED_PARAMETER(data);
	switch (info->format) {
	case VIDEO_FORMAT_I010:
	case VIDEO_FORMAT_P010:
		info->format = VIDEO_FORMAT_I010;
		break;
	default:
		info->format = VIDEO_FORMAT_I420;
	}
}

static bool extra_update(struct extra_encoder *enc, obs_data_t *settings)
{
	const char *rc = obs_data_get_string(settings, "rate_control");
	int bitrate = (int)obs_data_get_int(settings, "bitrate");
	int crf = (int)obs_data_get_int(settings, "crf");
	int keyint_sec = (int)obs_data_get_int(settings, "keyint_sec");
	const char *preset = obs_data_get_string(settings, "preset");
	int speed = (int)obs_data_get_int(settings, "speed");
	bool cqp = astrcmpi(rc, "CRF") == 0;
	AVCodecContext *ctx = enc->ffve.context;

	video_t *video = obs_encoder_video(enc->ffve.encoder);
	const struct video_output_info *voi = video_output_get_info(video);
	struct video_scale_info info;
	info.format = voi->format;
	info.colorspace = voi->colorspace;
	info.range = voi->range;
	extra_video_info(enc, &info);

	ctx->thread_count = 0;

	if (enc->type == EXTRA_X265) {
		av_opt_set(ctx->priv_data, "preset", preset, 0);
		av_opt_set(ctx->priv_data, "tune", "zerolatency", 0);
		struct dstr params = {0};
		if (cqp) {
			av_opt_set_int(ctx->priv_data, "crf", crf, 0);
			dstr_copy(&params, "log-level=error");
		} else {
			dstr_printf(&params, "log-level=error:vbv-maxrate=%d:vbv-bufsize=%d:strict-cbr=%d", bitrate,
				    bitrate, astrcmpi(rc, "CBR") == 0 ? 1 : 0);
		}
		av_opt_set(ctx->priv_data, "x265-params", params.array, 0);
		dstr_free(&params);
	} else {
		av_opt_set(ctx->priv_data, "deadline", "realtime", 0);
		av_opt_set_int(ctx->priv_data, "cpu-used", speed, 0);
		av_opt_set_int(ctx->priv_data, "row-mt", 1, 0);
		av_opt_set_int(ctx->priv_data, "tile-columns", 2, 0);
		av_opt_set_int(ctx->priv_data, "lag-in-frames", 0, 0);
		if (cqp)
			av_opt_set_int(ctx->priv_data, "crf", crf, 0);
		else if (astrcmpi(rc, "CBR") == 0) {
			ctx->rc_min_rate = ctx->rc_max_rate = bitrate * INT64_C(1000);
		}
	}

	if (cqp && enc->type == EXTRA_VP9)
		bitrate = 0; /* VP9 en modo CRF: b:v=0 */
	else if (cqp)
		bitrate = 0;

	const char *ffmpeg_opts = obs_data_get_string(settings, "ffmpeg_opts");
	ffmpeg_video_encoder_update(&enc->ffve, bitrate, keyint_sec, voi, &info, ffmpeg_opts);

	blog(LOG_INFO, "[%s] rc=%s bitrate=%d crf=%d keyint=%d preset=%s speed=%d %dx%d", enc->ffve.enc_name, rc,
	     bitrate, crf, ctx->gop_size, preset, speed, ctx->width, ctx->height);

	ctx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
	return ffmpeg_video_encoder_init_codec(&enc->ffve);
}

static void extra_destroy(void *data)
{
	struct extra_encoder *enc = data;
	ffmpeg_video_encoder_free(&enc->ffve);
	da_free(enc->header);
	bfree(enc);
}

static void on_first_packet(void *data, AVPacket *pkt, struct darray *da)
{
	struct extra_encoder *enc = data;
	AVCodecContext *ctx = enc->ffve.context;
	if (ctx->extradata_size)
		da_copy_array(enc->header, ctx->extradata, ctx->extradata_size);
	darray_copy_array(1, da, pkt->data, pkt->size);
}

static void *extra_create(obs_data_t *settings, obs_encoder_t *encoder, enum extra_type type)
{
	const char *lib = type == EXTRA_X265 ? "libx265" : "libvpx-vp9";
	const char *name = type == EXTRA_X265 ? "x265" : "VP9";
	struct extra_encoder *enc = bzalloc(sizeof(*enc));
	enc->type = type;
	if (!ffmpeg_video_encoder_init(&enc->ffve, enc, encoder, lib, NULL, name, NULL, on_first_packet))
		goto fail;
	if (!extra_update(enc, settings))
		goto fail;
	return enc;
fail:
	extra_destroy(enc);
	return NULL;
}
static void *x265_create(obs_data_t *s, obs_encoder_t *e) { return extra_create(s, e, EXTRA_X265); }
static void *vp9_create(obs_data_t *s, obs_encoder_t *e) { return extra_create(s, e, EXTRA_VP9); }

static bool extra_encode(void *data, struct encoder_frame *frame, struct encoder_packet *packet, bool *received)
{
	struct extra_encoder *enc = data;
	return ffmpeg_video_encode(&enc->ffve, frame, packet, received);
}

static void x265_defaults(obs_data_t *s)
{
	obs_data_set_default_int(s, "bitrate", 6000);
	obs_data_set_default_int(s, "keyint_sec", 2);
	obs_data_set_default_int(s, "crf", 23);
	obs_data_set_default_string(s, "rate_control", "CBR");
	obs_data_set_default_string(s, "preset", "veryfast");
}
static void vp9_defaults(obs_data_t *s)
{
	obs_data_set_default_int(s, "bitrate", 6000);
	obs_data_set_default_int(s, "keyint_sec", 2);
	obs_data_set_default_int(s, "crf", 32);
	obs_data_set_default_string(s, "rate_control", "CBR");
	obs_data_set_default_int(s, "speed", 6);
}

static bool rc_modified(obs_properties_t *ppts, obs_property_t *p, obs_data_t *settings)
{
	UNUSED_PARAMETER(p);
	bool crf = astrcmpi(obs_data_get_string(settings, "rate_control"), "CRF") == 0;
	obs_property_set_visible(obs_properties_get(ppts, "bitrate"), !crf);
	obs_property_set_visible(obs_properties_get(ppts, "crf"), crf);
	return true;
}

static obs_properties_t *extra_properties(enum extra_type type)
{
	obs_properties_t *props = obs_properties_create();
	obs_property_t *p = obs_properties_add_list(props, "rate_control", obs_module_text("RateControl"),
						    OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
	obs_property_list_add_string(p, "CBR", "CBR");
	obs_property_list_add_string(p, "VBR", "VBR");
	obs_property_list_add_string(p, "CRF", "CRF");
	obs_property_set_modified_callback(p, rc_modified);

	p = obs_properties_add_int(props, "bitrate", obs_module_text("Bitrate"), 50, 300000, 50);
	obs_property_int_set_suffix(p, " Kbps");
	obs_properties_add_int(props, "crf", "CRF", 0, 63, 1);
	p = obs_properties_add_int(props, "keyint_sec", obs_module_text("KeyframeIntervalSec"), 0, 10, 1);
	obs_property_int_set_suffix(p, " s");

	if (type == EXTRA_X265) {
		p = obs_properties_add_list(props, "preset", obs_module_text("Preset"), OBS_COMBO_TYPE_LIST,
					    OBS_COMBO_FORMAT_STRING);
		const char *presets[] = {"ultrafast", "superfast", "veryfast", "faster", "fast", "medium"};
		for (size_t i = 0; i < sizeof presets / sizeof *presets; i++)
			obs_property_list_add_string(p, presets[i], presets[i]);
	} else {
		obs_properties_add_int(props, "speed", obs_module_text("Preset"), 0, 8, 1);
	}
	obs_properties_add_text(props, "ffmpeg_opts", obs_module_text("FFmpegOpts"), OBS_TEXT_DEFAULT);
	return props;
}
static obs_properties_t *x265_properties(void *u) { UNUSED_PARAMETER(u); return extra_properties(EXTRA_X265); }
static obs_properties_t *vp9_properties(void *u) { UNUSED_PARAMETER(u); return extra_properties(EXTRA_VP9); }

static bool extra_extra_data(void *data, uint8_t **extra_data, size_t *size)
{
	struct extra_encoder *enc = data;
	*extra_data = enc->header.array;
	*size = enc->header.num;
	return true;
}

struct obs_encoder_info x265_encoder_info = {
	.id = "ffmpeg_x265", .type = OBS_ENCODER_VIDEO, .codec = "hevc",
	.get_name = x265_getname, .create = x265_create, .destroy = extra_destroy, .encode = extra_encode,
	.get_defaults = x265_defaults, .get_properties = x265_properties,
	.get_extra_data = extra_extra_data, .get_video_info = extra_video_info,
};
struct obs_encoder_info vp9_encoder_info = {
	.id = "ffmpeg_vp9", .type = OBS_ENCODER_VIDEO, .codec = "vp9",
	.get_name = vp9_getname, .create = vp9_create, .destroy = extra_destroy, .encode = extra_encode,
	.get_defaults = vp9_defaults, .get_properties = vp9_properties,
	.get_extra_data = extra_extra_data, .get_video_info = extra_video_info,
};
