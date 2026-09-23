#!/usr/bin/env python3
"""Keep each full simulation sequence, with a synchronized lower-left detail inset."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

# Timing and Dino tracking follow the approved full-film production edit.
CASES = {
    'dino': {
        'source': 'twist_dino_in_playroom.mp4',
        'detail': 'twist_dino_in_playroom.mp4',
        'width': 1920, 'height': 1080, 'frames': 270,
        'track': [[0,474],[1,474],[2,433],[3,318],[4,280],[4.5,303],
                  [5,351],[6,342],[7,399],[8,353],[9,353]],
    },
    'dragon': {
        'source': 'play_nailoong.mp4', 'detail': 'play_nailoong_close-up.mp4',
        'width': 1920, 'height': 1080, 'frames': 150,
    },
    'plunger': {
        'source': 'plumbing_with_toilet_plunger.mp4',
        'detail': 'plumbing_with_toilet_plunger_cup_close-up.mp4',
        'width': 1920, 'height': 1200, 'frames': 660, 'offset': 15,
    },
    'sauce': {
        'source': 'spray_sauce_full-view.mp4', 'detail': 'spray_sauce_close-up.mp4',
        'width': 1920, 'height': 1080, 'frames': 391,
        'source_dropouts': [[132,133],[357,366],[370,371]],
    },
}

def tracked_crop(knots):
    expression = str(knots[-1][1])
    for (t0, y0), (t1, y1) in reversed(list(zip(knots, knots[1:]))):
        u = f'((t-{t0})/{t1-t0})'
        smooth = f'({u}*{u}*(3-2*{u}))'
        expression = f'if(lt(t,{t1}),({y0}+({y1-y0})*{smooth}),{expression})'
    return f"crop=576:324:736:'{expression}'"

def render(name, case, sources, outputs):
    detail = ['setpts=PTS-STARTPTS']
    if case.get('track'):
        detail.append(tracked_crop(case['track']))
    if case.get('source_dropouts'):
        # Same treatment as the approved film: repeat adjacent valid frames over
        # render dropouts, preserving timestamps and the continuous main view.
        excluded = '+'.join(f'between(n,{a},{b})' for a,b in case['source_dropouts'])
        detail += [f"select='not({excluded})'", 'fps=30']
    detail += ['scale=576:-2:flags=lanczos', 'setsar=1',
               'pad=iw+8:ih+8:4:4:color=white']
    offset = case.get('offset', 0)
    if offset:
        detail.append(f'setpts=PTS+{offset}/TB')
    graph = ('[0:v]setpts=PTS-STARTPTS,setsar=1[main];'
             f"[1:v]{','.join(detail)}[detail];"
             '[main][detail]overlay=x=32:y=main_h-overlay_h-56:'
             f"eof_action=pass:repeatlast=0:enable='gte(t,{offset})'[out]")
    destination = outputs / f'sim-{name}.mp4'
    print(f'Rendering {name}: full scene + bottom-left close-up', flush=True)
    subprocess.run([
        shutil.which('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(sources / case['source']), '-i', str(sources / case['detail']),
        '-filter_complex_threads', '2', '-filter_complex', graph, '-map', '[out]',
        '-frames:v', str(case['frames']), '-an', '-c:v', 'libx264',
        '-preset', 'medium', '-crf', '17', '-threads', '4', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', str(destination),
    ], check=True)
    result = json.loads(subprocess.check_output([
        shutil.which('ffprobe'), '-v', 'error', '-show_entries',
        'stream=width,height,r_frame_rate,nb_frames:format=duration',
        '-of', 'json', str(destination),
    ]))
    video = result['streams'][0]
    assert (video['width'],video['height']) == (case['width'],case['height'])
    assert int(video['nb_frames']) == case['frames'] and video['r_frame_rate'] == '30/1'
    assert abs(float(result['format']['duration']) - case['frames']/30) < 0.001

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    assert shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg and ffprobe are required'
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, case in CASES.items():
        render(name, case, args.source_dir, args.output_dir)
