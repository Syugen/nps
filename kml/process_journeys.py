#!/usr/bin/env python3
"""Merge and normalize every journey KML below this directory.

Outputs are written as ``combined.kml`` in each journey directory and an
auditable ``journey_processing_report.json`` beside this script.  Original
KML files are never modified.
"""

from __future__ import annotations

import copy
import math
import re
import sys
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET


BASE = Path(__file__).resolve().parent
NS = "http://www.opengis.net/kml/2.2"
ET.register_namespace("", NS)


def tag(name: str) -> str:
    return f"{{{NS}}}{name}"


# Colors are the RGB values from samples.kml, with their KML AABBGGRR values.
DAY_COLORS = [
    ("red", "A52714", "ff1427a5"),
    ("orange", "F9A825", "ff25a8f9"),
    ("yellow", "FFEA00", "ff00eaff"),
    ("green", "7CB342", "ff42b37c"),
    ("cyan", "0097A7", "ffa79700"),
    ("blue", "01579B", "ff9b5701"),
    ("purple", "9C27B0", "ffb0279c"),
]

# Black is reserved for an explicit user-requested final-day override; it is
# not part of the normal seven-color cycle.
EXTRA_LINE_COLORS = [("black", "000000", "ff000000")]
ALL_LINE_COLORS = DAY_COLORS + EXTRA_LINE_COLORS
COLOR_INDEX_BY_NAME = {
    name: index for index, (name, _rgb, _kml) in enumerate(ALL_LINE_COLORS, start=1)
}

# These journeys have an explicit sequence that differs from the standard
# red→orange→yellow→green→cyan→blue→purple daily cycle.
JOURNEY_DAY_COLOR_OVERRIDES = {
    "53-arizona1": [
        "red", "orange", "yellow", "green", "cyan", "cyan", "cyan", "cyan", "blue", "purple",
    ],
    "81-can-rocky": [
        "red", "orange", "yellow", "green", "green", "green", "cyan", "blue", "purple", "black",
    ],
}

# Point 8 through Point 12 in samples.kml, respectively.
POINT_STYLE_IDS = {
    "home": "icon-1603-0288D1-nodesc",
    "hotel": "icon-1602-0288D1-nodesc",
    "attraction": "icon-1535-0288D1-nodesc",
    "airport": "icon-1504-0288D1-nodesc",
    "shop": "icon-1739-0288D1-nodesc",
}

ATTRACTION_TERMS = {
    "amusement park", "aquarium", "art gallery", "beach", "botanical garden",
    "castle", "church", "city park", "cultural center", "historical landmark",
    "historical place", "landmark", "local history museum", "monument", "museum",
    "national park", "national reserve", "park", "scenic spot", "tourist attraction",
    "tourist information center", "visitor center", "zoo",
}
SHOP_TERMS = {
    "asian", "bakery", "bar", "barbecue", "burritos", "cafe", "chinese", "coffee shop",
    "convenience store", "cuban", "department store", "dollar store", "electronics store",
    "diner", "event ticket seller", "fast food", "food", "french", "gas station", "grocery store",
    "hamburger", "honda dealer", "liquor store", "mall", "market", "mexican", "peruvian",
    "pharmacy", "pizza delivery", "ramen", "restaurant", "sandwich", "shop", "shopping mall",
    "souvenir shop", "store", "supermarket", "sushi", "thai", "truck stop", "tex mex",
    "bubble tea", "czech",
}


def local_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def text_of(element: ET.Element, child: str) -> str:
    found = element.find(tag(child))
    return (found.text or "").strip() if found is not None else ""


def category_of(placemark: ET.Element) -> str:
    for data in placemark.findall(f".//{tag('Data')}"):
        if data.get("name", "").strip().casefold() == "category":
            return text_of(data, "value")
    return ""


def distance_of(placemark: ET.Element) -> float | None:
    for data in placemark.findall(f".//{tag('Data')}"):
        if data.get("name", "").strip().casefold() == "distance":
            try:
                return float(text_of(data, "value"))
            except ValueError:
                return None
    return None


