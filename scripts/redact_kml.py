#!/usr/bin/env python3
"""Create public KML copies with location and metadata redactions.

The input KML files are left unchanged. This script deliberately targets only
files directly inside kml/redact that do not already end in -redact.kml.
Set KML_REDACTION_PRIVACY_MARKERS to one or more exact private point names
(separated by ``||``) before running it; the private names are intentionally
not stored in this file. Set KML_REDACTION_PRIVACY_CENTERS to one or more
authoritative ``latitude,longitude`` pairs (also separated by ``||``) to
define Home privacy zones. Set KML_REDACTION_SPECIAL_TARGETS to additional
``latitude,longitude,kind`` entries (separated by ``||``), where kind is
``home``, ``stay`` or ``hangout``.
"""

from __future__ import annotations

import argparse
import copy
import math
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


KML_NS = "http://www.opengis.net/kml/2.2"
NS = {"kml": KML_NS}
ET.register_namespace("", KML_NS)

INPUT_DIR = Path("kml/redact")
REPORT_PATH = INPUT_DIR / "redaction-report.md"
TARGET_ADDRESSES = tuple(
    value.strip()
    for value in os.environ.get("KML_REDACTION_PRIVACY_MARKERS", "").split("||")
    if value.strip()
)
PRIVACY_CENTERS = tuple(
    value.strip()
    for value in os.environ.get("KML_REDACTION_PRIVACY_CENTERS", "").split("||")
    if value.strip()
)
SPECIAL_PRIVACY_TARGETS = tuple(
    value.strip()
    for value in os.environ.get("KML_REDACTION_SPECIAL_TARGETS", "").split("||")
    if value.strip()
)
CUT_RADIUS_METRES = 500.0
# Map routes snap to roads, so their endpoint need not exactly match a house pin.
HOME_ENDPOINT_MATCH_METRES = 150.0
# Insert new endpoints one metre outside the private radius to avoid rounding
# them back into the excluded area.
PUBLIC_ENDPOINT_METRES = CUT_RADIUS_METRES + 1.0
EARTH_RADIUS_METRES = 6_371_008.8


@dataclass(frozen=True)
class MarkerSpec:
    label: str
    base_style_id: str

    @property
    def nodesc_style_id(self) -> str:
        return f"{self.base_style_id}-nodesc"

    @property
    def nodesc_style_url(self) -> str:
        return f"#{self.nodesc_style_id}"


MARKER_SPECS = {
    "home": MarkerSpec("Home", "icon-1603-0288D1"),
    "stay": MarkerSpec("Stay Over", "icon-1602-0288D1"),
    "hangout": MarkerSpec("Hang out", "icon-1739-0288D1"),
}


@dataclass(frozen=True)
class PrivacyTarget:
    center: tuple[float, float, float | None]
    kind: str

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE)
PRECISE_TIME_RE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}[T ][0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+\-][0-2]\d:?\d{2})?",
    re.IGNORECASE,
)
SENSITIVE_DATA_NAMES = {
    "description",
    "email",
    "e-mail",
    "time",
    "timestamp",
    "start time",
    "end time",
    "starttime",
    "endtime",
}


def tag(name: str) -> str:
    return f"{{{KML_NS}}}{name}"


def local_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def text_of(element: ET.Element | None) -> str:
    return "" if element is None or element.text is None else element.text.strip()


def configured_privacy_targets() -> list[PrivacyTarget]:
    targets = []
    for value in PRIVACY_CENTERS:
        parts = [part.strip() for part in value.split(",")]
        if len(parts) != 2:
            raise ValueError("Each KML_REDACTION_PRIVACY_CENTERS entry must be latitude,longitude.")
        targets.append(PrivacyTarget((float(parts[1]), float(parts[0]), None), "home"))
    for value in SPECIAL_PRIVACY_TARGETS:
        parts = [part.strip() for part in value.split(",")]
        if len(parts) != 3 or parts[2] not in MARKER_SPECS:
            raise ValueError("Each KML_REDACTION_SPECIAL_TARGETS entry must be latitude,longitude,home|stay|hangout.")
        targets.append(PrivacyTarget((float(parts[1]), float(parts[0]), None), parts[2]))
    return targets


