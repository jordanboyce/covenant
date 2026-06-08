<template>
  <div class="pdf">
    <!-- Scroller holds the rendered pages -->
    <div ref="scrollerEl" class="pdf-scroller" @scroll.passive="onScroll">
      <div v-if="status === 'loading'" class="pdf-state">
        <div class="spinner" />
        <p>Loading…</p>
      </div>

      <div v-else-if="status === 'missing'" class="pdf-state">
        <h2>PDF not found</h2>
        <p class="muted">
          This document hasn’t been added yet. Drop the file at:
        </p>
        <code>public{{ srcPath }}</code>
        <p class="muted small">See <code>public/pdfs/README.md</code> for where to get the official PDFs.</p>
      </div>

      <div v-else-if="status === 'error'" class="pdf-state">
        <h2>Couldn’t open this PDF</h2>
        <p class="muted">{{ errorMsg }}</p>
      </div>

      <div ref="pagesEl" class="pdf-pages" :class="{ zoomed: zoom !== 1 }" />
    </div>

    <!-- Floating controls -->
    <div v-if="status === 'ready'" class="pdf-controls">
      <button class="ctl" @click="zoomOut" aria-label="Zoom out">−</button>
      <button class="ctl page-ind" @click="resetZoom" :aria-label="`Page ${currentPage} of ${numPages}`">
        {{ currentPage }} / {{ numPages }}
      </button>
      <button class="ctl" @click="zoomIn" aria-label="Zoom in">+</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps({
  src:    { type: String, required: true },
  docId:  { type: String, default: '' },
  // When > 0, jump to this page once the document is ready (set from search/TOC).
  goTo:   { type: Number, default: 0 },
})

const scrollerEl = ref(null)
const pagesEl    = ref(null)
const status     = ref('loading')   // loading | ready | missing | error
const errorMsg   = ref('')
const numPages   = ref(0)
const currentPage = ref(1)
const zoom       = ref(1)
const srcPath    = ref(props.src)

let pdf = null
let slots = []                 // index 0 unused; slots[n] = page wrapper div
let pageRatios = []            // slots[n] = width/height ratio
let observer = null
let containerWidth = 0
let resizeObs = null
let scrollSaveTimer = null
const WINDOW = 3               // keep canvases within ±WINDOW pages of current

const storageKey = () => `covenant:lastpage:${props.docId || props.src}`

onMounted(load)
onBeforeUnmount(cleanup)

watch(() => props.src, () => { cleanup(); load() })

// Jump when the target page changes while staying in the same document
// (e.g. tapping another search result for the book you're already reading).
watch(() => props.goTo, (n) => { if (n > 0 && status.value === 'ready') jumpTo(n) })

function jumpTo(n) {
  if (n < 1 || n > numPages.value) return
  // Make sure the destination and its neighbours render, then scroll to it.
  for (let i = n - 1; i <= n + 1; i++) {
    if (i >= 1 && i <= numPages.value) renderPage(i)
  }
  requestAnimationFrame(() => {
    scrollToPage(n)
    currentPage.value = n
    saveLastPage()
  })
}

async function load() {
  status.value = 'loading'
  srcPath.value = props.src
  try {
    // Fetch the whole file once (so the service worker caches it for offline),
    // then hand the bytes to pdf.js. We check the response ourselves because a
    // missing file is served as the SPA fallback (index.html, status 200), not
    // a 404 — detect that and show a friendly "not added yet" message.
    const res = await fetch(props.src).catch(() => null)
    if (!res || res.status === 404) { status.value = 'missing'; return }
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct.includes('text/html')) { status.value = 'missing'; return }

    const data = await res.arrayBuffer()
    pdf = await pdfjsLib.getDocument({ data }).promise
    numPages.value = pdf.numPages
    status.value = 'ready'
    await buildSlots()
    if (props.goTo > 0) jumpTo(props.goTo)
    else restoreLastPage()
  } catch (e) {
    if (e?.name === 'MissingPDFException' || /missing pdf|404|not found/i.test(e?.message || '')) {
      status.value = 'missing'
    } else {
      status.value = 'error'
      errorMsg.value = e?.message || 'Unknown error'
    }
  }
}

function measureWidth() {
  const el = scrollerEl.value
  if (!el) return 0
  const cs = getComputedStyle(el)
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  return el.clientWidth - pad
}

async function buildSlots() {
  const host = pagesEl.value
  host.innerHTML = ''
  slots = new Array(numPages.value + 1)
  pageRatios = new Array(numPages.value + 1)
  containerWidth = measureWidth()

  // Use page 1 to estimate aspect ratio for placeholders (scripture pages are uniform).
  const first = await pdf.getPage(1)
  const vp = first.getViewport({ scale: 1 })
  const baseRatio = vp.width / vp.height

  for (let n = 1; n <= numPages.value; n++) {
    const slot = document.createElement('div')
    slot.className = 'pdf-page'
    slot.dataset.page = String(n)
    slot.style.aspectRatio = `${vp.width} / ${vp.height}`
    pageRatios[n] = baseRatio
    host.appendChild(slot)
    slots[n] = slot
  }

  setupObserver()
  setupResize()
}

function setupObserver() {
  if (observer) observer.disconnect()
  observer = new IntersectionObserver(onIntersect, {
    root: scrollerEl.value,
    rootMargin: '200% 0px',   // render a couple screens ahead
    threshold: 0.01,
  })
  for (let n = 1; n <= numPages.value; n++) observer.observe(slots[n])
}