def classify_point(placemark: ET.Element) -> str | None:
    """Return one confirmed marker type; return None rather than guessing."""
    category = category_of(placemark).casefold()
    name = text_of(placemark, "name").casefold()
    combined = f"{category} {name}"
    if "airport" in category:
        return "airport"
    if category in {"hotel", "motel", "hostel", "lodging", "lodge", "resort hotel"}:
        return "hotel"
    if category in {"home", "house", "residence"} or name in {"home", "house"}:
        return "home"
    if (
        any(term in name for term in ("hotel", "motel", "hostel", " inn", "suites", "hyatt", "marriott", "hilton", "ibis", "lodge", "resort"))
        and "hotel zone" not in name
    ):
        return "hotel"
    if category in ATTRACTION_TERMS or any(
        term in category for term in (
            "church", "concert hall", "garden", "hiking", "histor", "island", "museum",
            "nature preserve", "plaza", "trail", "vista",
        )
    ) or any(
        term in name for term in (
            "national park", "state park", "historical park", "historic site", "museum",
            "monument", "memorial", "visitor center", "garden", "beach", "canyon", "trailhead",
        )
    ):
        return "attraction"
    # The user has specified that these non-attraction point types use the
    # generic small-dot marker, including an empty (unclassified) category.
    if category in {"", "apartment complex", "building", "car rental agency", "parking lot"}:
        return "shop"
    if category in SHOP_TERMS or any(term in combined for term in SHOP_TERMS):
        return "shop"
    return None


def set_style_url(placemark: ET.Element, style_id: str) -> None:
    style = placemark.find(tag("styleUrl"))
    if style is None:
        style = ET.Element(tag("styleUrl"))
        name = placemark.find(tag("name"))
        if name is None:
            placemark.insert(0, style)
        else:
            placemark.insert(list(placemark).index(name) + 1, style)
    style.text = f"#{style_id}"


def remap_style_url(placemark: ET.Element, id_map: dict[str, str]) -> None:
    style = placemark.find(tag("styleUrl"))
    if style is not None and style.text:
        current = style.text.strip()
        if current.startswith("#") and current[1:] in id_map:
            style.text = f"#{id_map[current[1:]]}"


def parse_coordinates(placemark: ET.Element) -> list[tuple[float, float]]:
    coords = placemark.find(f".//{tag('LineString')}/{tag('coordinates')}")
    if coords is None or not coords.text:
        return []
    result = []
    for item in coords.text.replace("\n", " ").split():
        parts = item.split(",")
        if len(parts) >= 2:
            try:
                result.append((float(parts[0]), float(parts[1])))
            except ValueError:
                pass
    return result


def haversine_meters(points: list[tuple[float, float]]) -> float:
    earth_radius_m = 6_371_008.8
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(points, points[1:]):
        lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
        dlat, dlon = lat2 - lat1, lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        total += 2 * earth_radius_m * math.asin(math.sqrt(a))
    return total


def placemarks_in_order(container: ET.Element) -> list[ET.Element]:
    return list(container.iter(tag("Placemark")))


def parent_map(root: ET.Element) -> dict[ET.Element, ET.Element]:
    return {child: parent for parent in root.iter() for child in parent}


def delete_placemarks_before_or_after(
    source: ET.Element, mode: str, report: dict,
) -> None:
    placemarks = placemarks_in_order(source)
    airports = [i for i, pm in enumerate(placemarks) if category_of(pm).casefold() == "airport"]
    if not airports:
        day_label = "首日" if mode == "first_day" else "末日"
        report["warnings"].append(f"{day_label}未找到机场点，因此未执行该侧的边界删除。")
        return
    cutoff = airports[0] if mode == "first_day" else airports[-1]
    remove = placemarks[:cutoff] if mode == "first_day" else placemarks[cutoff + 1:]
    parents = parent_map(source)
    for placemark in remove:
        parents[placemark].remove(placemark)
    report["deleted"][mode] = [
        {"name": text_of(pm, "name"), "category": category_of(pm)} for pm in remove
    ]