def parse_coordinates(value: str) -> list[tuple[float, float, float | None]]:
    points = []
    for token in value.split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        altitude = float(parts[2]) if len(parts) > 2 and parts[2] else None
        points.append((float(parts[0]), float(parts[1]), altitude))
    return points


def format_coordinates(points: list[tuple[float, float, float | None]]) -> str:
    def format_point(point: tuple[float, float, float | None]) -> str:
        lon, lat, altitude = point
        if altitude is None:
            return f"{lon:.7f},{lat:.7f}"
        return f"{lon:.7f},{lat:.7f},{altitude:g}"

    return "\n            " + "\n            ".join(format_point(point) for point in points) + "\n          "


def distance_metres(
    first: tuple[float, float, float | None],
    second: tuple[float, float, float | None],
) -> float:
    lon1, lat1, _ = first
    lon2, lat2, _ = second
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return EARTH_RADIUS_METRES * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def local_xy(
    point: tuple[float, float, float | None],
    center: tuple[float, float, float | None],
) -> tuple[float, float]:
    lon, lat, _ = point
    center_lon, center_lat, _ = center
    x = EARTH_RADIUS_METRES * math.radians(lon - center_lon) * math.cos(math.radians(center_lat))
    y = EARTH_RADIUS_METRES * math.radians(lat - center_lat)
    return x, y


def point_on_segment_at_radius(
    inside: tuple[float, float, float | None],
    outside: tuple[float, float, float | None],
    center: tuple[float, float, float | None],
    radius_metres: float,
) -> tuple[float, float, float | None]:
    """Return the outward intersection of a local line segment and a circle."""
    ix, iy = local_xy(inside, center)
    ox, oy = local_xy(outside, center)
    dx, dy = ox - ix, oy - iy
    a = dx * dx + dy * dy
    b = 2 * (ix * dx + iy * dy)
    c = ix * ix + iy * iy - radius_metres * radius_metres
    discriminant = max(0.0, b * b - 4 * a * c)
    roots = [(-b - math.sqrt(discriminant)) / (2 * a), (-b + math.sqrt(discriminant)) / (2 * a)]
    valid_roots = [root for root in roots if 0 <= root <= 1]
    fraction = max(valid_roots) if valid_roots else 1.0
    lon = inside[0] + fraction * (outside[0] - inside[0])
    lat = inside[1] + fraction * (outside[1] - inside[1])
    if inside[2] is None or outside[2] is None:
        altitude = inside[2] if inside[2] is not None else outside[2]
    else:
        altitude = inside[2] + fraction * (outside[2] - inside[2])
    return lon, lat, altitude


def trim_start(
    points: list[tuple[float, float, float | None]],
    center: tuple[float, float, float | None],
) -> tuple[list[tuple[float, float, float | None]], tuple[float, float, float | None] | None]:
    if not points or distance_metres(points[0], center) > HOME_ENDPOINT_MATCH_METRES:
        return points, None
    index = 0
    while index < len(points) and distance_metres(points[index], center) <= CUT_RADIUS_METRES:
        index += 1
    if index == len(points):
        return [], None
    endpoint = point_on_segment_at_radius(points[index - 1], points[index], center, PUBLIC_ENDPOINT_METRES)
    return [endpoint, *points[index:]], endpoint


def trim_end(
    points: list[tuple[float, float, float | None]],
    center: tuple[float, float, float | None],
) -> tuple[list[tuple[float, float, float | None]], tuple[float, float, float | None] | None]:
    reversed_points, endpoint = trim_start(list(reversed(points)), center)
    return list(reversed(reversed_points)), endpoint


@dataclass
class FileReport:
    input_name: str
    output_name: str
    descriptions_removed: int = 0
    data_fields_removed: Counter[str] = field(default_factory=Counter)
    time_elements_removed: int = 0
    email_text_nodes_redacted: int = 0
    home_markers_removed: int = 0
    point_markers_removed_within_radius: int = 0
    route_start_endpoints_trimmed: int = 0
    route_end_endpoints_trimmed: int = 0
    generated_markers: Counter[str] = field(default_factory=Counter)
    short_routes_removed: int = 0
    unchanged_transit_lines_within_radius: int = 0


