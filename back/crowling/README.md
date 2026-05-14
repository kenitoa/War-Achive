# War Archive Crowling

`crowling_core` is the executable crawler package.

- `total`: fetches raw HTML pages and stores the original page material.
- `image`: extracts and normalizes image URLs, captions, alt text, dimensions, extensions, and fingerprints.
- `media`: extracts video, audio, document, and embedded media references.
- `text`: extracts readable article text, HTML paragraphs, and sentence counts.

Run from `back`:

```powershell
python -m crowling.cli init
python -m crowling.cli total --limit 20
python -m crowling.cli image
python -m crowling.cli media
python -m crowling.cli text
```

The folder names under `total crowling` are compatibility entry points for each refinement type.