def sample_icon_style_nodes() -> list[ET.Element]:
    root = ET.parse(BASE / "samples.kml").getroot()
    document = root.find(tag("Document"))
    assert document is not None
    wanted = set(POINT_STYLE_IDS.values())
    # Copy the five StyleMaps and their ten normal/highlight Style definitions.
    return [
        copy.deepcopy(child)
        for child in document
        if local_name(child) in {"Style", "StyleMap"}
        and (child.get("id") in wanted or child.get("id", "").rsplit("-", 1)[0] in wanted)
    ]


def add_day_styles(document: ET.Element) -> None:
    for index, (name, _rgb, kml_color) in enumerate(ALL_LINE_COLORS, start=1):
        base_id = f"day-{index:02d}-{name}"
        for suffix, width in (("normal", "5"), ("highlight", "7.5")):
            style = ET.SubElement(document, tag("Style"), {"id": f"{base_id}-{suffix}"})
            line_style = ET.SubElement(style, tag("LineStyle"))
            ET.SubElement(line_style, tag("color")).text = kml_color
            ET.SubElement(line_style, tag("width")).text = width
        style_map = ET.SubElement(document, tag("StyleMap"), {"id": base_id})
        for key, suffix in (("normal", "normal"), ("highlight", "highlight")):
            pair = ET.SubElement(style_map, tag("Pair"))
            ET.SubElement(pair, tag("key")).text = key
            ET.SubElement(pair, tag("styleUrl")).text = f"#{base_id}-{suffix}"


def add_prefixed_point_styles(
    document: ET.Element, icon_nodes: list[ET.Element], prefix: str,
) -> dict[str, str]:
    """Add sample point templates without colliding with source KML style IDs."""
    cloned_nodes = [copy.deepcopy(node) for node in icon_nodes]
    id_map = {
        node.get("id"): f"{prefix}{node.get('id')}"
        for node in cloned_nodes
        if node.get("id")
    }
    for node in cloned_nodes:
        old_id = node.get("id")
        if old_id:
            node.set("id", id_map[old_id])
        for style_url in node.iter(tag("styleUrl")):
            if style_url.text:
                old_ref = style_url.text.strip().removeprefix("#")
                if old_ref in id_map:
                    style_url.text = f"#{id_map[old_ref]}"
        document.append(node)
    return {kind: id_map[style_id] for kind, style_id in POINT_STYLE_IDS.items()}


def original_files(journey_dir: Path) -> list[Path]:
    generated_names = {"combined.kml", f"{journey_dir.name}.kml"}
    return sorted(
        (path for path in journey_dir.glob("*.kml") if path.name not in generated_names),
        key=lambda path: (re.search(r"\d{4}-\d{2}-\d{2}", path.name) or [path.name])[0],
    )


def calculate_driving_mileage(files: list[Path]) -> dict[str, float | int]:
    """Calculate Driving-only totals without changing any KML or report files."""
    result: dict[str, float | int] = {
        "segments": 0,
        "metadata_meters": 0.0,
        "coordinate_haversine_meters": 0.0,
    }
    for source_file in files:
        root = ET.parse(source_file).getroot()
        for placemark in root.iter(tag("Placemark")):
            if category_of(placemark).casefold() != "driving":
                continue
            result["segments"] += 1
            metadata = distance_of(placemark)
            if metadata is not None:
                result["metadata_meters"] += metadata
            result["coordinate_haversine_meters"] += haversine_meters(parse_coordinates(placemark))
    return result


def calculate_all_line_mileage(files: list[Path]) -> dict[str, float | int]:
    """Calculate every LineString for track-only imports lacking Categories."""
    result: dict[str, float | int] = {"segments": 0, "coordinate_haversine_meters": 0.0}
    for source_file in files:
        root = ET.parse(source_file).getroot()
        for placemark in root.iter(tag("Placemark")):
            if placemark.find(f".//{tag('LineString')}") is None:
                continue
            result["segments"] += 1
            result["coordinate_haversine_meters"] += haversine_meters(parse_coordinates(placemark))
    return result


