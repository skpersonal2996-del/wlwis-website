# We Love Working In Space (WLWIS)

Landing page for the WLWIS design & development studio.

- **Loader**: Higgsfield-generated astronaut video drives a 0–100% counter, then "Enter with / without sound".
- **Hero → 03**: live three.js scene (a particle astronaut inside an orbiting ring) that spins faster on scroll and reacts to the cursor, then warps away.
- **04 / What we can make**: scroll-driven build: website wireframe → interface → phone app → software dashboard.
- **05 / The process**: expanding panels with small animated space visuals.
- Optional ambient sound, generated live with the Web Audio API.

## Run locally

It's a static site with no build step. Serve the folder and open it:

```bash
python3 -m http.server 5178
```

Then visit http://localhost:5178.

## Files

- `index.html`: page, styles, loader, sections, sound
- `space.js`: the three.js scene (loaded as an ES module; three.js comes from a CDN)
- `assets/`: loader video, fallback still, astronaut model

## Credits

- Astronaut 3D model: "Astronaut" by Poly by Google, licensed [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) (via modelviewer.dev shared assets). This credit must stay visible wherever the site is published.
- [three.js](https://threejs.org) (MIT)
- Fonts: Michroma, Sora, Manrope and JetBrains Mono from Google Fonts (SIL Open Font License)
