"""Allow every page's inline <script> blocks by hash in the Content-Security-Policy.

The site's CSP (the Content-Security-Policy headers in vercel.json) has no
'unsafe-inline' in script-src: an injected <script> or onclick= attribute does not
run. The inline scripts the pages do need are listed by their SHA-256 hash, which
this tool computes from every *.html page and writes into script-src.

  python3 tools/csp-hashes.py           rewrite vercel.json (npm run build does this)
  python3 tools/csp-hashes.py --check   exit 1 if vercel.json is out of date, or if a
                                        page has an inline event handler (onclick=…)

The hp/dell/motorola pages keep 'unsafe-inline': they embed HP's third-party
syndication widget, which is outside our control.
"""
import base64
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERCEL_JSON = os.path.join(ROOT, 'vercel.json')
THIRD_PARTY_SOURCES = {'/(hp|dell|motorola)(\\.html)?'}

SCRIPT = re.compile(r'<script(\s[^>]*)?>(.*?)</script\s*>', re.S | re.I)
SRC_ATTR = re.compile(r'\ssrc\s*=', re.I)
TYPE_ATTR = re.compile(r'\stype\s*=\s*["\']?([^"\'\s>]+)', re.I)
JS_TYPES = {'', 'text/javascript', 'application/javascript', 'module'}
# Inline event handler attributes inside tags, e.g. <button onclick="…">.
HANDLER = re.compile(r'<[a-z][^>]*\son[a-z]+\s*=', re.I)


def pages():
    return sorted(glob.glob(os.path.join(ROOT, '*.html')))


def inline_scripts(html):
    for attrs, body in SCRIPT.findall(html):
        attrs = attrs or ''
        if SRC_ATTR.search(attrs):
            continue
        kind = TYPE_ATTR.search(attrs)
        if (kind.group(1).lower() if kind else '') not in JS_TYPES:
            continue  # JSON-LD and other data blocks never execute
        yield body


def script_hashes():
    found = set()
    for page in pages():
        with open(page, encoding='utf-8', newline='') as f:
            html = f.read().replace('\r\n', '\n')  # what the browser's parser hashes
        for body in inline_scripts(html):
            digest = hashlib.sha256(body.encode('utf-8')).digest()
            found.add("'sha256-" + base64.b64encode(digest).decode('ascii') + "'")
    return sorted(found)


def pages_with_handlers():
    bad = []
    for page in pages():
        with open(page, encoding='utf-8') as f:
            html = SCRIPT.sub('', f.read())  # handlers built inside scripts are not markup
        if HANDLER.search(html):
            bad.append(os.path.basename(page))
    return bad


def with_hashes(policy, hashes, third_party):
    directives = [d.strip() for d in policy.split(';') if d.strip()]
    out = []
    for d in directives:
        name, *values = d.split()
        if name == 'script-src':
            keep = [v for v in values if v != "'unsafe-inline'" and not v.startswith("'sha256-")]
            values = keep + (["'unsafe-inline'"] if third_party else hashes)
        out.append(' '.join([name] + values))
    return '; '.join(out)


def updated_config(config, hashes):
    for rule in config.get('headers', []):
        for header in rule.get('headers', []):
            if header.get('key', '').lower() == 'content-security-policy':
                header['value'] = with_hashes(header['value'], hashes, rule.get('source') in THIRD_PARTY_SOURCES)
    return config


def main():
    check = '--check' in sys.argv[1:]
    handlers = pages_with_handlers()
    if handlers:
        print('Inline event handlers (onclick= etc.) are blocked by the CSP; use addEventListener in: ' + ', '.join(handlers))
        return 1

    with open(VERCEL_JSON, encoding='utf-8') as f:
        before = f.read()
    hashes = script_hashes()
    after = json.dumps(updated_config(json.loads(before), hashes), indent=2, ensure_ascii=False) + '\n'

    if check:
        if after != before:
            print('vercel.json CSP script hashes are out of date: run python3 tools/csp-hashes.py (npm run build)')
            return 1
        print(f'OK: CSP allows {len(hashes)} inline script hashes, no inline event handlers.')
        return 0
    if after != before:
        with open(VERCEL_JSON, 'w', encoding='utf-8') as f:
            f.write(after)
    print(f'CSP: {len(hashes)} inline script hashes written to vercel.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
