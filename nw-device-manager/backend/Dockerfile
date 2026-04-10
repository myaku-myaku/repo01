FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
COPY app/ app/

RUN pip install --no-cache-dir .

COPY alembic.ini .
COPY alembic/ alembic/

ENV PYTHONPATH=/app

CMD ["sh", "-c", "python -m app.init_db && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
