#!/usr/bin/env python3
"""Check local references and media integrity, with optional decode and final-hold checks."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import argparse
import concurrent.futures
import hashlib
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--decode', action='store_true')
parser.add_argument('--holds', action='store_true', help='Check the added two-second final-frame holds')
args = parser.parse_args()

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.refs = []
        self.targets = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for key in ('href', 'src', 'data-src', 'poster'):
            value = attrs.get(key)
            if not value or urlsplit(value).scheme or value.startswith('//'):
                continue
            if value.startswith('#'):
                self.targets.append(value[1:])
            else:
                self.refs.append(unquote(urlsplit(value).path))
        for key in ('aria-controls', 'aria-labelledby', 'aria-describedby'):
            self.targets.extend(attrs.get(key, '').split())

page = Page()
page.feed((root / 'index.html').read_text())
assert len(set(page.ids)) == len(page.ids), 'Duplicate HTML IDs'
assert all(target in page.ids for target in page.targets), 'Missing anchor or ARIA target'
assert all((root / ref).is_file() for ref in page.refs), 'Missing HTML asset'
print('PASS: HTML asset references, unique IDs, anchors and ARIA targets')

manifest = json.loads((root / 'static/media-manifest.json').read_text())
ffprobe = shutil.which('ffprobe')
ffmpeg = shutil.which('ffmpeg')
assert ffprobe, 'ffprobe is required'
if args.decode or args.holds:
    assert ffmpeg, 'ffmpeg is required with --decode or --holds'

def verify(entry):
    file = root / entry['file']
    assert file.stat().st_size == entry['size_bytes'], entry['id'] + ': byte count'
    assert hashlib.sha256(file.read_bytes()).hexdigest() == entry['sha256'], entry['id'] + ': checksum'
    actual = json.loads(subprocess.check_output([
        ffprobe, '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames', '-of', 'json', str(file),
    ]))
    video = next(stream for stream in actual['streams'] if stream['codec_type'] == 'video')
    for field in ('width', 'height', 'r_frame_rate', 'nb_frames'):
        assert video[field] == entry['video'][field], f"{entry['id']}: {field}"
    assert abs(float(actual['format']['duration']) - entry['duration_seconds']) < 0.001
    assert any(s['codec_type'] == 'audio' for s in actual['streams']) == entry['has_audio']
    assert (root / entry['poster']).is_file()
    if args.decode:
        result = subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-threads', '2', '-i', str(file), '-f', 'null', '-'], capture_output=True, text=True)
        assert result.returncode == 0, f"{entry['id']}: decode failed: {result.stderr}"
    if args.holds:
        assert entry['end_hold_seconds'] == 2 and entry['end_hold_frames'] == 60
        assert int(video['nb_frames']) == entry['pre_hold_frame_count'] + 60
        assert abs(entry['duration_seconds'] - entry['pre_hold_duration_seconds'] - 2) < 0.001
        # Decode the tail at a small fixed size. Lossy H.264 can introduce tiny
        # pixel differences; all 60 added frames must remain visually identical
        # to the preceding final source frame, within one grayscale level.
        raw = subprocess.check_output([
            ffmpeg, '-v', 'error', '-sseof', '-2.1', '-i', str(file),
            '-an', '-vf', 'scale=128:72', '-pix_fmt', 'gray', '-fps_mode', 'passthrough',
            '-f', 'rawvideo', '-',
        ])
        pixels = 128 * 72
        assert len(raw) % pixels == 0
        frames = [raw[start:start+pixels] for start in range(0, len(raw), pixels)][-61:]
        assert len(frames) == 61, entry['id'] + ': final-frame sample count'
        largest_difference = max(sum(abs(a-b) for a,b in zip(frames[0], frame)) / pixels for frame in frames[1:])
        assert largest_difference < 1, f"{entry['id']}: final hold changes ({largest_difference:.4f})"
    return entry['id']

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for name in pool.map(verify, manifest['videos']):
        print('PASS:', name, '(hash, dimensions, duration, frame count, audio'
              + (', full decode' if args.decode else '') + (', 2 s final hold' if args.holds else '') + ')')
print('Total MP4 bytes:', sum(e['size_bytes'] for e in manifest['videos']))
