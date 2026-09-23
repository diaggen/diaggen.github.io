#!/usr/bin/env python3
"""Join the complete real and simulated Plush clips into one native-player video."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--real', required=True, type=Path)
parser.add_argument('--simulation', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
ffprobe = shutil.which('ffprobe')
ffmpeg = shutil.which('ffmpeg')
assert ffprobe and ffmpeg, 'FFmpeg and ffprobe are required'
assert args.output.resolve() not in (args.real.resolve(), args.simulation.resolve()), 'Keep source files intact'

def probe(path):
    result = json.loads(subprocess.check_output([
        ffprobe, '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration',
        '-of', 'json', str(path),
    ]))
    return result['streams'][0], float(result['format']['duration'])

real, real_duration = probe(args.real)
simulation, sim_duration = probe(args.simulation)
for stream in (real, simulation):
    assert (stream['width'], stream['height']) == (1920, 1080)
    assert stream['r_frame_rate'] == '30/1' and int(stream['nb_frames']) == 282
assert abs(real_duration - sim_duration) < 0.001

args.output.parent.mkdir(parents=True, exist_ok=True)
subprocess.run([
    ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
    '-i', str(args.real), '-i', str(args.simulation),
    '-filter_complex',
    '[0:v]scale=1280:720:flags=lanczos,setsar=1[left];'
    '[1:v]scale=1280:720:flags=lanczos,setsar=1[right];'
    '[left][right]hstack=inputs=2[out]',
    '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(args.output),
], check=True)
output, duration = probe(args.output)
assert (output['width'], output['height']) == (2560, 720)
assert output['nb_frames'] == real['nb_frames'] and output['r_frame_rate'] == real['r_frame_rate']
assert abs(duration - real_duration) < 0.001
print(f'Created {args.output}: 282 frames, 30 fps, {duration:.1f} s; both full frames preserved')
