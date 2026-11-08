/* Prueba del nucleo DSP con senales sinteticas: gcc -O2 test_dsp.c -lm -o test_dsp && ./test_dsp */
#include <stdio.h>
#include <stdlib.h>
#include "rea_dsp.h"
#define FS 48000
#define N (FS)
static float rms_db(const float *x, int a, int b){double s=0;for(int i=a;i<b;i++)s+=x[i]*x[i];return 20*log10(sqrt(s/(b-a))+1e-12);}
static void tone(float *x,float f,float amp){for(int i=0;i<N;i++)x[i]=amp*sinf(2*M_PI*f*i/FS);}
static int fails=0;
#define CHECK(c,msg,...) do{int ok=(c);printf("%s "msg"\n",ok?"OK  ":"FALLA",__VA_ARGS__);if(!ok)fails++;}while(0)
int main(void){
 static float x[N]; rea_chain c;
 /* 1) pasa-altos: 30 Hz debe caer, 1 kHz no */
 rea_chain_defaults(&c,FS); c.deess_db=0; c.comp_ratio=1; c.comp_thr=0; c.lim_db=0; c.hp_hz=100; rea_chain_update(&c);
 tone(x,30,0.5f); rea_chain_process(&c,x,N); float lo=rms_db(x,N/2,N);
 rea_chain_defaults(&c,FS); c.deess_db=0; c.comp_ratio=1; c.comp_thr=0; c.lim_db=0; c.hp_hz=100; rea_chain_update(&c);
 tone(x,1000,0.5f); rea_chain_process(&c,x,N); float mid=rms_db(x,N/2,N);
 CHECK(lo<mid-12,"pasa-altos: 30Hz=%.1f dB vs 1kHz=%.1f dB",lo,mid);
 /* 2) EQ: +9 dB en 3 kHz */
 rea_chain_defaults(&c,FS); c.deess_db=0; c.comp_ratio=1; c.comp_thr=0; c.lim_db=0; c.hp_hz=0; c.eq_g[2]=9; rea_chain_update(&c);
 tone(x,3000,0.1f); float ent=rms_db(x,N/2,N); rea_chain_process(&c,x,N); float sal=rms_db(x,N/2,N);
 CHECK(fabsf((sal-ent)-9)<1.0f,"EQ +9dB a 3kHz: ganancia medida=%.2f dB",sal-ent);
 /* 3) de-esser: 6.5 kHz fuerte baja, 300 Hz no */
 rea_chain_defaults(&c,FS); c.hp_hz=0; c.comp_ratio=1; c.comp_thr=0; c.lim_db=0; c.deess_db=10; c.deess_thr=-30; rea_chain_update(&c);
 tone(x,6500,0.3f); ent=rms_db(x,N/2,N); rea_chain_process(&c,x,N); sal=rms_db(x,N/2,N);
 float red=ent-sal;
 rea_chain_defaults(&c,FS); c.hp_hz=0; c.comp_ratio=1; c.comp_thr=0; c.lim_db=0; c.deess_db=10; c.deess_thr=-30; rea_chain_update(&c);
 tone(x,300,0.3f); ent=rms_db(x,N/2,N); rea_chain_process(&c,x,N); sal=rms_db(x,N/2,N);
 CHECK(red>6 && (ent-sal)<1,"de-esser: eses -%.1f dB, grave -%.1f dB",red,ent-sal);
 /* 4) compresor: 6 dB sobre umbral con ratio 3 => ~4 dB de reduccion */
 rea_chain_defaults(&c,FS); c.hp_hz=0; c.deess_db=0; c.lim_db=0; c.comp_thr=-20; c.comp_ratio=3; rea_chain_update(&c);
 tone(x,1000,0.2f*1.4142f*1.0f); /* pico ~-11 dBFS => ~ -14 rms */
 float amp=0.28284f; tone(x,1000,amp); ent=rms_db(x,N/2,N); rea_chain_process(&c,x,N); sal=rms_db(x,N/2,N);
 CHECK((ent-sal)>2.0f && (ent-sal)<8.0f,"compresor: reduccion=%.1f dB",ent-sal);
 /* 5) limitador: nunca supera el techo */
 rea_chain_defaults(&c,FS); c.hp_hz=0; c.deess_db=0; c.comp_ratio=1; c.comp_thr=0; c.lim_db=-6; c.makeup_db=12; rea_chain_update(&c);
 tone(x,500,0.9f); rea_chain_process(&c,x,N); float pk=0;for(int i=0;i<N;i++)if(fabsf(x[i])>pk)pk=fabsf(x[i]);
 CHECK(pk<=rea_db2lin(-6)+1e-4f,"limitador: pico=%.3f (techo %.3f)",pk,rea_db2lin(-6));
 printf(fails?"\n%d pruebas fallaron\n":"\nTodo bien\n",fails); return fails!=0;}
