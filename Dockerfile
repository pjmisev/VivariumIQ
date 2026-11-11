FROM ghcr.io/astral-sh/uv:latest AS uv

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

COPY --from=uv /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "fastapi", "run", "main.py", "--host", "0.0.0.0", "--port", "8000"]