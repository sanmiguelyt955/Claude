FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-nube.txt .
RUN pip install --no-cache-dir -r requirements-nube.txt

# Descarga los modelos durante la construcción para que la primera conversión no espere.
ENV HF_HOME=/modelos
ARG MODELOS_PREVIOS="base small"
RUN for m in $MODELOS_PREVIOS; do python -c "from faster_whisper import WhisperModel as W; W('$m', device='cpu', compute_type='int8')"; done \
 && chmod -R a+rwX /modelos

COPY convertidor.py app_web.py ./
COPY templates ./templates
COPY static ./static
RUN mkdir -p /datos/salidas && chmod -R a+rwX /datos

# Memoria medida: pico de ~1,4 GB con "small" y ~600 MB con "base".
# No cabe en servidores de 512 MB como el plan gratuito o Starter de Render.
ENV CANCION_MODELOS=base,small \
    CANCION_MODELO_DEFECTO=small \
    CANCION_MAX_MB=300 \
    CANCION_MAX_TRABAJOS=1 \
    CANCION_SALIDAS=/datos/salidas \
    HOME=/tmp \
    PORT=10000

# Un solo proceso (los trabajos viven en memoria) con varios hilos para atender peticiones.
CMD gunicorn -w 1 --threads 4 -t 300 -b 0.0.0.0:${PORT} app_web:app
