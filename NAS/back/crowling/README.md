# War Archive Crowling

`crowling_core` is the executable crawler package.

- `total`: fetches raw HTML pages and stores the original page material.
- `image`: extracts and normalizes image URLs, captions, alt text, dimensions, extensions, and fingerprints.
- `media`: extracts video, audio, document, and embedded media references.
- `text`: extracts readable article text, HTML paragraphs, and sentence counts.

Run from `back`:

```powershell
python -m crowling.cli init
python -m crowling.cli total --limit 5
python -m crowling.cli publish --limit 5
python -m crowling.cli index
python -m crowling.cli daemon
python -m crowling.cli image
python -m crowling.cli media
python -m crowling.cli text
```

`daemon` is the production path used by Docker. It crawls up to
`CRAWLING_HOURLY_LIMIT` pages per cycle, publishes pending refined records into
`CRAWLING_FRONT_DATA_PATH`, and regenerates `front/data/search/*.json`.

Default Docker settings:

- `CRAWLING_HOURLY_LIMIT=5`
- `CRAWLING_DAEMON_INTERVAL_SECONDS=3600`
- `CRAWLING_FRONT_DATA_PATH=/app/front/data`

The folder names under `total crowling` are compatibility entry points for each refinement type.
