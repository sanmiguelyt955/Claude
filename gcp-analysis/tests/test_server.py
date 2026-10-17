"""Tests for the gcp-analysis HTTP server.

Run from the gcp-analysis folder:
    python -m pytest -q
"""

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def test_health_reports_service_count():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    # Count must match the catalog the server exposes, not a hard-coded number.
    assert body["services"] == len(client.get("/services").json())
    assert body["services"] > 0


def test_services_lists_only_valid_entries():
    r = client.get("/services")
    assert r.status_code == 200
    services = r.json()
    assert "compute" in services
    assert all("error" not in info for info in services.values())


def test_service_detail_includes_dependencies():
    r = client.get("/services/compute")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "compute"
    assert body["stats"]["title"] == "Compute Engine API"
    assert body["depends_on"], "compute should mention at least one other service"
    counts = [d["mentions"] for d in body["depends_on"]]
    assert counts == sorted(counts, reverse=True)


def test_unknown_service_returns_404():
    r = client.get("/services/does-not-exist")
    assert r.status_code == 404


def test_edges_filters_by_threshold_and_control_plane():
    r = client.get("/edges?min_mentions=100&include_control_plane=false")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == len(body["edges"]) >= 1
    for edge in body["edges"]:
        assert edge["mentions"] >= 100
        assert edge["target_is_control_plane"] is False


def test_edges_rejects_invalid_limit():
    r = client.get("/edges?limit=0")
    assert r.status_code == 422


def test_graph_png_is_served():
    r = client.get("/graph.png")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content.startswith(PNG_SIGNATURE)
