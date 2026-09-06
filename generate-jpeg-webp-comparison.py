#!/usr/bin/env python3
"""Generate a temporary side-by-side JPEG/WebP comparison page."""

from __future__ import annotations

from collections.abc import Iterable
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parent
JPEG_ROOT = ROOT / "images" / "jpeg"
WEBP_ROOT = ROOT / "images" / "webp"
OUTPUT = ROOT / "jpeg-webp-comparison.html"


def collect_images(folder: Path, extensions: set[str]) -> dict[str, Path]:
    images: dict[str, Path] = {}
    for path in folder.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in extensions:
            continue
        key = path.relative_to(folder).with_suffix("").as_posix()
        if key in images:
            raise RuntimeError(f"Two files have the same comparison key: {key}")
        images[key] = path
    return images


def image_cell(path: Path | None, side: str) -> str:
    if path is None:
        return f'<div class="image-cell missing"><span>No {side} image</span></div>'

    relative_path = path.relative_to(ROOT).as_posix()
    return (
        '<div class="image-cell">'
        f'<img src="{escape(relative_path)}" loading="lazy" decoding="async" '
        f'alt="{escape(relative_path)}">'
        f'<code>{escape(relative_path)}</code>'
        '</div>'
    )


def rows(keys: Iterable[str], jpeg_images: dict[str, Path], webp_images: dict[str, Path]) -> str:
    result: list[str] = []
    for key in keys:
        result.append(
            '<section class="comparison-row">'
            f'<h2>{escape(key)}</h2>'
            '<div class="comparison-grid">'
            f'{image_cell(jpeg_images.get(key), "JPEG")}'
            f'{image_cell(webp_images.get(key), "WebP")}'
            '</div>'
            '</section>'
        )
    return '\n'.join(result)


def main() -> None:
    jpeg_images = collect_images(JPEG_ROOT, {".jpg", ".jpeg"})
    webp_images = collect_images(WEBP_ROOT, {".webp"})
    keys = sorted(set(jpeg_images) | set(webp_images), key=str.casefold)
    jpeg_only = len(set(jpeg_images) - set(webp_images))
    webp_only = len(set(webp_images) - set(jpeg_images))

    page = f'''---
layout: null
permalink: /jpeg-webp-comparison/
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="{{{{ site.baseurl }}}}/">
  <title>JPEG / WebP comparison</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: #181818; color: #eee; font: 15px/1.4 system-ui, sans-serif; }}
    header {{ position: sticky; top: 0; z-index: 1; padding: 16px 24px; background: #222; border-bottom: 1px solid #555; }}
    h1 {{ margin: 0 0 4px; font-size: 20px; }}
    p {{ margin: 0; color: #bbb; }}
    main {{ max-width: 1800px; margin: 0 auto; padding: 16px; }}
    .comparison-row {{ margin: 0 0 32px; border: 1px solid #555; background: #242424; }}
    .comparison-row h2 {{ margin: 0; padding: 8px 12px; font: 600 14px/1.3 ui-monospace, monospace; background: #303030; overflow-wrap: anywhere; }}
    .comparison-grid {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1px; background: #555; }}
    .image-cell {{ display: grid; align-content: start; justify-items: center; min-width: 0; min-height: 130px; padding: 12px; background: #181818; }}
    .image-cell img {{ display: block; max-width: 100%; max-height: 760px; width: auto; height: auto; object-fit: contain; background: repeating-conic-gradient(#444 0 25%, #333 0 50%) 50% / 20px 20px; }}
    .image-cell code {{ width: 100%; margin-top: 8px; color: #aaa; font-size: 12px; overflow-wrap: anywhere; }}
    .missing {{ place-items: center; color: #aaa; font-style: italic; }}
  </style>
</head>
<body>
  <header>
    <h1>JPEG / WebP comparison</h1>
    <p>{len(keys)} rows · JPEG: {len(jpeg_images)} · WebP: {len(webp_images)} · JPEG-only: {jpeg_only} · WebP-only: {webp_only}</p>
  </header>
  <main>
{rows(keys, jpeg_images, webp_images)}
  </main>
</body>
</html>
'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(keys)} rows.")


if __name__ == "__main__":
    main()