def style_standalone_kml(source_file: Path, icon_nodes: list[ET.Element]) -> dict:
    """Style one navigation/track KML without merging or deleting its content."""
    root = ET.parse(source_file).getroot()
    document = root.find(tag("Document"))
    if document is None:
        raise RuntimeError(f"{source_file.name} 缺少 Document 节点")
    add_day_styles(document)
    # My Maps recognizes the semantic sample icon IDs (for example,
    # icon-1504… for an airport).  These source files have no ID collision.
    point_style_ids = add_prefixed_point_styles(document, icon_nodes, "")
    icon_counts: Counter[str] = Counter()
    line_colors: list[str] = []
    for placemark in placemarks_in_order(document):
        if placemark.find(f".//{tag('LineString')}") is not None:
            color_name, color_index = color_for_day(source_file.stem, len(line_colors))
            set_style_url(placemark, f"day-{color_index:02d}-{color_name}")
            line_colors.append(color_name)
        elif placemark.find(f".//{tag('Point')}") is not None:
            marker = classify_point(placemark) or "shop"
            set_style_url(placemark, point_style_ids[marker])
            icon_counts[marker] += 1
    mileage = calculate_all_line_mileage([source_file])
    output_file = source_file.with_name(f"{source_file.stem}-processed.kml")
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(output_file, encoding="UTF-8", xml_declaration=True)
    return {
        "input": source_file.name,
        "output": output_file.name,
        "lines": len(line_colors),
        "line_colors": line_colors,
        "icons": dict(sorted(icon_counts.items())),
        "coordinate_meters": mileage["coordinate_haversine_meters"],
    }


def merge_processed_kml(source_files: list[Path], output_file: Path) -> None:
    """Merge already-styled KMLs while retaining their existing day layers."""
    documents: list[tuple[Path, ET.Element]] = []
    for source_file in source_files:
        root = ET.parse(source_file).getroot()
        document = root.find(tag("Document"))
        if document is None:
            raise RuntimeError(f"{source_file.name} 缺少 Document 节点")
        documents.append((source_file, document))
    out_root = ET.Element(tag("kml"))
    out_document = ET.SubElement(out_root, tag("Document"))
    ET.SubElement(out_document, tag("name")).text = output_file.stem
    # The processed source files use the same canonical sample/day styles, so
    # one copy serves every resulting layer without duplicate style IDs.
    for child in documents[0][1]:
        if local_name(child) in {"Style", "StyleMap"}:
            out_document.append(copy.deepcopy(child))
    for _source_file, document in documents:
        for child in document:
            if local_name(child) not in {"Style", "StyleMap", "name", "description", "open"}:
                # These processed KMLs are already organized by date.  Keep each
                # non-empty day Folder at the document root, rather than adding
                # a source-file wrapper that would collapse the visible layers.
                if local_name(child) == "Folder" and not child.findall(f".//{tag('Placemark')}"):
                    continue
                out_document.append(copy.deepcopy(child))
    ET.indent(out_root, space="  ")
    ET.ElementTree(out_root).write(output_file, encoding="UTF-8", xml_declaration=True)


def color_for_day(journey_name: str, chronological_day_index: int) -> tuple[str, int]:
    """Return the requested color and its one-based day-style definition index."""
    override = JOURNEY_DAY_COLOR_OVERRIDES.get(journey_name)
    if override and chronological_day_index < len(override):
        color_name = override[chronological_day_index]
        return color_name, COLOR_INDEX_BY_NAME[color_name]
    color_index = chronological_day_index % len(DAY_COLORS)
    return DAY_COLORS[color_index][0], color_index + 1


