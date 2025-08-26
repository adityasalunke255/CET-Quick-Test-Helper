# CET Question Bank & Mock Tests (No-build, Static)

A fast, resilient, mobile-first practice site for CET. Runs by opening `index.html` (no Node required). Offline-capable via Service Worker.

## Features
- Dashboard with quick actions and weak topics
- Browse with filters and search
- Practice mode with per-question saving
- Timed mock tests with autosave and navigator grid
- Results with scoring and topic mastery persistence
- PWA: caches static assets for offline usage

## Run locally
- Double-click `index.html` to open in your browser.
- For Service Worker to register, use HTTPS or a local server; but the app still works via `file://` using inline dataset.

## Data
- Inline fallback dataset at `data/questions-inline.js`.
- Optionally place a richer `data/questions.json` and enhance loader to fetch it when online.

## Deploy to GitHub Pages
1. Create a repo and push this folder (root contains index.html).
2. On GitHub → Settings → Pages → Source: main branch (root). Save.
3. Site will be live at `https://YOUR_USERNAME.github.io/REPO/`.

## License
MIT — see `LICENSE`.