def build_parent_map(root: ET.Element) -> dict[ET.Element, ET.Element]:
    return {child: parent for parent in root.iter() for child in parent}


def remove_metadata(root: ET.Element, report: FileReport) -> None:
    parent_map = build_parent_map(root)
    for element in list(root.iter()):
        parent = parent_map.get(element)
        if parent is None:
            continue
        kind = local_name(element)
        if kind == "description":
            parent.remove(element)
            report.descriptions_removed += 1
            continue
        if kind in {"TimeStamp", "TimeSpan"}:
            parent.remove(element)
            report.time_elements_removed += 1
            continue
        if kind not in {"Data", "SimpleData"}:
            continue
        field_name = element.get("name", "").strip().casefold()
        content = " ".join(part.strip() for part in element.itertext() if part.strip())
        if (
            field_name in SENSITIVE_DATA_NAMES
            or EMAIL_RE.search(content)
            or PRECISE_TIME_RE.search(content)
        ):
            parent.remove(element)
            report.data_fields_removed[field_name or kind] += 1

    # A name containing an email address cannot safely be retained. No input
    # currently uses one, but this makes the batch rule complete.
    for element in root.findall(".//kml:name", NS):
        if EMAIL_RE.search(text_of(element)):
            element.text = "[redacted]"
            report.email_text_nodes_redacted += 1


def find_home_markers(root: ET.Element) -> list[ET.Element]:
    return [
        placemark
        for placemark in root.findall(".//kml:Placemark", NS)
        if text_of(placemark.find("kml:name", NS)) in TARGET_ADDRESSES
    ]


def home_coordinate(placemark: ET.Element) -> tuple[float, float, float | None]:
    coordinates = placemark.find(".//kml:Point/kml:coordinates", NS)
    points = parse_coordinates(text_of(coordinates))
    if len(points) != 1:
        raise ValueError("The privacy marker must contain exactly one Point coordinate.")
    return points[0]


def fallback_marker_style(style_id: str, label_scale: str) -> ET.Element:
    """Match the source's stock-marker structure when the style is absent."""
    style = ET.Element(tag("Style"), {"id": style_id})
    icon_style = ET.SubElement(style, tag("IconStyle"))
    ET.SubElement(icon_style, tag("color")).text = "ffd18802"
    ET.SubElement(icon_style, tag("scale")).text = "1"
    icon = ET.SubElement(icon_style, tag("Icon"))
    ET.SubElement(icon, tag("href")).text = "https://www.gstatic.com/mapspro/images/stock/503-wht-blank_maps.png"
    label_style = ET.SubElement(style, tag("LabelStyle"))
    ET.SubElement(label_style, tag("scale")).text = label_scale
    return style


def ensure_nodesc_marker_style(root: ET.Element, spec: MarkerSpec) -> None:
    """Create normal, highlight and StyleMap definitions for a generated marker."""
    document = root.find(".//kml:Document", NS)
    if document is None:
        raise ValueError("KML has no Document element for the generated-marker style.")
    if document.find(f"kml:StyleMap[@id='{spec.nodesc_style_id}']", NS) is not None:
        return

    base_normal = document.find(f"kml:Style[@id='{spec.base_style_id}-normal']", NS)
    base_highlight = document.find(f"kml:Style[@id='{spec.base_style_id}-highlight']", NS)
    normal = copy.deepcopy(base_normal) if base_normal is not None else fallback_marker_style("", "0")
    highlight = copy.deepcopy(base_highlight) if base_highlight is not None else fallback_marker_style("", "1")
    normal.set("id", f"{spec.nodesc_style_id}-normal")
    highlight.set("id", f"{spec.nodesc_style_id}-highlight")

    style_map = ET.Element(tag("StyleMap"), {"id": spec.nodesc_style_id})
    for key, style_id in (("normal", normal.get("id")), ("highlight", highlight.get("id"))):
        pair = ET.SubElement(style_map, tag("Pair"))
        ET.SubElement(pair, tag("key")).text = key
        ET.SubElement(pair, tag("styleUrl")).text = f"#{style_id}"

    insertion_index = 1 if list(document) and local_name(list(document)[0]) == "name" else 0
    for style in (normal, highlight, style_map):
        document.insert(insertion_index, style)
        insertion_index += 1


