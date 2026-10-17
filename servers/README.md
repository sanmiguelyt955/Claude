# Servers

Small HTTP services (FastAPI), each deployable on its own.

## Live services

| Service | Path | URL | Host |
|---|---|---|---|
| gcp-analysis | `gcp-analysis/` | https://gcp-analysis-zbfz.onrender.com | Render (free plan) |

Endpoints of `gcp-analysis`: `/health`, `/services`, `/services/{name}`, `/edges`, `/graph.png`. Interactive docs at `/docs`.

The free plan sleeps after 15 minutes without traffic. The first request after that can take up to about a minute.

## Layout

- `template/`: skeleton for a new service (`main.py`, `Dockerfile`, `requirements.txt`).
- `new-service.sh <name>`: creates `services/<name>` from the template.
- `services/`: services created with the script.
- `deploy.sh <service-dir>`: deploys a service to Cloud Run with `gcloud`. Needs `GCP_PROJECT`. Private by default, `--public` allows unauthenticated access, `--dry-run` prints the command.
- `https-selfsigned.sh [dir] [host] [days]`: creates a self-signed certificate for private or local use.
- `../render.yaml`: Render Blueprint for `gcp-analysis`.

## Run locally

```bash
cd gcp-analysis
pip install -r requirements.txt
uvicorn server:app --reload --port 8080
```

## Deploy on Render

Render reads `render.yaml` at the repository root. Create a Blueprint from `sanmiguelyt955/Claude` on the branch you want to deploy. Each push to that branch redeploys the service (`autoDeploy: true`). When the PR is merged, change the branch of the Blueprint to `main`.

## Deploy on Cloud Run

Requires a Google Cloud project with billing enabled.

```bash
GCP_PROJECT=your-project-id servers/deploy.sh ../gcp-analysis --region us-central1
```

## HTTPS without external dependencies

```bash
servers/https-selfsigned.sh ./tls localhost 30
uvicorn main:app --port 8443 --ssl-keyfile ./tls/key.pem --ssl-certfile ./tls/cert.pem
```

Clients must trust `tls/cert.pem` explicitly (for example `curl --cacert tls/cert.pem`). Browsers and other clients reject self-signed certificates by default. For a public certificate, use Render or Cloud Run, which provide HTTPS automatically, or Let's Encrypt with a domain you control.