def merge_journey(journey_dir: Path, icon_nodes: list[ET.Element]) -> dict:
    files = original_files(journey_dir)
    report = {
        "journey": journey_dir.name,
        "input_files": [path.name for path in files],
        "deleted": {"first_day": [], "last_day": []},
        "warnings": [],
        "line_styles": [],
        "point_icons": Counter(),
        "unclassified_points": [],
        "driving": {"segments": 0, "metadata_meters": 0.0, "coordinate_haversine_meters": 0.0},
    }
    out_root = ET.Element(tag("kml"))
    document = ET.SubElement(out_root, tag("Document"))
    ET.SubElement(document, tag("name")).text = f"{journey_dir.name} — combined"
    add_day_styles(document)
    for node in icon_nodes:
        document.append(copy.deepcopy(node))

    parsed: list[tuple[Path, ET.Element, ET.Element]] = []
    for source_file in files:
        source_root = ET.parse(source_file).getroot()
        source_document = source_root.find(tag("Document"))
        if source_document is None:
            report["warnings"].append(f"{source_file.name}: Document node missing; skipped")
            continue
        parsed.append((source_file, source_root, source_document))

    if parsed and journey_dir.name != "35-ithaca-vw":
        delete_placemarks_before_or_after(parsed[0][2], "first_day", report)
        # If it is a one-file trip, the first trim happens before the final trim.
        delete_placemarks_before_or_after(parsed[-1][2], "last_day", report)
    elif parsed:
        report["warnings"].append("特例：35-ithaca-vw 未执行机场前后内容删除。")

    # Render newest layers first, but keep the day-color sequence anchored to
    # chronological order (red is the first day, then orange, yellow, etc.).
    for day_index, (source_file, _source_root, source_document) in reversed(list(enumerate(parsed))):
        layer = ET.SubElement(document, tag("Folder"))
        ET.SubElement(layer, tag("name")).text = source_file.stem
        source_style_map: dict[str, str] = {}
        source_prefix = f"source-{day_index + 1:02d}-"
        source_styles: list[ET.Element] = []
        for child in source_document:
            if local_name(child) in {"Style", "StyleMap"} and child.get("id"):
                cloned = copy.deepcopy(child)
                old_id = cloned.get("id")
                new_id = f"{source_prefix}{old_id}"
                source_style_map[old_id] = new_id
                cloned.set("id", new_id)
                source_styles.append(cloned)
        # A StyleMap can refer to another source style.  Remap those references
        # too, so intentionally unmodified/uncertain points keep their style.
        for cloned in source_styles:
            for style_url in cloned.iter(tag("styleUrl")):
                if style_url.text:
                    current = style_url.text.strip()
                    if current.startswith("#") and current[1:] in source_style_map:
                        style_url.text = f"#{source_style_map[current[1:]]}"
            layer.append(cloned)

        content = [
            copy.deepcopy(child) for child in source_document
            if local_name(child) not in {"Style", "StyleMap", "name", "description", "open"}
        ]
        for child in content:
            layer.append(child)
        color_name, color_style_index = color_for_day(journey_dir.name, day_index)
        day_style_id = f"day-{color_style_index:02d}-{color_name}"
        changed_lines = 0
        per_line_colors: list[str] = []
        for placemark in placemarks_in_order(layer):
            remap_style_url(placemark, source_style_map)
            if placemark.find(f".//{tag('LineString')}") is not None:
                if journey_dir.name == "57b-bay-area":
                    line_color_name = DAY_COLORS[changed_lines % len(DAY_COLORS)][0]
                    line_style_id = (
                        f"day-{changed_lines % len(DAY_COLORS) + 1:02d}-{line_color_name}"
                    )
                    set_style_url(placemark, line_style_id)
                    per_line_colors.append(line_color_name)
                else:
                    set_style_url(placemark, day_style_id)
                changed_lines += 1
                if category_of(placemark).casefold() == "driving":
                    report["driving"]["segments"] += 1
                    metadata = distance_of(placemark)
                    if metadata is None:
                        report["warnings"].append(
                            f"{source_file.name} 的 Driving 线“{text_of(placemark, 'name')}”没有可用的数值里程元数据。"
                        )
                    else:
                        report["driving"]["metadata_meters"] += metadata
                    report["driving"]["coordinate_haversine_meters"] += haversine_meters(parse_coordinates(placemark))
            elif placemark.find(f".//{tag('Point')}") is not None:
                marker = classify_point(placemark)
                if marker is None:
                    report["unclassified_points"].append({
                        "file": source_file.name,
                        "name": text_of(placemark, "name"),
                        "category": category_of(placemark),
                    })
                    # Keep an audit trail of the uncertain classification, but
                    # render it with the requested generic small-dot marker.
                    set_style_url(placemark, POINT_STYLE_IDS["shop"])
                    report["point_icons"]["shop"] += 1
                else:
                    set_style_url(placemark, POINT_STYLE_IDS[marker])
                    report["point_icons"][marker] += 1
        report["line_styles"].append({
            "file": source_file.name,
            "color": color_name,
            "normal_width": 5,
            "highlight_width": 7.5,
            "changed_line_count": changed_lines,
            "per_line_colors": per_line_colors,
        })

    report["point_icons"] = dict(sorted(report["point_icons"].items()))
    for key in ("metadata_meters", "coordinate_haversine_meters"):
        report["driving"][key] = round(report["driving"][key], 2)
    ET.indent(out_root, space="  ")
    ET.ElementTree(out_root).write(
        journey_dir / f"{journey_dir.name}.kml", encoding="UTF-8", xml_declaration=True
    )
    return report


