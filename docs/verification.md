# Implementation verification

Verified locally on 23 September 2026, before commit or push.

## Website behavior

The reusable Playwright suite passed all 19 checks in isolated headless Chrome:

- Five main sections, three Method blocks, and the full film immediately before Citation.
- Deferred media loading, muted autoplay on arrival, offscreen pause/resume and preservation of an intentional pause.
- Synchronized repair playback, seeking, replay and continuous looping.
- All four complete simulation scenes with bottom-left close-up insets, 1× action playback and updated durations including the final holds.
- Plush / Dino / Bottle use the same single-player layout, native controls and 2560×720 comparison format.
- Keyboard tab selection, full-frame aspect ratios and the existing interactive asset viewer.
- Desktop rail placement and no horizontal page overflow at 390, 768 and 1024 px.
- No JavaScript errors or failed local HTTP requests.

Two additional targeted checks passed: a simulated autoplay rejection exposes a working manual-play fallback, and the active item stays visible in the mobile navigation row. Desktop and phone page renders were visually reviewed, including the PMSC results, simulation tabs and real-world comparisons.

The preview server supports byte-range requests; browser seeking was checked against that server. Browser verification used Chrome 153 on macOS. Safari, Firefox and physical mobile devices have not been tested.

## Media integrity

All 14 published MP4s passed SHA-256, byte-count, duration, dimensions, frame-count, audio-presence and full FFmpeg decode checks after the final-hold revision. The files total 122,218,433 bytes. Every output adds exactly 60 frames and two seconds to its preserved pre-hold edit. Decoded samples confirmed that all added frames remain visually identical to the preceding final frame, within one grayscale level of average H.264 encoding variation. The full film's original AAC stream was separately verified unchanged.

The opener, pipeline, diagnostics and full-film baselines were checked against the masters named in the v7 → v6 production scripts. All four source hashes match. The website uses the complete standalone diagnostics source, including the 4.1-second final hold omitted from the compilation. Final frames of the opener and both Method clips were visually reviewed after extension.

The Method section layout, shared playback JavaScript and site CSS remain unchanged. Both USB hub clips now have matching two-second holds, and their synchronized seeking and looping checks pass. Simulation insets and the standardized desktop/phone Plush player remain in place.

The source selections and manuscript result definitions are recorded in [media provenance](media-provenance.md); exact media metadata and hashes are in [`static/media-manifest.json`](../static/media-manifest.json). HTML asset references, unique IDs, anchors and ARIA targets also passed validation.

## Reproduction

See the [README](../README.md#verification) for preview and verification commands. The browser suite saves a JSON report and page renders in the configured QA directory.
