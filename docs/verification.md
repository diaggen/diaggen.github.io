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
- Horizontal navigation placement below the publication links, sticking at the top beyond the header, clickable section jumps that keep headings below the bar, active-section highlighting, centered content and no horizontal page overflow at 390, 768 and 1024 px.
- No JavaScript errors or failed local HTTP requests.

A previous targeted autoplay check confirmed that a simulated rejection exposes a working manual-play fallback. The navigation now wraps on mobile so every section link is visible without horizontal scrolling. Desktop and phone page renders were visually reviewed, including the PMSC results, simulation tabs and real-world comparisons.

The sticky navigation also passed the warm-cache regression. The three contribution paragraphs use a tighter 1.6 line height; section divider and Method block spacing remain unchanged. Desktop and phone renders of the sticky bar and phone contribution text were visually reviewed.

The floating navigation revision passed all 19 browser checks and four cache checks. Its sticky state uses rounded corners, a pale-green background, a soft shadow and a rounded active-section highlight; its initial placement below the publication links retains the quieter styling. Section jumps include the new 10px top gap. Desktop and phone renders were visually reviewed.

The preview server supports byte-range requests; browser seeking was checked against that server. Browser verification used Chrome 153 on macOS. Safari, Firefox and physical mobile devices have not been tested.

## Navigation deployment regression

The reported vertical list was reproduced with the horizontal-navigation HTML and cached sidebar CSS. GitHub Pages returned `Cache-Control: max-age=600` for the stylesheet. Fresh-browser checks alone had missed this returning-visitor case.

The broken navigation commit was reverted and pushed first. The rollback then received versioned CSS/JavaScript filenames, and its deployed HTML was verified. The corrected horizontal navigation uses new content-hash filenames; previous generated assets remain available for cached documents.

Four cache-regression checks pass using a real warm browser cache: reproduction of the original failure, correct horizontal navigation after the fix, compatibility with the restored sidebar document, and mobile links without overflow. The main 19-check browser suite also passes. Asset-generation consistency is now checked before that suite runs.

## Media integrity

All 14 published MP4s passed SHA-256, byte-count, duration, dimensions, frame-count, audio-presence and full FFmpeg decode checks after the final-hold revision. The files total 122,218,433 bytes. Every output adds exactly 60 frames and two seconds to its preserved pre-hold edit. Decoded samples confirmed that all added frames remain visually identical to the preceding final frame, within one grayscale level of average H.264 encoding variation. The full film's original AAC stream was separately verified unchanged.

The opener, pipeline, diagnostics and full-film baselines were checked against the masters named in the v7 → v6 production scripts. All four source hashes match. The website uses the complete standalone diagnostics source, including the 4.1-second final hold omitted from the compilation. Final frames of the opener and both Method clips were visually reviewed after extension.

The navigation revision changes the header layout and removes the sidebar spacing. Media playback behavior and the Method section structure remain intact. Both USB hub clips now have matching two-second holds, and their synchronized seeking and looping checks pass. Simulation insets and the standardized desktop/phone Plush player remain in place.

The source selections and manuscript result definitions are recorded in [media provenance](media-provenance.md); exact media metadata and hashes are in [`static/media-manifest.json`](../static/media-manifest.json). HTML asset references, unique IDs, anchors and ARIA targets also passed validation.

## Reproduction

See the [README](../README.md#verification) for preview and verification commands. The browser suite saves a JSON report and page renders in the configured QA directory.
