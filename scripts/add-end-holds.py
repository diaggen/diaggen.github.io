#!/usr/bin/env python3
"""Append a real final-frame hold to every website MP4 from a preserved baseline."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--baseline-dir', required=True, type=Path,
                    help='Unmodified videos plus their media-manifest.json')
parser.add_argument('--output-dir', required=True, type=Path)
parser.add_argument('--manifest', required=True, type=Path,
                    help='Destination website media manifest')
parser.add_argument('--seconds', type=int, default=2)
args = parser.parse_args()
assert args.seconds > 0
assert args.baseline_dir.resolve() != args.output_dir.resolve(), 'Preserve baseline sources'
assert shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg and ffprobe are required'
manifest = json.loads((args.baseline_dir / 'media-manifest.json').read_text())
assert all(not entry.get('end_hold_seconds') for entry in manifest['videos']), 'Baseline already contains holds'
args.output_dir.mkdir(parents=True, exist_ok=True)

def render(entry):
    filename = Path(entry['file']).name
    source = args.baseline_dir / filename
    destination = args.output_dir / filename
    temporary = destination.with_suffix('.rendering.mp4')
    assert source.resolve() != destination.resolve()
    assert hashlib.sha256(source.read_bytes()).hexdigest() == entry['sha256'], filename + ': baseline checksum'
    fps = Fraction(entry['video']['r_frame_rate'])
    hold_frames = fps * args.seconds
    assert hold_frames.denominator == 1
    original_frames = int(entry['video']['nb_frames'])
    print(f'Rendering {entry["id"]}: +{args.seconds} s / {int(hold_frames)} frames', flush=True)
    try:
        subprocess.run([
            shutil.which('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-y',
            '-i', str(source), '-map', '0:v:0', '-map', '0:a?',
            '-vf', f'tpad=stop_mode=clone:stop={int(hold_frames)}',
            '-fps_mode', 'passthrough', '-c:v', 'libx264', '-preset', 'medium',
            '-crf', '17', '-threads', '3', '-pix_fmt', 'yuv420p',
            '-c:a', 'copy', '-map_metadata', '0', '-movflags', '+faststart', str(temporary),
        ], check=True)
        result = json.loads(subprocess.check_output([
            shutil.which('ffprobe'), '-v', 'error', '-show_entries',
            'format=duration:stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames',
            '-of', 'json', str(temporary),
        ]))
        video = next(s for s in result['streams'] if s['codec_type'] == 'video')
        for key in ('width', 'height', 'r_frame_rate'):
            assert video[key] == entry['video'][key], filename + ': ' + key
        assert int(video['nb_frames']) == original_frames + hold_frames
        duration = float(result['format']['duration'])
        assert abs(duration - entry['duration_seconds'] - args.seconds) < 0.001
        assert any(s['codec_type'] == 'audio' for s in result['streams']) == entry['has_audio']
        entry['pre_hold_sha256'] = entry['sha256']
        entry['pre_hold_duration_seconds'] = entry['duration_seconds']
        entry['pre_hold_frame_count'] = original_frames
        entry['end_hold_seconds'] = args.seconds
        entry['end_hold_frames'] = int(hold_frames)
        entry['source_processing'] = entry['processing']
        entry['processing'] = (f'Preserved the complete pre-hold website edit at its original speed and dimensions, '
                               f'then appended {int(hold_frames)} copies of its final frame ({args.seconds} s). '
                               'H.264 CRF 17; existing audio stream copied unchanged. Original sources retained.')
        entry['hold_script'] = 'scripts/add-end-holds.py'
        entry['duration_seconds'] = duration
        entry['video'] = video
        entry['sha256'] = hashlib.sha256(temporary.read_bytes()).hexdigest()
        entry['size_bytes'] = temporary.stat().st_size
        temporary.replace(destination)
        print(f'PASS: {entry["id"]} = {duration:.6f} s, {video["nb_frames"]} frames', flush=True)
        return entry
    finally:
        temporary.unlink(missing_ok=True)

with ThreadPoolExecutor(max_workers=3) as pool:
    manifest['videos'] = list(pool.map(render, manifest['videos']))
manifest['description'] = (f'All 14 website MP4s include an additional {args.seconds}-second final-frame hold. '
                           'Source, pre-hold edit and final delivery provenance are recorded separately.')
args.manifest.write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Updated {args.manifest}', flush=True)
