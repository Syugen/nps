#!/usr/bin/env python3
"""Extract circular cancellation stamps from the scanned stamp-album images.

The detector is intentionally conservative: it looks for coloured circular ink,
not merely any circle on a page.  Every run writes review images and a manifest
so that exceptions can be corrected in ``stamp_overrides.json`` and re-exported.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np


@dataclass(frozen=True)
class Circle:
    x: int
    y: int
    radius: int
    ink_coverage: float
    colour_coverage: float

    @property
    def confidence(self) -> float:
        # Both measurements are fractions of directions around the detected ring.
        return min(1.0, 0.35 * self.ink_coverage + 0.65 * self.colour_coverage)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("images/stamps_raw"))
    parser.add_argument("--output", type=Path, default=Path("images/stamps_raw/cropped"))
    parser.add_argument(
        "--source",
        action="append",
        default=[],
        metavar="FILENAME",
        help="process only this source filename; repeat the option to select several files",
    )
    parser.add_argument("--size", type=int, default=512, help="square output size in pixels")
    parser.add_argument(
        "--padding", type=float, default=1.16,
        help="crop radius as a multiple of the detected ring radius",
    )
    parser.add_argument(
        "--overrides", type=Path, default=Path("tools/stamp_overrides.json"),
        help="optional additions/removals for difficult pages",
    )
    parser.add_argument("--clean", action="store_true", help="delete prior generated output first")
    return parser.parse_args()


def ring_features(gray: np.ndarray, saturation: np.ndarray, x: int, y: int, radius: int) -> tuple[float, float]:
    """Measure how consistently a prospective ring contains dark/coloured ink."""
    height, width = gray.shape
    angles = np.linspace(0, 2 * np.pi, 360, endpoint=False)
    # The lettering is slightly inside and outside of the Hough ring, hence the band.
    radii = np.linspace(0.72, 1.08, 13) * radius
    xs = np.rint(x + np.cos(angles)[:, None] * radii).astype(np.int32)
    ys = np.rint(y + np.sin(angles)[:, None] * radii).astype(np.int32)
    valid = (xs >= 0) & (xs < width) & (ys >= 0) & (ys < height)

    values = np.full(xs.shape, 255, dtype=np.uint8)
    colours = np.zeros(xs.shape, dtype=np.uint8)
    values[valid] = gray[ys[valid], xs[valid]]
    colours[valid] = saturation[ys[valid], xs[valid]]

    # A direction counts if any pixel in its narrow radial band contains ink.
    dark_coverage = float(np.mean(np.min(values, axis=1) < 175))
    colour_coverage = float(np.mean(np.max(colours, axis=1) > 40))
    return dark_coverage, colour_coverage


def is_duplicate(candidate: Circle, kept: Iterable[Circle]) -> bool:
    for previous in kept:
        distance = math.hypot(candidate.x - previous.x, candidate.y - previous.y)
        if distance < 0.60 * min(candidate.radius, previous.radius):
            return True
    return False


def detect_circles(image: np.ndarray) -> list[Circle]:
    height, width = image.shape[:2]
    # The original scans are 1728×2208. New scans may be captured at a different
    # resolution, so all pixel-based Hough parameters scale with the page size.
    scale = (width / 1728 + height / 2208) / 2
    gray = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (7, 7), 1.5)
    saturation = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)[:, :, 1]
    proposals: list[Circle] = []

    # A high accumulator threshold avoids treating page text as circles.  The second
    # pass recovers light/partially obscured postmarks; duplicate suppression merges it.
    for accumulator_threshold in (35, 30):
        circles = cv2.HoughCircles(
            gray,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=round(115 * scale),
            param1=100,
            param2=accumulator_threshold,
            minRadius=round(78 * scale),
            maxRadius=round(138 * scale),
        )
        if circles is None:
            continue
        for raw_x, raw_y, raw_radius in circles[0]:
            x, y, radius = (int(round(raw_x)), int(round(raw_y)), int(round(raw_radius)))
            # The album occupies this region in the supplied scanner images. Keeping a
            # margin deliberately allows stamps close to page edges but rejects the tray.
            if not (100 * scale <= x <= width - 100 * scale and 330 * scale <= y <= height - 330 * scale):
                continue
            # The metal binding creates very convincing false circular edges.
            if width * 0.48 <= x <= width * 0.59:
                continue
            ink, colour = ring_features(gray, saturation, x, y, radius)
            candidate = Circle(x, y, radius, ink, colour)
            # Most stamps in this collection use coloured cancellation ink. Requiring
            # substantial coloured coverage prevents detailed landscape photographs from
            # becoming false circular detections when their texture happens to align.
            if colour < 0.72:
                continue
            if not is_duplicate(candidate, proposals):
                proposals.append(candidate)

    # Top-to-bottom and then left-to-right produces stable, human-readable names.
    return sorted(proposals, key=lambda item: (item.y, item.x))


def load_overrides(path: Path) -> dict[str, dict[str, list]]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object keyed by source filename")
    return data


def apply_overrides(circles: list[Circle], source_name: str, overrides: dict[str, dict[str, list]]) -> list[Circle]:
    page = overrides.get(source_name, {})
    replacement = page.get("replace")
    if replacement is not None:
        if not isinstance(replacement, list):
            raise ValueError(f"replace entry for {source_name} must be a list")
        result = []
        for item in replacement:
            if len(item) != 3:
                raise ValueError(f"Invalid replace entry for {source_name}: {item!r}; expected [x, y, radius]")
            x, y, radius = (int(item[0]), int(item[1]), int(item[2]))
            result.append(Circle(x, y, radius, 1.0, 1.0))
        return sorted(result, key=lambda item: (item.y, item.x))
    removals = page.get("remove", [])
    kept = []
    for circle in circles:
        if any(math.hypot(circle.x - item[0], circle.y - item[1]) < item[2] for item in removals):
            continue
        kept.append(circle)
    for item in page.get("add", []):
        if len(item) != 3:
            raise ValueError(f"Invalid add entry for {source_name}: {item!r}; expected [x, y, radius]")
        x, y, radius = (int(item[0]), int(item[1]), int(item[2]))
        kept.append(Circle(x, y, radius, 1.0, 1.0))
    return sorted(kept, key=lambda item: (item.y, item.x))


def crop_circle(image: np.ndarray, circle: Circle, padding: float, size: int) -> np.ndarray:
    half_side = max(1, int(round(circle.radius * padding)))
    top, bottom = circle.y - half_side, circle.y + half_side
    left, right = circle.x - half_side, circle.x + half_side
    height, width = image.shape[:2]
    padded = cv2.copyMakeBorder(
        image,
        max(0, -top), max(0, bottom - height), max(0, -left), max(0, right - width),
        cv2.BORDER_CONSTANT,
        value=(255, 255, 255),
    )
    top += max(0, -top)
    bottom += max(0, -(circle.y - half_side))
    left += max(0, -left)
    right += max(0, -(circle.x - half_side))
    crop = padded[top:bottom, left:right]
    return cv2.resize(crop, (size, size), interpolation=cv2.INTER_LANCZOS4)


def annotate(image: np.ndarray, circles: list[Circle]) -> np.ndarray:
    preview = image.copy()
    for number, circle in enumerate(circles, start=1):
        cv2.circle(preview, (circle.x, circle.y), circle.radius, (255, 0, 255), 4)
        label = f"{number} {circle.confidence:.2f}"
        cv2.putText(preview, label, (circle.x - circle.radius, circle.y - circle.radius - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 255), 2, cv2.LINE_AA)
    return preview


def contact_sheet(paths: list[Path], destination: Path, tile_size: int) -> None:
    if not paths:
        return
    columns = 6
    label_height = 30
    rows = math.ceil(len(paths) / columns)
    sheet = np.full((rows * (tile_size + label_height), columns * tile_size, 3), 255, dtype=np.uint8)
    for index, path in enumerate(paths):
        row, column = divmod(index, columns)
        y, x = row * (tile_size + label_height), column * tile_size
        tile = cv2.imread(str(path))
        tile = cv2.resize(tile, (tile_size, tile_size), interpolation=cv2.INTER_AREA)
        sheet[y:y + tile_size, x:x + tile_size] = tile
        cv2.putText(sheet, path.stem[-10:], (x + 4, y + tile_size + 21),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (45, 45, 45), 1, cv2.LINE_AA)
    cv2.imwrite(str(destination), sheet)


def main() -> None:
    args = parse_args()
    if args.size <= 0 or args.padding <= 0:
        raise SystemExit("--size and --padding must be positive")
    if args.clean and args.output.exists():
        shutil.rmtree(args.output)
    stamps_dir = args.output / "stamps"
    preview_dir = args.output / "previews"
    stamps_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    overrides = load_overrides(args.overrides)
    source_paths = sorted(path for path in args.input.glob("*.*") if path.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if args.source:
        requested = set(args.source)
        source_paths = [path for path in source_paths if path.name in requested]
        missing = requested - {path.name for path in source_paths}
        if missing:
            raise SystemExit(f"Requested source image(s) not found in {args.input}: {', '.join(sorted(missing))}")
    if not source_paths:
        raise SystemExit(f"No images found in {args.input}")

    rows: list[dict[str, object]] = []
    output_paths: list[Path] = []
    for source in source_paths:
        image = cv2.imread(str(source))
        if image is None:
            print(f"Skipping unreadable image: {source}")
            continue
        page_override = overrides.get(source.name, {})
        # A replacement is a fully reviewed page layout, so running the automatic
        # detector first cannot improve the result and needlessly slows large scans.
        detected = [] if "replace" in page_override else detect_circles(image)
        circles = apply_overrides(detected, source.name, overrides)
        cv2.imwrite(str(preview_dir / f"{source.stem}_preview.jpg"), annotate(image, circles))
        for index, circle in enumerate(circles, start=1):
            destination = stamps_dir / f"{source.stem}_{index:03d}.png"
            cv2.imwrite(str(destination), crop_circle(image, circle, args.padding, args.size))
            output_paths.append(destination)
            rows.append({
                "source": source.name,
                "index": index,
                "x": circle.x,
                "y": circle.y,
                "radius": circle.radius,
                "confidence": f"{circle.confidence:.3f}",
                "output": destination.as_posix(),
            })
        print(f"{source.name}: {len(circles)} stamps")

    manifest_path = args.output / "manifest.csv"
    should_write_header = not manifest_path.exists() or manifest_path.stat().st_size == 0
    # A run may deliberately target only a few pages.  Keep its rows alongside the
    # previous batch rather than silently replacing its audit trail.
    with manifest_path.open("a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=["source", "index", "x", "y", "radius", "confidence", "output"])
        if should_write_header:
            writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(output_paths)} crops to {stamps_dir}")


if __name__ == "__main__":
    main()
