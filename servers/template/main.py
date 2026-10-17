"""__SERVICE__ — HTTP service generated from servers/template.

Run locally from this folder:
    uvicorn main:app --reload --port 8080
"""

from fastapi import FastAPI

SERVICE = "__SERVICE__"

app = FastAPI(title=SERVICE, version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": SERVICE}


@app.get("/")
def root():
    return {"service": SERVICE, "docs": "/docs"}
