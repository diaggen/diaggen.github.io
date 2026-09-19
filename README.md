# DiagGen: Agentic Generation of Deformable Assets with Sim-based Diagnostics for Robotic Simulation

This is the repository for the **DiagGen** project website. DiagGen turns a single in-the-wild image into a simulation-ready deformable asset through a generate–simulate–diagnose–refine loop. The website includes the project abstract and an interactive Three.js viewer for six generated assets, with textured-surface, tetrahedral-boundary, source-detail, and part-segmentation views.

This website is adapted from the [Nerfies website template](https://github.com/nerfies/nerfies.github.io). The original [Nerfies project page](https://nerfies.github.io/) and citation are credited below.

## Preview locally

Because the interactive viewer loads assets with `fetch`, serve the repository with a local HTTP server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in a browser.

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
