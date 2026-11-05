# Space de Hugging Face (sdk: docker): servidor MCP "video-nube" por HTTP en el puerto 7860.
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
WORKDIR /app

COPY requirements-nube.txt .
RUN pip install --no-cache-dir torch==2.15.0 torchaudio torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements-nube.txt

COPY --chown=user . .
RUN mkdir -p /app/datos && chown -R user:user /app
USER user
ENV HOME=/home/user \
    HF_HOME=/home/user/.cache/huggingface \
    PORT=7860 \
    PRECARGAR_MODELOS=1 \
    PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["python", "servidor_nube.py", "--http"]
