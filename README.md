# CET Question Bank — No-NPM Static App

This is a static React + Tailwind prototype that runs by opening `index.html`. No npm, no build tools.

## Run
- Open `index.html` in a modern browser (Chrome/Edge).
- Everything loads from CDN and local files.

## Features
- Browse questions with filters and search.
- Practice mode (untimed) with keyboard nav (N/P keys).
- Test mode: 30 random questions, timer, autosave to localStorage, submit to see results and review.
- Explanations with steps, bookmarks/flags.
- Dashboard with recent scores and weak topics (from localStorage mastery — basic).

## Notes
- Data is in `data/questions.js` as a global array `window.CET_QUESTIONS` to avoid file:// CORS.
- Mock API is `mockServer.js` which intercepts `/api/*` calls and returns from the dataset with latency.
- No TTS or external APIs; no secrets are embedded.

## Keyboard
- Next: `N` or Right Arrow
- Prev: `P` or Left Arrow

## Customize
- Add more questions to `data/questions.js`.
- Styling uses Tailwind via CDN in `index.html`.
