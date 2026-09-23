# Media and result provenance

## Published video files

There are 14 MP4s in `static/videos/`, each with two added seconds holding its final frame. Before that final delivery edit, nine videos were unchanged source files, four were simulation scenes with close-up insets, and one was a composed Plush comparison. Their SHA-256 checksums and probed metadata are in `static/media-manifest.json`. Posters are still frames sampled from those files; the manifest records each sample time. The main scene retains its original framing and timing in every simulation composition. No video exceeds GitHub's 100 MB file limit.

Source archive: [DiagGen Google Drive folder](https://drive.google.com/drive/folders/1FW5MmvtleQC1Hq1ijwIGCci9wzZzjmpc).

| Website file | Source |
|---|---|
| `overview.mp4` | `DiagGen_cold_open_motivation_v7.mp4` — approved 20.5 s opener master |
| `gallery.mp4` | `gallery_45s_postproduction_v8_1080p.mp4` — full 45 s gallery with flips and the existing subtle attribution |
| `pipeline.mp4` | `DiagGen_method_before_diagnostics_v6.mp4` — 28 s method master |
| `diagnostics.mp4` | `DiagGen_diagnostics_before_repair_v5.mp4` — full 24 s diagnostic explanation |
| `repair-before.mp4` | `usb-hub_baseline_blender.mp4` |
| `repair-after.mp4` | `usb-hub_revised_blender.mp4` |
| `sim-dino.mp4` | Full `twist_dino_in_playroom.mp4`, with a synchronized tracked detail from the same source |
| `sim-dragon.mp4` | Full `play_nailoong.mp4` + `play_nailoong_close-up.mp4` inset |
| `sim-plunger.mp4` | Full `plumbing_with_toilet_plunger.mp4` + cup close-up inset at 15–22 s |
| `sim-sauce.mp4` | Full `spray_sauce_full-view.mp4` + `spray_sauce_close-up.mp4` inset |
| `real-plush.mp4` | Both full Plush archive clips: `real_zed_left_1080p.mp4` + `plush_sim_woven_basket_1080p.mp4` |
| `real-dino.mp4` | `twist_dino_real_vs_sim_blender.mp4` — full 21 s original |
| `real-bottle.mp4` | `squeeze_bottle_real_vs_sim_blender.mp4` — full 16 s original |
| `full-film.mp4` | `DiagGen_full_compilation_v7_bgm.mp4` — approved 178.4 s master, including its existing soundtrack |

The original narrative masters come from the preserved production backup. The simulation, real-world Dino/Bottle, repair clips and Plush ZIP are from the shared Drive folder, with matching close-up copies recovered from the preserved local production backup. The ZIP passed CRC validation. The source videos all passed full decode verification.

The Plush archive's README identifies the real clip and the woven-basket variant as the same 282-frame, 30 fps sequence. The woven-basket version matches the approved compilation's basket appearance. Its simulation uses a recorded AIRBOT trajectory with the documented +50 mm placement adjustment. It is shown as a simulation counterpart, not asserted to be an exact unmodified replay. The full sequences are scaled to 1280×720 per view and encoded side-by-side as one 2560×720, 30 fps video with 9.4 seconds of content, followed by the two-second final hold (11.4 seconds total). No source frames are trimmed and neither view is cropped or retimed. Original source files are preserved separately. The single native player matches Dino and Bottle; only the USB hub comparison retains separate synchronized controls.

The full film is delivered as a native video with the original YouTube link below it. This keeps the requested end-of-page position and shared autoplay behavior without relying on a provider iframe API. The standalone application clips are not extracted from the shortened or accelerated compilation.

## Confirmed v7 lineage

The section masters are the same inputs used by the latest approved `DiagGen_full_compilation_v7_bgm.mp4`. The v7 render script takes the opener and Method/Diagnostics segment unchanged from v6; the v6 script names these source files explicitly:

- Opener + motivation: `DiagGen_cold_open_motivation_v7.mp4` (20.5 s).
- Generation pipeline: `DiagGen_method_before_diagnostics_v6.mp4` (28 s).
- Simulation diagnostics: `DiagGen_diagnostics_before_repair_v5.mp4` (24 s standalone). The full compilation removes 4.1 s from its final static Accept hold and adds section-transition fades; the website keeps the complete standalone master.

The source version numbers are independent of the full compilation version. These three website baselines were checked byte-for-byte against those named masters. The full-film baseline also matches the verified v7 SHA-256 `a08a1266a46cce0d7c07cf062e00a73d4842f0ad29a90695bf90cd25bcc3deb3`.

## Additional final-frame holds

Each published video appends 60 copies of its final decoded frame at the original 30 fps, extending its duration by exactly two seconds. This is encoded in the MP4 itself; it applies equally to autoplay, native controls and direct downloads. Existing action timing, framing and insets are preserved. The USB hub players each receive the same hold so their synchronization and controls are unchanged.

The original v7 full film is 178.4 s; the website delivery is 180.4 s. Its existing AAC soundtrack is copied unchanged and ends at its original time; the added picture hold is silent. Original sources and the pre-hold website edits are preserved outside the published site. The manifest separates pre-hold hashes, durations and frame counts from final delivery values.

Rebuild from a preserved baseline directory containing the MP4s and their original manifest:

```bash
python3 scripts/add-end-holds.py --baseline-dir BASELINE_DIRECTORY --output-dir static/videos --manifest static/media-manifest.json
```

## Simulation inset composition

The four complete main videos play at 1× with a white-bordered close-up at the bottom left. Their content durations are 9 s, 5 s, 22 s and 13.033333 s; with the final holds, playback durations are 11 s, 7 s, 24 s and 15.033333 s. The main views retain all original frames and their original dimensions; the compositions are encoded at H.264 CRF 17 for browser playback.

Dino reuses the full-film edit's tracked crop of the same scene, so its close-up remains exactly synchronized. Dragon uses the matching close-up source. Plunger's seven-second cup close-up is placed at 15–22 seconds using the production edit's visual alignment; the first 15 seconds retain the full scene without a premature replay. Original simulation timestamps were unavailable for that alignment.

Sauce Keeper retains the full 391-frame main view. Its inset follows the full-film treatment of existing source render dropouts at frames 132–133, 357–366 and 370–371: adjacent valid frames cover those brief gaps at their original timestamps. The main video remains continuous and unretimed.

Rebuild with `scripts/compose-simulation.py --source-dir SOURCE_DIRECTORY --output-dir static/videos`. Rebuild Plush with `scripts/compose-plush.py --real REAL_CLIP --simulation SIM_CLIP --output static/videos/real-plush.mp4`. Component checksums and composition details are recorded in the media manifest.

## Method figures and PMSC

The architecture and diagnostic workflow images come from the DiagGen ICRA manuscript's compressed figure exports. Captions are condensed from the manuscript. PMSC (Part–Material Specification Consistency) values are taken from its diagnostics-guided repair experiment and are also present in the linked public PDF:

- Mean before repair: 2.14; mean after repair: 3.43.
- 10 improved, 4 unchanged, 0 declined, among the 14 assets selected for repair from 40 evaluated assets.
- PMSC scores the static part/material specification on a scale from 1 to 5. The chart displays that entire scale and does not present this as a task success rate.

The pairwise dynamic PAIP results are a separate metric and are not mixed into the PMSC chart.

## Presentation credits

The base site retains its Nerfies attribution. Section navigation, lazy media loading and selection behavior are adapted from the supplied local RARM reference. DiagGen's original fonts, colors, buttons and asset viewer remain the visual basis. The existing gallery attribution and simulation wording are preserved.
