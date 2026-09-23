#!/usr/bin/env python3
"""Give the page's CSS and JS content-addressed URLs so deployments cannot mix versions."""
import argparse
import hashlib
from pathlib import Path
import re

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true', help='Verify generated files and HTML references without writing')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
page = root / 'index.html'
html = page.read_text()
for folder, extension in [('css', 'css'), ('js', 'js')]:
    source = root / 'static' / folder / f'site.{extension}'
    content = source.read_bytes()
    digest = hashlib.sha256(content).hexdigest()[:12]
    filename = f'site.{digest}.{extension}'
    destination = source.with_name(filename)
    url = f'./static/{folder}/{filename}'
    pattern = rf'\./static/{folder}/site(?:\.[0-9a-f]{{12}})?\.{extension}(?=["\'])'
    references = re.findall(pattern, html)
    assert len(references) == 1, f'Expected one page reference for {source.name}'
    if args.check:
        assert references[0] == url, f'Run this script to update the {extension} URL'
        assert destination.read_bytes() == content, f'Generated {extension} differs from its source'
    else:
        destination.write_bytes(content)
        html = re.sub(pattern, url, html)
    print(('PASS: ' if args.check else 'Versioned: ') + url)
if not args.check:
    page.write_text(html)
# Keep previous hashed files: a visitor may still have an earlier HTML document cached.
