# Ketek Writer

A small web tool for writing keteks — the Stormlight Archive poetic form that
reads (roughly) the same forward and backward, with some flex allowed for
verb tense, plurality, and punctuation.

## Phase 1 (current)

Write the first half of the poem in **Forward**; a **Mirror** of it is
generated live, word for word, in grey. Click any mirrored word to override
it (e.g. fix "illuminating" &rarr; "illuminate") — edited words stay locked
to their source word as you keep writing, and revert to auto-tracking if you
double-click them back to the ghost text. An optional **Pivot** field holds
a single shared center word/phrase. Everything autosaves to `localStorage`.

No build step, no dependencies — just open `index.html` in a browser.

## Roadmap

- **Phase 2**: word-pair alignment highlighting, five-section structural
  mode (the looser, thought-per-section ketek style), lightweight
  tense/inflection suggestions, saved draft history.
- **Phase 3**: formatted export, a built-in reference library of example
  keteks, rhyme/synonym lookup, hosted deployment.

## Project setup

There isn't one — this is plain HTML/CSS/JS by design (no Node.js was
available in the dev environment when this was built). If the project later
outgrows a single page, revisit moving to a small framework/bundler.
