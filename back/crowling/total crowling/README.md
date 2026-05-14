# Total Crowling

This folder separates crawler responsibility by data stage.

- `total.py`: collects raw pages and stores the original source material.
- `Image crowling`: refines raw pages into image metadata.
- `Media crowling`: refines raw pages into media metadata.
- `Text crowling`: refines raw pages into text metadata.

Use these commands from the repository root:

```powershell
python "back/crowling/total crowling/total.py" --limit 20
python "back/crowling/total crowling/Image crowling/cli.py"
python "back/crowling/total crowling/Media crowling/cli.py"
python "back/crowling/total crowling/Text crowling/cli.py"
```
