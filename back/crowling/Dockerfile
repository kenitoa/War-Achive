FROM python:3.12-slim

WORKDIR /app
COPY back/crowling/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY back/crowling /app/crowling

CMD ["python", "-m", "crowling.cli", "daemon"]
