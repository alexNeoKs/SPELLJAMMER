# Spelljammer Space Battle — Prometheus / Library build

A cinematic Three.js backdrop for a tabletop Spelljammer battle. This build uses the supplied **Prometheus OBJ** for the player capital ship and the supplied **Galleon STL** for a detailed close-range enemy layer. Hundreds of additional lightweight galleons fill the distant armada so the encounter can stay dense without turning a browser tab into a slideshow.

The giant **Library Cathedral** is procedurally modelled after the silhouette of the supplied Santiago de Compostela 3MF. The source 3MF expands to more than 500 MB of mesh XML, so this web build intentionally does **not** ship the complete 3MF to every GitHub Pages visitor.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Main controls

- **C** — cycle camera: Cinematic / Broadside / Chase / Helm / Destination
- **I** — cycle intensity: Drift / Battle / Chaos
- **V** — player volley
- **W** — enemy wave
- **P** — pause / resume
- **S** — **SHIELDS ARE DOWN** narration event
- **L** — **THE LIBRARY LEARNS** narration event

### Flight vector

- **Left Arrow** — turn port
- **Right Arrow** — turn starboard
- **Up Arrow** — level / forward
- **R** — ascend
- **F** — descend
- **G** — set course directly toward the Library Cathedral

The same flight-vector controls are available in the top-right panel.

## Battle density

- Drift: 240 hostiles
- Battle: 380 hostiles
- Chaos: 520 hostiles

The 30 nearest ships use the full STL geometry through instancing. The rest use low-cost procedural galleon geometry. Player and enemy bolts, explosions, sparks, and manuscript pages also use pooling/instancing where practical.

## Deploy to GitHub Pages

1. Create a GitHub repository and copy this project into it.
2. Push the project to the `main` branch.
3. Open **Settings → Pages** and choose **GitHub Actions** as the source.
4. The included workflow installs dependencies, builds the Vite project, and deploys `dist/`.

The Vite config uses `base: './'`, so it works under a repository path such as `https://username.github.io/spelljammer-space-battle/`.

## Asset notes

- `public/models/prometheus.obj` — supplied player ship.
- `public/models/galleon-ship.stl` — supplied Spelljammer galleon.
- `public/reference/cathedral-reference.png` — thumbnail extracted from the supplied 3MF and kept only as a design reference.
- The original 68 MB 3MF is **not** required by the running site.


## V3 battle pacing changes

- Hostile fleet is fixed at **1,000 ships** in every intensity mode.
- Proxy Spelljammer sails are substantially smaller and the overall enemy scale is reduced.
- Enemy craft now fly much faster, steer through the Prometheus, pass it, and recycle only after travelling well behind it.
- `Enemy Wave` / `W` cycles the active fleet steering pattern without teleporting ships:
  - Swarm
  - Pincer
  - Crosswind
  - Helix
- `The Library` / `G` is now a three-stage DM-controlled approach:
  1. 20 seconds to 20% of the route.
  2. 15 seconds to 50% of the route.
  3. 20 seconds to the final stand-off point in front of the Library.
- The ship holds position after each stage until the Library control is pressed again.
