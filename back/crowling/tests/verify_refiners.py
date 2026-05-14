from __future__ import annotations

import tempfile
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowling.crowling_core.extractors import RawPage, extract_images, extract_media, extract_text
from crowling.crowling_core.storage import CrawlingStore


SAMPLE_HTML = """
<html>
  <head>
    <title>Battle Archive Sample</title>
    <meta property="og:image" content="/images/og-battle.webp">
  </head>
  <body>
    <article>
      <h1>Battle Archive Sample</h1>
      <figure>
        <img src="/images/tank.jpg"
             srcset="/images/tank-small.jpg 480w, /images/tank-large.jpg 1200w"
             alt="Tank column"
             width="1200"
             height="800">
        <figcaption>Armored column on a field road.</figcaption>
      </figure>
      <p>This archive page explains a historical battlefield movement with enough detail for text extraction.</p>
      <p>The second sentence gives the text cleaner more than one sentence to split.</p>
      <video controls src="/media/battle.mp4"></video>
      <audio src="/media/radio.ogg"></audio>
      <a href="/docs/order.pdf">operation order</a>
      <iframe src="https://www.youtube.com/embed/example"></iframe>
    </article>
  </body>
</html>
"""


def main() -> None:
    page = RawPage(
        source_name="sample",
        source_url="https://example.test/archive/battle",
        final_url="https://example.test/archive/battle",
        title="Battle Archive Sample",
        html=SAMPLE_HTML,
        fetched_at="2026-05-14T00:00:00+00:00",
    )
    images = extract_images(page)
    media = extract_media(page)
    text = extract_text(page)

    assert len(images) == 4, images
    assert any(item.alt == "Tank column" for item in images)
    assert len(media) == 4, media
    assert {item.kind for item in media} == {"audio", "document", "embed", "video"}
    assert len(text.sentences) == 2, text.sentences

    with tempfile.TemporaryDirectory() as tmp:
        store = CrawlingStore(Path(tmp) / "verify.sqlite3")
        store.init_db()
        store.save_raw_page(page)
        assert store.save_images(images) == 4
        assert store.save_media(media) == 4
        assert store.save_texts([text]) == 1

    print({"images": len(images), "media": len(media), "sentences": len(text.sentences)})


if __name__ == "__main__":
    main()
