"""Herramientas MCP de música para video-nube: biblioteca, recomendación, aprendizaje y montaje."""
import json


def registrar(mcp, _error):
    import musica_local as M

    def _ok(datos):
        return json.dumps(datos, ensure_ascii=False)

    def _rutas(entradas):
        import vision_local as vl
        return [vl.resolver(e) for e in entradas]

    @mcp.tool
    def agregar_musica(archivos: list[str]):
        """Agrega canciones a tu biblioteca musical (se guarda en el repo, en musica/, y sirve para siempre). Acepta rutas de archivos adjuntos, `subida:<id>`, URLs directas o enlaces de Google Drive compartidos. De cada canción mide BPM y pulsos, tonalidad, curva de energía, clímax/subida, si tiene voces, ánimo y género (zero-shot), y su huella de sonido. Tarda ~15 s por canción la primera vez."""
        try:
            return _ok(M.agregar_canciones(_rutas(archivos)))
        except Exception as e:
            raise _error(e)

    @mcp.tool
    def ver_biblioteca_musical(filtro: str = ""):
        """Lista las canciones de la biblioteca (id, nombre, BPM, tonalidad, ánimo, género, voces, duración) y cuántas calificaciones y ejemplos se han aprendido. filtro: texto para buscar por nombre, ánimo o género."""
        bib = M.biblioteca()["canciones"]
        f = filtro.lower().strip()
        lista = [{"id": k, "nombre": c["nombre"], "bpm": c["bpm"], "tonalidad": c["tonalidad"], "duracion": c["duracion"],
                  "animo": c["animo"][:2], "genero": c["genero"][:2], "voces": c["voces"]}
                 for k, c in bib.items()
                 if not f or f in json.dumps([c["nombre"], c["animo"], c["genero"]], ensure_ascii=False).lower()]
        g = M._leer(M.GUSTOS, {"calificaciones": []})["calificaciones"]
        ej = M._leer(M.EJEMPLOS, {"ejemplos": []})["ejemplos"]
        return _ok({"canciones": lista, "total": len(bib), "calificaciones": len(g), "ejemplos": len(ej)})

    @mcp.tool
    def recomendar_musica(video_path: str, descripcion: str = "", top: int = 5):
        """Qué canción de tu biblioteca le queda mejor al video. `descripcion`: cómo debe sonar, EN INGLÉS (va a un modelo texto→audio), p. ej. "funny playful quirky music" o "epic cinematic build up"; si va vacía se deduce del ambiente visual. Devuelve el perfil del video (cortes, BPM que pide, movimiento, clímax, voz, ambiente), un `perfil_ideal` en texto (sirve para buscar canciones en TikTok/Reels) y el ranking con puntuación, desde qué segundo empezar cada canción y las razones (ánimo, tempo, clímax alineado, pulsos sobre los cortes, voces, y tu gusto aprendido)."""
        try:
            return _ok(M.recomendar(video_path, descripcion, top))
        except Exception as e:
            raise _error(e)

    @mcp.tool
    def montar_musica(video_path: str, cancion_id: str, inicio: float = -1, volumen_db: float = 0):
        """Monta la canción en el video y devuelve la ruta del MP4: empieza en `inicio` segundos de la canción (-1 = el mejor punto automático), fundido de entrada/salida, baja la música bajo la voz (ducking) si el video es hablado y normaliza a -14 LUFS (redes). volumen_db: 0 = automático (-16 dB con voz, -6 dB sin voz)."""
        try:
            return _ok(M.montar(video_path, cancion_id, None if inicio < 0 else inicio, volumen_db or None))
        except Exception as e:
            raise _error(e)

    @mcp.tool
    def calificar_musica(video_path: str, cancion_id: str, me_gusta: bool, comentario: str = ""):
        """Enseña tu gusto: 👍 (me_gusta=true) o 👎 a una canción sugerida para un video. Las siguientes recomendaciones se ajustan (pesa más cuantas más calificaciones haya)."""
        try:
            return _ok(M.calificar(video_path, cancion_id, me_gusta, comentario))
        except Exception as e:
            raise _error(e)

    @mcp.tool
    def aprender_de_video(video_path: str, nota: str = "", viral: bool = False, mio: bool = True, cancion_id: str = ""):
        """Enseña con un ejemplo: un video ya editado (tuyo o viral) con su música. Guarda cómo se ve y cómo suena su música; en videos parecidos se preferirá música parecida (los virales pesan 1,5x). Si la canción está en la biblioteca, pasa su cancion_id para mayor precisión; si no, se usa el audio del propio video."""
        try:
            return _ok(M.aprender_ejemplo(video_path, nota, viral, mio, cancion_id or None))
        except Exception as e:
            raise _error(e)
