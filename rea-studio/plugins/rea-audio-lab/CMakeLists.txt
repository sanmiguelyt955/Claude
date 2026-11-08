cmake_minimum_required(VERSION 3.22)
project(rea-audio-lab C)
find_package(libobs REQUIRED)
add_library(rea-audio-lab MODULE rea-audio-lab.c rea_dsp.h)
target_link_libraries(rea-audio-lab PRIVATE OBS::libobs)
set_target_properties(rea-audio-lab PROPERTIES PREFIX "")
# Prueba del nucleo DSP sin OBS:  gcc -O2 test_dsp.c -lm -o test_dsp && ./test_dsp
