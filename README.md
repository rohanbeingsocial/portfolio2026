# portfolio2026

Rohan Deogaonkar's personal portfolio site.

Live: https://rohanbeingsocial.github.io/portfolio2026/

## Structure

- `index.html` — the whole site (a Claude Design `.dc.html` document: `<x-dc>` template + `data-dc-script` component logic)
- `support.js` — the `dc-runtime` bundle that compiles and mounts the `<x-dc>` document; loads React 18 UMD from unpkg at runtime
- `demo-slot.js` — `<demo-slot>` custom element used for the project demo videos
- `uploads/` — project demo videos
- `Ixus115/`, `Ixus970/`, `Iphone16pro/` — photography gallery, grouped by camera

## Local preview

Needs to be served over HTTP (the runtime fetches sibling files):

```
python -m http.server 8000
```

Then open http://localhost:8000/

## Deployment

GitHub Pages serves `main` from the repo root. `.nojekyll` is present so paths
starting with `_` and the uppercase asset directories are served as-is.