function setupResize() {
  if (resizeObs) resizeObs.disconnect()
  resizeObs = new ResizeObserver(() => {
    const w = measureWidth()
    if (Math.abs(w - containerWidth) > 1) {
      containerWidth = w
      rerenderAll()
    }
  })
  resizeObs.observe(scrollerEl.value)
}

function onIntersect(entries) {
  for (const e of entries) {
    const n = Number(e.target.dataset.page)
    if (e.isIntersecting) renderPage(n)
  }
}

async function renderPage(n) {
  const slot = slots[n]
  if (!slot || slot.dataset.rendered === '1' || slot.dataset.rendering === '1') return
  slot.dataset.rendering = '1'
  try {
    const page = await pdf.getPage(n)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const displayW = containerWidth * zoom.value
    const base = page.getViewport({ scale: 1 })
    const cssScale = displayW / base.width
    const viewport = page.getViewport({ scale: cssScale * dpr })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = displayW + 'px'
    canvas.style.height = 'auto'

    const ctx = canvas.getContext('2d', { alpha: false })
    await page.render({ canvasContext: ctx, viewport }).promise

    slot.replaceChildren(canvas)
    slot.dataset.rendered = '1'
  } catch (_) {
    // leave as placeholder; will retry on next intersect
  } finally {
    slot.dataset.rendering = '0'
  }
}

function clearPage(n) {
  const slot = slots[n]
  if (!slot || slot.dataset.rendered !== '1') return
  slot.replaceChildren()
  slot.dataset.rendered = '0'
}

function rerenderAll() {
  for (let n = 1; n <= numPages.value; n++) clearPage(n)
  // Re-render the ones near the current page immediately; rest on scroll.
  for (let n = currentPage.value - WINDOW; n <= currentPage.value + WINDOW; n++) {
    if (n >= 1 && n <= numPages.value) renderPage(n)
  }
}

function onScroll() {
  updateCurrentPage()
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(saveLastPage, 400)
}

function updateCurrentPage() {
  const el = scrollerEl.value
  if (!el || !slots.length) return
  const mid = el.scrollTop + el.clientHeight / 2
  // Pages are stacked; find the slot whose range contains mid.
  for (let n = 1; n <= numPages.value; n++) {
    const s = slots[n]
    if (!s) continue
    if (s.offsetTop <= mid && s.offsetTop + s.offsetHeight >= mid) {
      if (currentPage.value !== n) {
        currentPage.value = n
        pruneWindow(n)
      }
      return
    }
  }
}

function pruneWindow(center) {
  for (let n = 1; n <= numPages.value; n++) {
    if (Math.abs(n - center) > WINDOW) clearPage(n)
  }
}

function saveLastPage() {
  try { localStorage.setItem(storageKey(), String(currentPage.value)) } catch (_) {}
}

function restoreLastPage() {
  let n = 1
  try { n = parseInt(localStorage.getItem(storageKey()) || '1') || 1 } catch (_) {}
  if (n > 1 && n <= numPages.value) {
    requestAnimationFrame(() => scrollToPage(n))
  }
}

function scrollToPage(n) {
  const s = slots[n]
  if (s && scrollerEl.value) scrollerEl.value.scrollTop = s.offsetTop - 8
}

function zoomIn()  { setZoom(Math.min(zoom.value + 0.25, 3)) }
function zoomOut() { setZoom(Math.max(zoom.value - 0.25, 0.5)) }
function resetZoom() { setZoom(1) }
function setZoom(z) {
  if (z === zoom.value) return
  const anchor = currentPage.value
  zoom.value = z
  rerenderAll()
  requestAnimationFrame(() => scrollToPage(anchor))
}

function cleanup() {
  if (observer) observer.disconnect()
  if (resizeObs) resizeObs.disconnect()
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  observer = resizeObs = null
  if (pdf) { pdf.destroy?.(); pdf = null }
  slots = []
}
</script>

<style scoped>
.pdf {
  position: relative;
  height: 100%;
  background: var(--bg-subtle);
}

.pdf-scroller {
  height: 100%;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  -webkit-overflow-scrolling: touch;
}

.pdf-pages {
  width: 100%;
  max-width: var(--maxw);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pdf-pages.zoomed { width: max-content; max-width: none; }

:deep(.pdf-page) {
  width: 100%;
  background: #fff;
  border-radius: var(--radius-sm);
  box-shadow: 0 2px 10px var(--shadow);
  overflow: hidden;
}
:deep(.pdf-page canvas) { display: block; }

/* States */
.pdf-state {
  margin: 64px auto;
  max-width: 360px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text);
  padding: 0 20px;
}
.pdf-state h2 { font-size: 18px; font-weight: 600; }
.pdf-state .muted { color: var(--text-muted); font-size: 14px; line-height: 1.5; }
.pdf-state .small { font-size: 12px; }
.pdf-state code {
  background: var(--accent-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 13px;
  word-break: break-all;
}

.spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Controls */
.pdf-controls {
  position: absolute;
  bottom: calc(16px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
  box-shadow: 0 4px 16px var(--shadow-strong);
}
.ctl {
  border: none;
  background: none;
  color: var(--text);
  height: 36px;
  min-width: 36px;
  padding: 0 6px;
  font-size: 20px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ctl:active { background: var(--accent-soft); }
.page-ind {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  padding: 0 12px;
  min-width: 72px;
}
</style>
