# Imagen para publicar el editor: Node.js + FFmpeg (ffmpeg y ffprobe).
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    VE_DATA_DIR=/data

COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public

# Medios, proyectos y exportaciones. En la nube conviene montar un disco persistente aquí.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8080
CMD ["node", "server.js"]