def describe_items(items: list[dict]) -> str:
    if not items:
        return "无"
    return "；".join(
        f"{item['name']}（{item['category'] or '无分类'}）" for item in items
    )


def chinese_report(reports: list[dict]) -> str:
    """Produce an auditable, human-readable Chinese report instead of JSON."""
    lines = ["# KML 旅程处理报告", ""]
    for report in reports:
        driving = report["driving"]
        metadata_km = driving["metadata_meters"] / 1000
        coordinate_km = driving["coordinate_haversine_meters"] / 1000
        ordered_layers = "、".join(
            (
                f"{item['file']}（单一图层，{item['changed_line_count']} 条线按顺序使用"
                f"{'、'.join(item['per_line_colors'])}）"
                if item["per_line_colors"] else
                f"{item['file']}（{item['color']}，{item['changed_line_count']} 条线）"
            )
            for item in report["line_styles"]
        )
        icons = report["point_icons"]
        icon_summary = "、".join(
            f"{label}{icons.get(kind, 0)}"
            for kind, label in (
                ("airport", "飞机图标"), ("hotel", "旅店图标"),
                ("attraction", "照相机图标"), ("home", "房子图标"),
                ("shop", "小圆点"),
            )
            if icons.get(kind, 0)
        ) or "没有可替换的点"
        lines.extend([
            f"## {report['journey']}",
            "",
            f"- 合并了 {len(report['input_files'])} 个原始 KML；每个文件保留为一个图层。",
            f"- 图层按时间倒序：{ordered_layers}。所有线均设普通粗细 5、高亮粗细 7.5。",
            f"- 首日删除：{describe_items(report['deleted']['first_day'])}。",
            f"- 末日删除：{describe_items(report['deleted']['last_day'])}。",
            f"- Driving 共 {driving['segments']} 段；元数据里程总和 {driving['metadata_meters']:,.0f} 米（{metadata_km:,.3f} km），坐标 Haversine 计算 {driving['coordinate_haversine_meters']:,.2f} 米（{coordinate_km:,.3f} km）。不计 Flying、Walking、Hiking、公交或其他线。",
            f"- 图标替换：{icon_summary}。加油站、餐厅、建筑、Apartment complex、Parking lot、Car rental agency 与无分类点均使用小圆点；照相机仅用于景点。",
            f"- 分类仍不确定、但已使用小圆点：{describe_items(report['unclassified_points'])}。",
        ])
        if report["warnings"]:
            lines.append(f"- 说明：{'；'.join(report['warnings'])}")
        lines.append("")
    return "\n".join(lines)


