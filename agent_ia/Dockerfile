FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN useradd --system --uid 10001 --create-home appuser

# Le verrou porte la fermeture complète des dépendances : `--no-deps` garantit que l'image
# contient exactement l'inventaire déclaré dans docs/sbom/agent_ia.cdx.json, ni plus, ni moins.
COPY requirements.lock .
RUN pip install --no-cache-dir --no-deps -r requirements.lock

COPY schemas /app/schemas
COPY src /app/src

USER appuser

EXPOSE 8000

WORKDIR /app/src

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
