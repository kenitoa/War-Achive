# Reconstructure

`reconstructure` converts refined crawling output into the public JSON formats served from `NAS/data`.

Input source:

- `text_assets`
- `image_assets`
- `media_assets`

These tables are read from the crawling SQLite database and joined by `page_url`.

Output targets are selected automatically:

- `data/war overview data`
- `data/biography of people data`
- `data/weapons and equipment data/<subcategory>`
- `data/strategy and tactics data`
- `data/Historical Sources & Documents data`
- `data/Battlefield Map data`
- `data/Undefine facts data/<shelf>`

Run from the repository root:

```powershell
python "back/crowling/reconstructure/cli.py" --database back/crowling/data/raw-crawling.sqlite3 --front-data data
```

Existing JSON files are not overwritten unless `--overwrite` is passed.

When a reconstructed item matches an existing front JSON title, id, or file name, it updates that existing file instead of creating a duplicate. The merge keeps existing non-empty fields, fills empty fields, and appends new list items such as tags or references.

Examples that resolve to the same existing item include:

- `한국전쟁`
- `한국 전쟁`
- `Korean War`
- `korean-war.json`
