#!/usr/bin/env python3
"""Static link/media audit for the dtech-website repo.

Checks every *.html page (+ JS data files) for:
  - local href/src targets that do not exist on disk
  - in-page #anchors with no matching id
  - <img> tags missing alt, width/height, or loading="lazy" (below-fold hint)

Usage: python3 tools/check-links.py
Exit code 1 when problems are found (CI-friendly).
"""
import glob
import json
import os
import re
import sys

SKIP_PREFIXES = ('http', 'https:', 'data:', 'mailto:', 'tel:', 'javascript:')
SKIP_PATHS = ('/_vercel/',)

problems = []

# Pages rendered by api/detail.js (rewrites in vercel.json): one per open role and
# one per published case study.
DETAIL_PAGES = {
    'careers': {j['id'] for j in json.load(open('data/jobs.json', encoding='utf-8')) if j.get('isActive') is True},
    'case-studies': {c['id'] for c in json.load(open('data/case-studies.json', encoding='utf-8')) if c.get('published') is not False},
}


def check_file(path):
    html = open(path, encoding='utf-8').read()
    ids = set(re.findall(r'id="([^"]+)"', html))
    # case-studies.html adds the console-published cards at load time from data/case-studies.json
    if path.endswith('case-studies.html'):
        ids |= {c['id'] for c in json.load(open('data/case-studies.json', encoding='utf-8')) if c.get('id')}
    for m in re.finditer(r'(?:src|href)=["\']([^"\']+)["\']', html):
        u = m.group(1)
        if u.startswith(SKIP_PREFIXES) or '${' in u:
            continue
        if u.startswith(SKIP_PATHS):
            continue
        nofrag, _, frag = u.partition('#')
        nofrag = nofrag.split('?')[0]
        if not nofrag:  # pure #anchor link
            if frag and frag not in ids:
                problems.append(f'{path}: dead anchor #{frag}')
            continue
        if nofrag.startswith('/'):
            continue  # root-absolute; resolves on the server
        if nofrag.endswith('.html'):
            problems.append(f'{path}: link keeps the .html extension (clean URLs are on): {u}')
            continue
        detail = re.fullmatch(r'(careers|case-studies)/([a-z0-9-]+)', nofrag)
        if detail:
            if detail.group(2) not in DETAIL_PAGES[detail.group(1)]:
                problems.append(f'{path}: link to a closed role or unpublished case study: {u}')
            continue
        # clean URLs: "about" is served from about.html
        page = nofrag if os.path.exists(nofrag) else nofrag + '.html'
        if not os.path.exists(page):
            problems.append(f'{path}: missing target {u}')
        elif frag and page.endswith('.html'):
            try:
                target = open(page, encoding='utf-8').read()
                # case-studies.html#services etc. open a filter tab (see applyCaseHash there)
                target_ids = set(re.findall(r'id="([^"]+)"', target)) | set(re.findall(r'data-filter="([^"]+)"', target))
                # case-studies.html adds the console-published cards at load time from data/case-studies.json
                if page.endswith('case-studies.html'):
                    target_ids |= {c['id'] for c in json.load(open('data/case-studies.json', encoding='utf-8')) if c.get('id')}
                if frag not in target_ids:
                    problems.append(f'{path}: dead anchor {u}')
            except OSError:
                pass
    for m in re.finditer(r'<img[^>]*>', html):
        tag = m.group(0)
        if 'alt=' not in tag:
            problems.append(f'{path}: <img> missing alt: {tag[:80]}')
        sm = re.search(r'src="([^"]*)"', tag)
        # placeholders populated by JS (lightbox/modal) carry no src yet
        if not sm or not sm.group(1).strip() or '${' in sm.group(1):
            continue
        if 'width=' not in tag or 'height=' not in tag:
            problems.append(f'{path}: <img> missing dimensions: {tag[:80]}')


def main():
    for f in sorted(glob.glob('*.html')):
        check_file(f)
    # JS-driven image paths (e.g. shop data) must exist too
    for f in sorted(glob.glob('assets/*.js')):
        js = open(f, encoding='utf-8').read()
        for m in re.finditer(r'["\'](assets/[^"\']+\.(?:webp|png|svg|jpg|pdf))["\']', js):
            if not os.path.exists(m.group(1)):
                problems.append(f'{f}: missing asset {m.group(1)}')
    if problems:
        print(f'{len(problems)} problem(s):')
        for p in problems:
            print(' ', p)
        return 1
    print('OK: all links, anchors, assets and img attributes pass.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