def make_privacy_placemark(target: PrivacyTarget, endpoint: tuple[float, float, float | None]) -> ET.Element:
    spec = MARKER_SPECS[target.kind]
    placemark = ET.Element(tag("Placemark"))
    ET.SubElement(placemark, tag("name")).text = spec.label
    ET.SubElement(placemark, tag("styleUrl")).text = spec.nodesc_style_url
    point = ET.SubElement(placemark, tag("Point"))
    ET.SubElement(point, tag("coordinates")).text = format_coordinates([endpoint])
    return placemark


def line_has_internal_private_coordinate(
    points: list[tuple[float, float, float | None]],
    center: tuple[float, float, float | None],
) -> bool:
    return any(distance_metres(point, center) <= CUT_RADIUS_METRES for point in points)


def redact_routes_at_target(
    root: ET.Element,
    report: FileReport,
    target: PrivacyTarget,
) -> None:
    home = target.center
    parent_map = build_parent_map(root)
    for placemark in list(root.findall(".//kml:Placemark", NS)):
        line_coordinates = placemark.findall(".//kml:LineString/kml:coordinates", NS)
        if not line_coordinates:
            continue
        parent = parent_map[placemark]
        added_markers: list[ET.Element] = []
        line_changed = False
        for coordinates in line_coordinates:
            points = parse_coordinates(text_of(coordinates))
            if len(points) < 2:
                continue
            original = points
            points, start_endpoint = trim_start(points, home)
            if start_endpoint is not None:
                report.route_start_endpoints_trimmed += 1
                added_markers.append(make_privacy_placemark(target, start_endpoint))
                line_changed = True

            if len(points) >= 2:
                points, end_endpoint = trim_end(points, home)
            else:
                end_endpoint = None
            if end_endpoint is not None:
                report.route_end_endpoints_trimmed += 1
                added_markers.append(make_privacy_placemark(target, end_endpoint))
                line_changed = True

            if len(points) < 2:
                # No public part of this very short route remains.
                parent.remove(placemark)
                report.short_routes_removed += 1
                added_markers = []
                line_changed = False
                break
            # Only the affected endpoint is removed. A route may independently
            # pass through this area later; that transit segment is retained.
            if start_endpoint is not None and distance_metres(points[0], home) <= CUT_RADIUS_METRES:
                raise ValueError("A redacted route start remains inside the private radius.")
            if end_endpoint is not None and distance_metres(points[-1], home) <= CUT_RADIUS_METRES:
                raise ValueError("A redacted route end remains inside the private radius.")
            coordinates.text = format_coordinates(points)

            # Per the request, an untouched route that only passes through the
            # privacy area is left unchanged and surfaced in the report.
            if not line_changed and line_has_internal_private_coordinate(original, home):
                report.unchanged_transit_lines_within_radius += 1

        if line_changed:
            insert_after = list(parent).index(placemark) + 1
            for marker in added_markers:
                parent.insert(insert_after, marker)
                insert_after += 1
                report.generated_markers[target.kind] += 1

def redact_privacy_locations(root: ET.Element, report: FileReport) -> list[PrivacyTarget]:
    markers = find_home_markers(root)
    marker_details = [(marker, home_coordinate(marker)) for marker in markers]
    targets = configured_privacy_targets() or [PrivacyTarget(coordinate, "home") for _, coordinate in marker_details]
    parent_map = build_parent_map(root)
    for marker in markers:
        parent_map[marker].remove(marker)
        report.home_markers_removed += 1

    for target in targets:
        redact_routes_at_target(root, report, target)
    for kind in report.generated_markers:
        ensure_nodesc_marker_style(root, MARKER_SPECS[kind])
    return targets


