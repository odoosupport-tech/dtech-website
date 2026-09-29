#!/usr/bin/env python3
"""Regression checks for UI contracts that must survive CSS compilation."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]


def check_compiled_responsive_contract(problems):
    css = (ROOT / "assets/bundle.min.css").read_text(encoding="utf-8")
    required = {
        r".sm\:py-32": "partner section responsive spacing",
    }
    for selector, behavior in required.items():
        if selector not in css:
            problems.append(f"bundle missing {selector} ({behavior})")
    # Leadership columns now come from sections.css; the single-column
    # fallback must survive minification.
    sections = (ROOT / "assets/sections.min.css").read_text(encoding="utf-8").replace(" ", "")
    if not re.search(r"@media\(max-width:900px\)\{[^@]*\.dt-leaders\{grid-template-columns:1fr", sections):
        problems.append("sections.min.css lost the phone-width leadership column rule")


def check_leadership_contract(problems):
    html = (ROOT / "about.html").read_text(encoding="utf-8")
    css = (ROOT / "assets/skin.css").read_text(encoding="utf-8")
    sections = (ROOT / "assets/sections.css").read_text(encoding="utf-8")
    leadership = html.split('<section id="leadership"', 1)[-1].split("</section>", 1)[0]
    for class_name in ("dt-leaders", "dt-leader-lead", "dt-leader-list"):
        if f'class="{class_name}' not in leadership:
            problems.append(f"About leadership missing .{class_name}")
        if f".{class_name}" not in sections:
            problems.append(f"sections.css missing .{class_name}")
    if not re.search(r'href="assets/sections\.min\.css(?:\?v=[0-9a-f]+)?"', html):
        problems.append("about.html does not load assets/sections.min.css")
    if "--anchor-offset:104px" not in css.replace(" ", ""):
        problems.append("skin.css does not define the sticky-header anchor offset")


def check_authored_style_policy(problems):
    paths = [
        ROOT / "about.html",
        ROOT / "index.html",
        ROOT / "assets/brand-marquee.js",
        ROOT / "assets/skin.css",
    ]
    forbidden_colors = ("#8b5cf6", "#6366f1", "#ec4899", "#db2777", "#f9a8d4")
    for path in paths:
        source = path.read_text(encoding="utf-8").lower()
        if "transition: all" in source or "transition:all" in source:
            problems.append(f"{path.relative_to(ROOT)} uses transition: all")
        for color in forbidden_colors:
            if color in source:
                problems.append(f"{path.relative_to(ROOT)} uses non-palette color {color}")

    about = (ROOT / "about.html").read_text(encoding="utf-8")
    partner_section = about.split('<section id="partners"', 1)[-1].split("</section>", 1)[0]
    named_color_utility = re.compile(
        r"(?:bg|text|border|from|via|to|ring)-(?:blue|indigo|violet|purple|pink|rose|cyan|teal|green|emerald|amber|red)-"
    )
    match = named_color_utility.search(partner_section)
    if match:
        problems.append(f"partner section bypasses palette tokens with {match.group(0)} utility")


def check_marquee_contract(problems):
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    script = (ROOT / "assets/brand-marquee.js").read_text(encoding="utf-8")
    skin = (ROOT / "assets/skin.css").read_text(encoding="utf-8")
    bundle = (ROOT / "assets/bundle.min.css").read_text(encoding="utf-8")
    if not re.search(r'src="assets/brand-marquee\.js(?:\?v=[0-9a-f]+)?"', home):
        problems.append("index.html does not use shared brand marquee")
    # The marquee runs three endless animations, so only the home page loads it.
    for page in sorted(ROOT.glob("*.html")):
        if page.name != "index.html" and "brand-marquee.js" in page.read_text(encoding="utf-8"):
            problems.append(f"{page.name} loads the brand marquee; it belongs on the home page only")
    if '<section class="brand-marquee"' in home:
        problems.append("index.html still duplicates marquee markup")
    if "overflow-x:auto" not in skin.replace(" ", ""):
        problems.append("brand marquee is not a native horizontally-scrollable strip")
    if "makeSvg" in script:
        problems.append("brand marquee still draws synthetic partner marks")
    for logo in (
        "assets/partners/hp.svg",
        "assets/partners/dell-technologies.svg",
        "assets/partners/motorola-solutions.svg",
    ):
        if logo not in script:
            problems.append(f"brand marquee missing official logo asset {logo}")
    if ".brand-marquee-item img" not in bundle:
        problems.append("compiled bundle dropped brand marquee styling")
    if "prefers-reduced-motion:reduce" not in skin.replace(" ", ""):
        problems.append("skin.css lacks reduced-motion coverage")


def check_cache_contract(problems):
    worker = (ROOT / "sw.js").read_text(encoding="utf-8")
    if "var VERSION = 'dtech-v36';" not in worker:
        problems.append("service worker cache was not advanced to dtech-v36")
    for asset in ("/assets/bundle.min.css", "/assets/dtech-logo-blue.webp"):
        if asset not in worker:
            problems.append(f"service worker core cache missing {asset}")


def check_deep_link_contract(problems):
    script = (ROOT / "assets/refined.js").read_text(encoding="utf-8")
    if "alignHashTarget" not in script or "hashchange" not in script:
        problems.append("shared behavior does not realign deep links after layout settles")
    if "closeNavigationForHash" not in script:
        problems.append("same-page deep links do not close open navigation")


def main():
    problems = []
    check_compiled_responsive_contract(problems)
    check_leadership_contract(problems)
    check_authored_style_policy(problems)
    check_marquee_contract(problems)
    check_cache_contract(problems)
    check_deep_link_contract(problems)
    if problems:
        print(f"{len(problems)} UI contract problem(s):")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print("OK: UI contracts pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
