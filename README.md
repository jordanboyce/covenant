# Covenant

A simple, mobile-first PWA for reading the scriptures and *Come, Follow Me*
**offline**. It's a clean PDF library — open a document and read it; once opened,
each PDF is cached and works with no connection.

## Add the PDFs

Drop the PDF files into [`public/pdfs/`](public/pdfs/README.md). The expected
filenames and download links are listed there. To add, remove, or rename
documents, edit [`src/data/catalog.js`](src/data/catalog.js).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the production build (with the service worker)
```

## Deploy

Configured for Firebase Hosting (`firebase deploy`) serving `dist/`.

## Tech

Vue 3 + Vite, vue-router, `pdfjs-dist` for rendering, and `vite-plugin-pwa`
(Workbox) for offline caching. No accounts, no telemetry, no backend.
