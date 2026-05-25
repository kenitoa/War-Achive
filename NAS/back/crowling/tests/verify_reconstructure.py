from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowling.crowling_core.extractors import ImageAsset, RawPage, extract_text
from crowling.crowling_core.storage import CrawlingStore
from crowling.reconstructure.converter import ReconstructureRunner


def main() -> None:
    html = """
    <article>
      <h1>T-34 Tank Weapon Record</h1>
      <p>The T-34 tank was an armored weapon used during World War II.</p>
      <p>Its sloped armor and diesel engine made it an important battlefield vehicle.</p>
    </article>
    """
    page = RawPage(
        source_name="sample",
        source_url="https://example.test/t34",
        final_url="https://example.test/t34",
        title="T-34 Tank Weapon Record",
        html=html,
        fetched_at="2026-05-14T00:00:00+00:00",
    )
    text = extract_text(page)
    image = ImageAsset(
        source_url="https://example.test/t34.jpg",
        page_url=page.final_url,
        title=page.title,
        alt="T-34",
        caption="T-34 tank",
        width=800,
        height=600,
        extension=".jpg",
        fingerprint="image-test",
    )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "crawl.sqlite3"
        front_data = tmp_path / "front" / "data"
        store = CrawlingStore(db_path)
        store.init_db()
        store.save_raw_page(page)
        store.save_texts([text])
        store.save_images([image])

        result = ReconstructureRunner(db_path, front_data).run()
        assert len(result.written) == 1, result
        output = Path(result.written[0])
        assert output.parts[-3:] == ("weapons and equipment data", "armor", output.name), output
        data = json.loads(output.read_text(encoding="utf-8"))
        assert data["category"] == "armor", data
        assert data["image"] == image.source_url, data

    print({"written": 1, "category": "weapons and equipment data/armor"})

    verify_existing_file_merge()


def verify_existing_file_merge() -> None:
    html = """
    <article>
      <h1>Korean War</h1>
      <p>The Korean War was a major Cold War conflict on the Korean Peninsula.</p>
      <p>This extra paragraph should be merged into an existing front data file instead of creating a new one.</p>
    </article>
    """
    page = RawPage(
        source_name="sample",
        source_url="https://example.test/korean-war",
        final_url="https://example.test/korean-war",
        title="Korean War",
        html=html,
        fetched_at="2026-05-14T00:00:00+00:00",
    )
    text = extract_text(page)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "crawl.sqlite3"
        front_data = tmp_path / "front" / "data"
        war_dir = front_data / "war overview data"
        war_dir.mkdir(parents=True)
        existing_path = war_dir / "korean war.json"
        existing_path.write_text(
            json.dumps(
                {
                    "id": "korean-war",
                    "name": "한국전쟁",
                    "summary": "Existing summary stays.",
                    "tags": ["기존"],
                    "detail": {"background": "", "references": []},
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        store = CrawlingStore(db_path)
        store.init_db()
        store.save_raw_page(page)
        store.save_texts([text])

        result = ReconstructureRunner(db_path, front_data).run()
        assert result.written == [str(existing_path)], result
        assert len(list(war_dir.glob("*.json"))) == 1
        data = json.loads(existing_path.read_text(encoding="utf-8"))
        assert data["summary"] == "Existing summary stays.", data
        assert data["detail"]["background"], data
        assert "기존" in data["tags"], data
        assert len(data["tags"]) > 1, data

    print({"merged": "war overview data/korean war.json"})


if __name__ == "__main__":
    main()
