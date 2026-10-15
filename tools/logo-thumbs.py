#!/usr/bin/env python3
"""Small copies of the client logos for the places that show them small.

The home page wall and practice cards, and the case-studies logo wall, draw
logos at most about 125x56 / 160x88 CSS px, but the full files are sized for
the 300x128 detail-page figure. Each raster logo named in
data/case-studies.json gets assets/case-studies/logos/thumbs/<stem>.webp,
fitted to THUMB_BOX (2x the largest small slot). The home wall script swaps
in the thumb by that naming rule and falls back to the full logo when a
thumb is missing, so a logo added through the console still shows.

Re-run after adding or replacing a logo the home page or the case-studies
wall uses; check-ui-contract.py flags missing thumbs. Needs Pillow.
"""
from __future__ import annotations

import io
import json
import math
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
THUMBS = ROOT / "assets/case-studies/logos/thumbs"
THUMB_BOX = (320, 176)
MIN_PSNR = 38.0  # dB over white and black; at thumb size 38+ is indistinguishable


def thumb_path(logo: str) -> str:
    """Site path of a logo's thumb (the rule the home wall script also uses)."""
    stem = logo.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return f"assets/case-studies/logos/thumbs/{stem}.webp"


def _psnr(a: Image.Image, b: Image.Image) -> float:
    from PIL import Image, ImageChops, ImageStat

    worst = 99.0
    for bg in ((255, 255, 255, 255), (0, 0, 0, 255)):
        x = Image.alpha_composite(Image.new("RGBA", a.size, bg), a).convert("RGB")
        y = Image.alpha_composite(Image.new("RGBA", b.size, bg), b).convert("RGB")
        mse = sum(v * v for v in ImageStat.Stat(ImageChops.difference(x, y)).rms) / 3
        worst = min(worst, 99.0 if mse == 0 else 10 * math.log10(255 ** 2 / mse))
    return worst


def _encode(im: Image.Image) -> bytes:
    """Smallest WebP that stays visually identical to im."""
    from PIL import Image

    candidates = []
    for quality in (85, 90, 95):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=quality, method=6, alpha_quality=100)
        if _psnr(im, Image.open(io.BytesIO(buf.getvalue())).convert("RGBA")) >= MIN_PSNR:
            candidates.append(buf.getvalue())
            break
    buf = io.BytesIO()
    im.save(buf, "WEBP", lossless=True, quality=100, method=6)
    candidates.append(buf.getvalue())
    return min(candidates, key=len)


def make_thumb(source: Path) -> bytes:
    from PIL import Image  # only the generator needs Pillow; the UI contract imports thumb_path

    with Image.open(source) as opened:
        im = opened.convert("RGBA")
    w, h = im.size
    scale = min(1.0, THUMB_BOX[0] / w, THUMB_BOX[1] / h)
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return _encode(im)


def raster_logos() -> list[str]:
    cases = json.loads((ROOT / "data/case-studies.json").read_text(encoding="utf-8"))
    logos = {c["logo"] for c in cases if isinstance(c.get("logo"), str) and c["logo"].endswith((".webp", ".png", ".jpg", ".jpeg"))}
    return sorted(logos)


def main() -> int:
    THUMBS.mkdir(parents=True, exist_ok=True)
    seen: dict[str, str] = {}
    written = 0
    for logo in raster_logos():
        target = ROOT / thumb_path(logo)
        if target.name in seen:
            raise SystemExit(f"{logo} and {seen[target.name]} would share the thumb {target.name}; rename one")
        seen[target.name] = logo
        source = ROOT / logo
        if not source.is_file():
            raise SystemExit(f"{logo} is named in data/case-studies.json but missing")
        if target.exists():
            continue  # thumbs are immutable once published; a new logo has a new name
        data = make_thumb(source)
        # A noisy logo can come out no smaller: then the full WebP serves as its thumb.
        if source.suffix == ".webp" and len(data) >= source.stat().st_size:
            data = source.read_bytes()
        target.write_bytes(data)
        written += 1
    print(f"{written} thumb(s) written, {len(seen)} logos covered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
