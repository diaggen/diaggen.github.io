# DiagGen: Agentic Generation of Deformable Assets with Sim-based Diagnostics for Robotic Simulation

This is the repository for the **DiagGen** project website. DiagGen turns a single in-the-wild image into a simulation-ready deformable asset through a generate–simulate–diagnose–refine loop. The page includes an overview, an interactive six-asset Three.js gallery, generation and diagnostic explanations, repair comparisons and PMSC results, four simulation applications, and three real-world comparisons. The complete project film appears immediately before the citation.

This website is adapted from the [Nerfies website template](https://github.com/nerfies/nerfies.github.io). The original [Nerfies project page](https://nerfies.github.io/) and citation are credited below.

## Preview locally

The site is plain HTML, CSS and JavaScript; no build step is required. Serve it over HTTP so the interactive viewer can fetch assets. Use the included preview server to support byte-range requests and seeking in the original videos:

```bash
python3 scripts/serve.py --port 8000
```

Then open <http://localhost:8000/> in a browser.

## Media and behavior

- `static/media-manifest.json` records original filenames, source links, SHA-256 hashes, dimensions, duration, frame counts and poster timestamps. All 14 MP4s hold their final frame for two additional seconds (60 frames at 30 fps). The complete content still plays at 1× with its existing framing. Four simulation videos have bottom-left close-up insets; Plush combines its two complete views into one side-by-side video. Source and pre-hold hashes remain recorded separately from delivery hashes.
- `static/js/site.js` adapts the local RARM reference site's section-spy and lazy `data-src` approach. Only visible, active media autoplays; leaving the viewport or switching tabs pauses it. Returning resumes from the same time, while explicit tab selection starts the selected clip from the beginning. A deliberate user pause is preserved.
- All videos start muted and play at 1×. The full film uses the same native player and keeps a link to YouTube. Native media avoids a separate third-party autoplay dependency.
- Plush, Dino and Bottle share a single side-by-side video player with native controls. Plush uses the archive's full real camera clip and matching woven-basket simulation (both 282 frames at 30 fps). The USB hub repair comparison retains its existing synchronized controls.
- The existing Three.js viewer loads near the gallery and suspends its render loop offscreen. Display modes, camera controls, source detail and part segmentation are preserved.
- A horizontal section navigation bar sits below the Paper / arXiv / Code buttons, highlights the current section and wraps into rows on smaller screens. Reduced-motion preferences disable decorative transitions and smooth scrolling, while videos retain visible playback controls.

See [media provenance](docs/media-provenance.md) for source selections, inset timing and result definitions. The simulation insets and Plush comparison can be rebuilt with `scripts/compose-simulation.py` and `scripts/compose-plush.py`. Apply the final delivery step with `scripts/add-end-holds.py` from a preserved baseline directory containing the pre-hold MP4s and manifest. The scripts’ `--help` output lists source and destination arguments; the hold script rejects already-padded baselines to prevent stacking holds.

## Verification

Check HTML references and the original media with Python and FFmpeg installed:

```bash
python3 scripts/verify-media.py --decode --holds
```

Optional browser checks use Node.js and Playwright. Install Playwright in your development environment (`npm install --no-save --package-lock=false playwright`), install its browser (`npx playwright install chromium`), start the preview server, then run:

```bash
SITE_URL=http://127.0.0.1:8000 node scripts/verify-site.cjs
```

Set `CHROME_EXECUTABLE` to use an existing Chrome binary, and `SITE_QA_DIR` to place reports and page screenshots outside the default ignored `.qa/` directory. The checks launch an isolated headless browser; they do not access a desktop browser profile or capture the desktop screen.

The browser checks cover page order, lazy loading, autoplay and manual pause, synchronized seeking, every experiment tab, durations including the final holds, keyboard navigation, the 3D viewer, mobile overflow and local request failures.

## Nerfies attribution

If you use or build upon the Nerfies website template, please cite:

```bibtex
@inproceedings{park2021nerfies,
  author    = {Park, Keunhong and Sinha, Utkarsh and Barron, Jonathan T. and Bouaziz, Sofien and Goldman, Dan B. and Seitz, Steven M. and Martin-Brualla, Ricardo},
  title     = {Nerfies: Deformable Neural Radiance Fields},
  booktitle = {Proceedings of the IEEE/CVF International Conference on Computer Vision (ICCV)},
  year      = {2021},
}
```

## Website license

<a rel="license" href="http://creativecommons.org/licenses/by-sa/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-sa/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0 International License</a>.
