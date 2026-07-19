# Ketek Writer

A small web tool for writing keteks — the Stormlight Archive poetic form that
reads (roughly) the same forward and backward, with some flex allowed for
verb tense, plurality, and punctuation.

## How it works

Write the first half of the poem in **Forward**; a **Mirror** of it is
generated live, word for word, in grey. Click any mirrored word to override
it (e.g. fix "illuminating" &rarr; "illuminate") — edited words stay locked
to their source word as you keep writing, and revert to auto-tracking if you
double-click them back to the ghost text, or use the small `ing`/`s`/`Aa`/`≈`
tools that appear on hover (the `≈` looks up similar words via the free
[Datamuse API](https://www.datamuse.com/api/)). An optional **Pivot** field
holds a single shared center word/phrase. A **Five-section** mode switches to
the traditional structure: five sections with a shared pivot, mirrored back
S5&rarr;S1.

Hover a word to see its mirror partner light up. Undo/redo (buttons or
Ctrl+Z / Ctrl+Shift+Z), a saved-drafts library, an em-dash-at-pivot
formatting toggle, and Copy/Download buttons round it out.

Everything autosaves to `localStorage`, per-browser, per-device — there are
no accounts and nothing is synced. The only data that ever leaves your
browser is the single word you click the `≈` tool on, sent to the Datamuse
API to fetch suggestions.

No build step, no dependencies — just open `index.html` in a browser.

## Project setup

There isn't one — this is plain HTML/CSS/JS by design (no Node.js was
available in the dev environment when this was built). If the project later
outgrows a single page, revisit moving to a small framework/bundler.