def merge_report_file(report_file: Path, reports: list[dict]) -> None:
    """Update requested journey sections without discarding earlier reports."""
    new_sections = chinese_report(reports).strip().split("\n## ")[1:]
    replacements = {
        report["journey"]: "## " + section.strip()
        for report, section in zip(reports, new_sections)
    }
    if not report_file.exists():
        report_file.write_text(chinese_report(reports), encoding="utf-8")
        return

    existing = report_file.read_text(encoding="utf-8").strip()
    heading, *sections = existing.split("\n## ")
    merged_sections: list[str] = []
    seen: set[str] = set()
    for section in sections:
        name = section.split("\n", 1)[0].strip()
        if name in replacements:
            merged_sections.append(replacements[name])
            seen.add(name)
        else:
            merged_sections.append("## " + section.strip())
    for report in reports:
        name = report["journey"]
        if name not in seen:
            merged_sections.append(replacements[name])
    report_file.write_text(
        heading.strip() + "\n\n" + "\n\n".join(merged_sections) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    icon_nodes = sample_icon_style_nodes()
    requested = sys.argv[1:]
    if requested and requested[0] == "--merge-processed":
        if len(requested) < 4:
            raise SystemExit("--merge-processed 后需要输出文件名和至少两个源 KML")
        output_file = BASE / requested[1]
        source_files = [BASE / raw_target for raw_target in requested[2:]]
        if not all(source_file.is_file() for source_file in source_files):
            raise SystemExit("找不到一个或多个待合并 KML")
        merge_processed_kml(source_files, output_file)
        root = ET.parse(output_file).getroot()
        document = root.find(tag("Document"))
        layer_count = 0 if document is None else sum(
            1 for child in document if local_name(child) == "Folder"
        )
        print(f"已合并为 {output_file.name}，共 {layer_count} 个图层。")
        return
    if requested and requested[0] == "--style-standalone":
        targets = requested[1:]
        if not targets:
            raise SystemExit("--style-standalone 后至少需要一个 KML 文件")
        for raw_target in targets:
            target = Path(raw_target)
            if not target.is_absolute():
                target = BASE / target
            if not target.is_file():
                raise SystemExit(f"找不到 KML：{raw_target}")
            result = style_standalone_kml(target, icon_nodes)
            print(
                f"{result['input']} → {result['output']}：{result['lines']} 条线，"
                f"颜色顺序 {'、'.join(result['line_colors'])}；"
                f"坐标长度 {result['coordinate_meters'] / 1000:,.3f} km；"
                f"图标 {result['icons']}。"
            )
        return
    if requested and requested[0] == "--mileage-only":
        targets = requested[1:]
        if not targets:
            raise SystemExit("--mileage-only 后至少需要一个 KML 文件或旅程文件夹")
        for raw_target in targets:
            target = Path(raw_target)
            if not target.is_absolute():
                target = BASE / target
            files = original_files(target) if target.is_dir() else [target]
            if not files or not all(path.is_file() for path in files):
                raise SystemExit(f"找不到 KML：{raw_target}")
            mileage = calculate_driving_mileage(files)
            coordinate_meters = mileage["coordinate_haversine_meters"]
            if mileage["segments"]:
                print(
                    f"{raw_target}：Driving {mileage['segments']} 段；"
                    f"坐标计算 {coordinate_meters:,.2f} 米（{coordinate_meters / 1000:,.3f} km）；"
                    f"元数据合计 {mileage['metadata_meters']:,.0f} 米。"
                )
            else:
                all_lines = calculate_all_line_mileage(files)
                coordinate_meters = all_lines["coordinate_haversine_meters"]
                print(
                    f"{raw_target}：未标注 Driving；按全部 {all_lines['segments']} 条轨迹线计算 "
                    f"{coordinate_meters:,.2f} 米（{coordinate_meters / 1000:,.3f} km）。"
                )
        return
    if requested:
        journeys = [BASE / name for name in requested]
        missing = [str(path) for path in journeys if not path.is_dir()]
        if missing:
            raise SystemExit(f"不存在的旅程文件夹：{'、'.join(missing)}")
    else:
        journeys = sorted(path for path in BASE.iterdir() if path.is_dir())
    reports = [merge_journey(journey, icon_nodes) for journey in journeys]
    report_text = chinese_report(reports)
    report_file = BASE / "journey_processing_report.md"
    merge_report_file(report_file, reports)
    print(report_text)


if __name__ == "__main__":
    main()
