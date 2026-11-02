FROM postgres:18.6-alpine
RUN apk add --no-cache python3 py3-pip && python3 -m venv /venv
ENV PATH="/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app /app/app
COPY migrations /app/migrations
COPY alembic.ini /app/alembic.ini
USER 10001:10001
ENTRYPOINT []
CMD ["uvicorn", "app.notebook_main:application", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
