"""Búsqueda de canciones en YouTube Music (solo metadatos, sin descarga de audio).

Uso:
    from ytmusic_search import search_tracks, SearchError

    for t in search_tracks("Bohemian Rhapsody"):
        print(t["title"], t["artist"], t["videoId"], t["duration"])

La búsqueda funciona sin cuenta. Si quieres buscar autenticado (por ejemplo
para obtener resultados de tu región o de tu cuenta), define la variable de
entorno YTMUSIC_AUTH_FILE con la ruta a un archivo de cabeceras generado con
`ytmusicapi browser`. El módulo nunca guarda ni incluye credenciales.
"""

from __future__ import annotations

import os
import threading
from typing import Any

import requests
from ytmusicapi import YTMusic
from ytmusicapi.exceptions import YTMusicError, YTMusicServerError, YTMusicUserError

__all__ = ["search_tracks", "SearchError", "AuthError", "NetworkError"]

AUTH_ENV_VAR = "YTMUSIC_AUTH_FILE"
DEFAULT_LIMIT = 20
TIMEOUT_SECONDS = 15


class SearchError(Exception):
    """Error genérico de búsqueda. Base de AuthError y NetworkError."""


class AuthError(SearchError):
    """Las credenciales configuradas faltan, no son válidas o han caducado."""


class NetworkError(SearchError):
    """No se pudo contactar con YouTube Music."""


_client: YTMusic | None = None
_client_lock = threading.Lock()


class _TimeoutSession(requests.Session):
    """Sesión de requests con un timeout por defecto, para no colgarse sin red."""

    def request(self, *args: Any, **kwargs: Any) -> requests.Response:
        kwargs.setdefault("timeout", TIMEOUT_SECONDS)
        return super().request(*args, **kwargs)


def _get_client() -> YTMusic:
    global _client
    with _client_lock:
        if _client is None:
            auth_file = os.environ.get(AUTH_ENV_VAR, "").strip() or None
            if auth_file and not os.path.isfile(auth_file):
                raise AuthError(
                    f"{AUTH_ENV_VAR} apunta a '{auth_file}', pero ese archivo no existe. "
                    "Genera uno con `ytmusicapi browser` o quita la variable para buscar sin cuenta."
                )
            try:
                _client = YTMusic(auth=auth_file, requests_session=_TimeoutSession())
            except (YTMusicUserError, ValueError, KeyError) as exc:
                raise AuthError(
                    f"El archivo de autenticación '{auth_file}' no es válido ({exc}). "
                    "Vuelve a generarlo con `ytmusicapi browser`."
                ) from exc
            except requests.exceptions.RequestException as exc:
                raise NetworkError(_network_message(exc)) from exc
        return _client


def _network_message(exc: Exception) -> str:
    if isinstance(exc, requests.exceptions.Timeout):
        return f"YouTube Music no respondió en {TIMEOUT_SECONDS} s. Revisa tu conexión e inténtalo de nuevo."
    return f"No se pudo conectar con YouTube Music. Revisa tu conexión a internet. Detalle: {exc}"


def _to_track(item: dict[str, Any]) -> dict[str, Any] | None:
    video_id = item.get("videoId")
    title = item.get("title")
    if not video_id or not title:
        return None
    artists = [a.get("name") for a in item.get("artists") or [] if a.get("name")]
    return {
        "title": title,
        "artist": ", ".join(artists),
        "videoId": video_id,
        "duration": item.get("duration") or "",            # "3:45"
        "duration_seconds": item.get("duration_seconds"),  # 225, o None si no viene
    }


def _search(client: YTMusic, query: str, kind: str, limit: int) -> list[dict[str, Any]]:
    try:
        return client.search(query, filter=kind, limit=limit)
    except YTMusicServerError as exc:
        text = str(exc)
        if any(code in text for code in ("401", "403")):
            raise AuthError(
                "YouTube Music rechazó la autenticación. Tus cookies pueden haber caducado: "
                f"vuelve a generar el archivo de {AUTH_ENV_VAR} con `ytmusicapi browser`, "
                "o quita la variable para buscar sin cuenta."
            ) from exc
        raise SearchError(f"YouTube Music devolvió un error: {text}") from exc
    except requests.exceptions.RequestException as exc:
        raise NetworkError(_network_message(exc)) from exc
    except YTMusicError as exc:
        raise SearchError(f"Error de ytmusicapi: {exc}") from exc


def search_tracks(query: str, limit: int = DEFAULT_LIMIT) -> list[dict[str, Any]]:
    """Busca canciones en YouTube Music y devuelve sus metadatos.

    Cada resultado es un dict con: title, artist, videoId, duration ("m:ss")
    y duration_seconds. Devuelve [] si no hay coincidencias.

    Lanza AuthError, NetworkError o SearchError (todas heredan de SearchError).
    """
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query debe ser un texto no vacío (nombre de canción o artista).")
    if limit < 1:
        raise ValueError("limit debe ser 1 o mayor.")

    client = _get_client()
    query = query.strip()
    tracks: list[dict[str, Any]] = []
    seen: set[str] = set()

    # Primero canciones; si YouTube Music devuelve pocas (pasa según la región),
    # se completa con vídeos musicales.
    for kind in ("songs", "videos"):
        if len(tracks) >= limit:
            break
        for item in _search(client, query, kind, limit):
            track = _to_track(item)
            if track and track["videoId"] not in seen:
                seen.add(track["videoId"])
                tracks.append(track)
                if len(tracks) >= limit:
                    break
    return tracks


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "Bohemian Rhapsody"
    try:
        for t in search_tracks(q, limit=10):
            print(f"{t['duration']:>6}  {t['title']} — {t['artist']}  [{t['videoId']}]")
    except SearchError as e:
        sys.exit(f"Error: {e}")
