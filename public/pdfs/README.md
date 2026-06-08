# PDF library

Drop the scripture and Come, Follow Me PDFs in this folder. The app reads them
straight from here (files in `public/` are served from the site root), and the
service worker caches each one the first time it's opened so it works offline.

## Expected filenames

These are the names listed in `src/data/catalog.js`. Match them exactly, or edit
the catalog to match your filenames.

| File | Document |
|------|----------|
| `triple-combination.pdf`  | Triple Combination (Book of Mormon, D&C, Pearl of Great Price) |
| `holy-bible.pdf`          | Holy Bible (Old & New Testament, KJV) |
| `come-follow-me-2026.pdf` | Come, Follow Me 2026 (Old Testament) |

## Where to get the official PDFs

- Scriptures: <https://www.churchofjesuschrist.org/study/scriptures> — open a
  volume and use the print/PDF option, or the Gospel Library download.
- Come, Follow Me: <https://www.churchofjesuschrist.org/study/manual/come-follow-me-2026>

## Adding or renaming documents

Edit `src/data/catalog.js`. Each entry needs an `id`, `title`, `subtitle`,
`category` (`scriptures` or `cfm`), and a `file` path. Nothing else changes.

## A note on size

Full scripture PDFs can be large. The first open downloads the whole file (then
it's cached). If you'd rather not commit large binaries to git, you can instead
host them elsewhere and point each `file` at an absolute URL — the viewer works
the same either way.
