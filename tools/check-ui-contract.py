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


def check_public_admin_probe(problems):
    # Public pages must not call the admin API for every visitor: it 404s in
    # their console and costs a function call per page view. Only browsers
    # marked by a console sign-in (localStorage "dtech-console") may ask.
    for path in sorted(ROOT.glob("*.html")):
        if path.name == "portal.html":
            continue
        html = path.read_text(encoding="utf-8")
        if "/api/admin/auth" in html and "dtech-console" not in html:
            problems.append(f"{path.name} probes /api/admin/auth without the console sign-in marker")
    portal = (ROOT / "portal.html").read_text(encoding="utf-8")
    console_app = (ROOT / "api/admin/_console-app.js").read_text(encoding="utf-8")
    if "localStorage.setItem('dtech-console'" not in portal:
        problems.append("portal.html no longer sets the console sign-in marker")
    if "localStorage.removeItem('dtech-console')" not in console_app:
        problems.append("the console no longer clears its sign-in marker on sign-out")


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
    if "var VERSION = 'dtech-v44';" not in worker:
        problems.append("service worker cache was not advanced to dtech-v44")
    if "caches.match('/')" in worker:
        problems.append("service worker serves the home page for an uncached offline page; use offlinePage()")
    for asset in ("/assets/bundle.min.css", "/assets/dtech-logo-blue.webp"):
        if asset not in worker:
            problems.append(f"service worker core cache missing {asset}")


def check_events_contract(problems):
    """events.js builds its cards, dialog and ticket from .ev- classes at run time;
    they live in events.css (never purged), and the page must load the built files."""
    page = (ROOT / "events.html").read_text(encoding="utf-8")
    for needle in ("assets/events.min.css", "assets/events.min.js"):
        if not re.search(r'(?:href|src)="' + re.escape(needle) + r'(?:\?v=[0-9a-f]+)?"', page):
            problems.append(f"events.html does not load {needle}")
    css = (ROOT / "assets/events.min.css").read_text(encoding="utf-8")
    script = (ROOT / "assets/events.js").read_text(encoding="utf-8")
    runtime_classes = (
        "ev-list", "ev-card", "ev-tags", "ev-state", "ev-state--open", "ev-state--cancelled", "ev-chip", "ev-chip--paid", "ev-facts",
        "ev-more", "ev-rich", "ev-action", "ev-closed", "ev-dialog", "ev-pay", "ev-pay-rows", "ev-qr", "ev-copy", "ev-ticket",
        "ev-ticket-id", "ev-access-box", "ev-warn", "ev-note", "ev-err", "ev-form-msg",
    )
    for name in runtime_classes:
        if "." + name not in css:
            problems.append(f"events.min.css lost .{name} (events.js builds it at run time)")
        # State modifiers are assembled at run time ('ev-state--' + state), so look for their prefix.
        used = name in script or name in page or ("--" in name and name.split("--")[0] + "--" in script)
        if not used:
            problems.append(f".{name} is no longer used by events.js or events.html")
    if ".innerHTML" in script or "insertAdjacentHTML" in script:
        problems.append("events.js must render server data as text, not HTML")
    if "/api/" in page and "/api/admin" in page:
        problems.append("events.html must not call the admin API")


def check_contact_dock_contract(problems):
    """The phones' call / WhatsApp bar must dial the numbers the site publishes."""
    shared = (ROOT / "assets/refined.js").read_text(encoding="utf-8")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    contact = (ROOT / "contact.html").read_text(encoding="utf-8")
    if ".contact-dock" not in shared or "@media (max-width:767px)" not in shared:
        problems.append("refined.js lost the phone-only contact bar")
        return
    tel = re.search(r"const SALES_TEL = '([^']+)';", shared)
    sales = re.search(r'href="tel:([^"]+)"[^>]*>(?:(?!</a>).)*Sales', home, re.S)
    if not tel or not sales or tel.group(1) != sales.group(1):
        problems.append("contact bar call number differs from the top bar's sales number")
    chat = re.search(r"const WHATSAPP = '([^']+)';", shared)
    if not chat or f'href="{chat.group(1)}"' not in contact:
        problems.append("contact bar WhatsApp link differs from the contact page's")


def check_detail_pages_contract(problems):
    """api/detail.js renders case-study and job pages inside privacy-policy.html."""
    page = (ROOT / "privacy-policy.html").read_text(encoding="utf-8")
    if page.count("<main") != 1 or 'data-page="legal"' not in page:
        problems.append("privacy-policy.html no longer has the single <main> and data-page the detail pages rely on")


def check_icon_contract(problems):
    """Every data-lucide icon a page uses must be in the assets/lucide.js subset,
    or it renders as nothing (rebuild the subset with tools/lucide/build.mjs)."""
    library = (ROOT / "assets/lucide.js").read_text(encoding="utf-8")
    sources = [p for p in ROOT.glob("*.html")] + [p for p in (ROOT / "assets").glob("*.js") if not p.name.endswith((".min.js", "lucide.js"))]
    names = set()
    for path in sources:
        names |= set(re.findall(r'data-lucide="([a-z0-9-]+)"', path.read_text(encoding="utf-8")))
    pascal = lambda name: re.sub(r"(^|-)([a-z0-9])", lambda m: m.group(2).upper(), name)
    for name in sorted(names):
        if not re.search(r"\b" + pascal(name) + r"\b", library):
            problems.append(f'icon "{name}" is used but missing from assets/lucide.js')


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
    check_public_admin_probe(problems)
    check_events_contract(problems)
    check_contact_dock_contract(problems)
    check_detail_pages_contract(problems)
    check_icon_contract(problems)
    if problems:
        print(f"{len(problems)} UI contract problem(s):")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print("OK: UI contracts pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