def remove_private_point_placemarks(
    root: ET.Element,
    report: FileReport,
    targets: list[PrivacyTarget],
) -> None:
    """Delete Point Placemarks whose coordinates fall inside a privacy zone."""
    parent_map = build_parent_map(root)
    for placemark in list(root.findall(".//kml:Placemark", NS)):
        point_coordinates = placemark.findall(".//kml:Point/kml:coordinates", NS)
        points = [point for coordinates in point_coordinates for point in parse_coordinates(text_of(coordinates))]
        if any(distance_metres(point, target.center) <= CUT_RADIUS_METRES for point in points for target in targets):
            parent_map[placemark].remove(placemark)
            report.point_markers_removed_within_radius += 1


def rename_document(root: ET.Element, suffix: str) -> None:
    document_name = root.find(".//kml:Document/kml:name", NS)
    if document_name is not None and text_of(document_name) and not text_of(document_name).endswith(suffix):
        document_name.text = f"{text_of(document_name)}{suffix}"


def validate(
    root: ET.Element,
    targets: list[PrivacyTarget],
) -> None:
    serialized = ET.tostring(root, encoding="unicode")
    if any(address.casefold() in serialized.casefold() for address in TARGET_ADDRESSES):
        raise ValueError("A private address remains in the generated KML.")
    if EMAIL_RE.search(serialized):
        raise ValueError("An email address remains in the generated KML.")
    if PRECISE_TIME_RE.search(serialized):
        raise ValueError("A precise timestamp remains in the generated KML.")
    for placemark in root.findall(".//kml:Placemark", NS):
        for coordinates in placemark.findall(".//kml:Point/kml:coordinates", NS):
            for point in parse_coordinates(text_of(coordinates)):
                if any(distance_metres(point, target.center) <= CUT_RADIUS_METRES for target in targets):
                    raise ValueError("A point marker remains inside a private radius.")
        style_url = text_of(placemark.find("kml:styleUrl", NS))
        generated_spec = next(
            (
                spec
                for spec in MARKER_SPECS.values()
                if text_of(placemark.find("kml:name", NS)) == spec.label and style_url == spec.nodesc_style_url
            ),
            None,
        )
        if generated_spec is None:
            continue
        description = text_of(placemark.find("kml:description", NS))
        point_coordinates = placemark.find(".//kml:Point/kml:coordinates", NS)
        points = parse_coordinates(text_of(point_coordinates))
        if description or len(points) != 1:
            raise ValueError("A replacement Home marker is incomplete.")
        if any(distance_metres(points[0], target.center) <= CUT_RADIUS_METRES for target in targets):
            raise ValueError("A replacement privacy marker is inside the private radius.")


def process_file(path: Path) -> FileReport:
    output = path.with_name(f"{path.stem}-redact.kml")
    report = FileReport(path.name, output.name)
    root = ET.parse(path).getroot()
    remove_metadata(root, report)
    targets = redact_privacy_locations(root, report)
    remove_private_point_placemarks(root, report, targets)
    rename_document(root, "-redact")
    validate(root, targets)
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(output, encoding="UTF-8", xml_declaration=True)
    return report


