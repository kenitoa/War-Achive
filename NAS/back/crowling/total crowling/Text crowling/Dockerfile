FROM python:3.12-slim

WORKDIR /app/back

ENV PYTHONUNBUFFERED=1
ENV CRAWLING_DATABASE_PATH=/app/data/articles.sqlite3
ENV CRAWLING_TARGET_SITES_PATH=/app/data/target-sites.json
ENV CRAWLING_FRONT_DATA_PATH=/app/front/data
ENV CRAWLING_HOURLY_LIMIT=50
ENV CRAWLING_DAEMON_INTERVAL_SECONDS=300

COPY back/crowling/requirements.txt ./crowling/requirements.txt
RUN pip install --no-cache-dir -r ./crowling/requirements.txt

COPY back/crowling ./crowling

CMD ["python", "-m", "crowling.cli", "daemon", "--hourly-limit", "50"]