def report_table_rows(reports: list[FileReport]) -> list[str]:
    lines = [
        "| 原文件 | 输出文件 | 删除描述 | 移除元数据 | 删除原标记 | 删除范围内标点 | 裁切起点 | 裁切终点 | 新隐私标记 | 未改动的途经线路 |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for report in reports:
        lines.append(
            "| {input_name} | {output_name} | {descriptions_removed} | {data_removed} | {home_markers_removed} | {point_markers_removed_within_radius} | {route_start_endpoints_trimmed} | {route_end_endpoints_trimmed} | {generated_markers} | {unchanged_transit_lines_within_radius} |".format(
                input_name=report.input_name,
                output_name=report.output_name,
                descriptions_removed=report.descriptions_removed,
                data_removed=sum(report.data_fields_removed.values()) + report.time_elements_removed + report.email_text_nodes_redacted,
                home_markers_removed=report.home_markers_removed,
                point_markers_removed_within_radius=report.point_markers_removed_within_radius,
                route_start_endpoints_trimmed=report.route_start_endpoints_trimmed,
                route_end_endpoints_trimmed=report.route_end_endpoints_trimmed,
                generated_markers="；".join(
                    f"{MARKER_SPECS[kind].label} {count}"
                    for kind, count in sorted(report.generated_markers.items())
                )
                or "0",
                unchanged_transit_lines_within_radius=report.unchanged_transit_lines_within_radius,
            )
        )
    return lines


def write_report(reports: list[FileReport], append: bool = False) -> None:
    if append:
        lines = [
            "",
            "## 追加脱敏处理（2026-09-12）",
            "",
            "规则：各隐私坐标分别独立处理。删除所有 Placemark description、邮箱、含精确起止时间的元数据与 KML 时间元素、指定地址标记，以及任一隐私坐标 500 米范围内的 Point 标记。对于起点或终点在任一隐私坐标 150 米内的线路，仅裁去距该坐标 500 米内的部分，并将新端点置于约 501 米处；按该坐标指定的类型添加无 description 的隐私标记。中途经过该区域的线路不作改动。",
            "",
            "报告不记录指定地址或坐标。",
            "",
            *report_table_rows(reports),
            "",
            "校验：每个输出文件均以 XML 重新解析；确认不含指定地址、邮箱或精确时间戳，且没有 Point 标记落在任一隐私坐标 500 米内。替换的 `Home` 标记均位于每个隐私坐标 500 米以外。此节结果取代此前涉及相同文件的处理记录。",
        ]
        with REPORT_PATH.open("a", encoding="utf-8") as report_file:
            report_file.write("\n".join(lines) + "\n")
        return
    lines = [
        "# KML 脱敏报告",
        "",
        "生成日期：2026-09-12",
        "",
        "规则：所有隐私坐标独立处理。删除 Placemark description、邮箱、含精确起止时间的元数据与 KML 时间元素、指定地址标记，以及任一隐私坐标 500 米范围内的 Point 标记。仅当线路起点或终点在任一隐私坐标 150 米内时，裁去距该点 500 米内的部分，并将新端点置于约 501 米处；每个新端点添加无 description 的 `Home`。纯途经线路不作改动。含 `Home` 的文件补齐 `nodesc` normal/highlight/StyleMap 定义。",
        "",
        "报告不记录隐私地址文字或坐标。",
        "",
    ]
    lines.extend(report_table_rows(reports))
    lines.extend(
        [
            "",
            "校验：每个输出文件均以 XML 重新解析；确认不含指定地址文字、邮箱或精确时间戳，且没有 Point 标记落在任一隐私坐标 500 米内。替换的 `Home` 标记均位于每个隐私坐标 500 米以外。",
        ]
    )
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--append-report", action="store_true")
    parser.add_argument("--no-report", action="store_true")
    parser.add_argument("inputs", nargs="*", type=Path)
    arguments = parser.parse_args()
    if not TARGET_ADDRESSES and not PRIVACY_CENTERS and not SPECIAL_PRIVACY_TARGETS:
        print("Set KML_REDACTION_PRIVACY_MARKERS, KML_REDACTION_PRIVACY_CENTERS and/or KML_REDACTION_SPECIAL_TARGETS.", file=sys.stderr)
        return 2
    try:
        configured_privacy_targets()
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    files = arguments.inputs or sorted(path for path in INPUT_DIR.glob("*.kml") if not path.stem.endswith("-redact"))
    if any(path.stem.endswith("-redact") or not path.is_file() for path in files):
        print("Inputs must be existing original KML files, not generated -redact files.", file=sys.stderr)
        return 2
    if not files:
        print(f"No input KML files found in {INPUT_DIR}.", file=sys.stderr)
        return 1
    reports = [process_file(path) for path in files]
    if not arguments.no_report:
        write_report(reports, append=arguments.append_report)
    print(f"Generated {len(reports)} redacted KML files" + (f" and {REPORT_PATH}." if not arguments.no_report else "."))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
