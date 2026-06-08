// service.js — loads the prebuilt indexes (see scripts/build-index.mjs) and
// answers two kinds of lookup:
//   parseReference('Alma 32')  -> a direct jump to a chapter's page
//   search('faith')           -> keyword hits across every book + the hymns
//
// The small nav file (table of contents + reference->page) loads eagerly the
// first time it's needed; the large per-page text is only fetched when the user
// actually runs a keyword search, then a MiniSearch index is built in memory.

import MiniSearch from 'minisearch'

const PDF_DOCS = ['triple', 'bible', 'cfm-2026']
const DOC_TITLES = {
  triple: 'Triple Combination',
  bible: 'Holy Bible',
  'cfm-2026': 'Come, Follow Me 2026',
  hymns: 'Hymns',
}

let navData = null
let navPromise = null
let mini = null
let buildPromise = null
const recById = new Map()

export function docTitle(id) { return DOC_TITLES[id] || id }

export function loadNav() {
  if (navData) return Promise.resolve(navData)
  if (!navPromise) {
    navPromise = fetch('/search/nav.json')
      .then((r) => r.json())
      .then((d) => { navData = d; return d })
  }
  return navPromise
}

// Common function words + the single letters left behind by footnote markers
// ("a", "b", "c") — dropping them keeps AND-combined queries focused on the
// words that actually distinguish a passage.
export const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'or', 'to', 'in', 'on', 'at', 'by', 'for',
  'is', 'it', 'be', 'as', 'that', 'this', 'with', 'from', 'but', 'not', 'are',
  'was', 'were', 'his', 'her', 'their', 'them', 'he', 'she', 'i', 'o',
])
const processTerm = (term) => {
  const t = term.toLowerCase()
  if (t.length <= 1 || STOPWORDS.has(t)) return null
  return t
}

const MS_OPTS = {
  fields: ['title', 'ref', 'text', 'section'],
  storeFields: ['docId', 'page', 'ref', 'number', 'title', 'section', 'kind'],
  processTerm,
}
const SEARCH_OPTS = {
  prefix: true,
  fuzzy: 0.2,
  boost: { title: 5, ref: 4 },
  combineWith: 'AND',
  // Push readable content above the back-matter: index, topical guide, and
  // dictionary pages have no chapter reference, so they get demoted.
  boostDocument: (id, term, stored) => {
    if (stored.kind === 'hymn') return 1.5
    if (stored.kind === 'page' && !stored.ref) return 0.2
    return 1
  },
}

export function buildIndex() {
  if (mini) return Promise.resolve(mini)
  if (buildPromise) return buildPromise
  buildPromise = (async () => {
    const ms = new MiniSearch(MS_OPTS)
    const docs = []
    for (const docId of PDF_DOCS) {
      const r1 = await fetch(`/search/pages-${docId}.json`)
      if (!r1.ok) throw new Error(`Failed to load pages-${docId}.json`)
      const pages = await r1.json()
      for (const pg of pages) {
        if (!pg.text) continue
        const id = `p:${docId}:${pg.p}`
        const rec = { id, docId, page: pg.p, ref: pg.ref, text: pg.text, kind: 'page' }
        recById.set(id, rec)
        docs.push(rec)
      }
    }
    const r2 = await fetch('/search/hymns.json')
    if (!r2.ok) throw new Error('Failed to load hymns.json')
    const hymns = await r2.json()
    for (const h of hymns) {
      const id = `h:${h.number}`
      const rec = { id, docId: 'hymns', kind: 'hymn', number: h.number, title: h.title, section: h.section, text: h.text }
      recById.set(id, rec)
      docs.push(rec)
    }
    ms.addAll(docs)
    mini = ms
    return ms
  })()
  return buildPromise
}

export async function search(query, limit = 50) {
  const q = (query || '').trim()
  if (!q) return []
  const ms = await buildIndex()
  const hits = ms.search(q, SEARCH_OPTS).slice(0, limit)
  const terms = q.split(/\s+/).filter(Boolean)
  return hits.map((h) => {
    const rec = recById.get(h.id)
    return {
      id: h.id,
      docId: rec.docId,
      kind: rec.kind,
      page: rec.page,
      ref: rec.ref,
      number: rec.number,
      title: rec.title,
      section: rec.section,
      snippet: snippet(rec.text, terms),
    }
  })
}

// --- direct reference jump -------------------------------------------------
export async function parseReference(query) {
  const nav = await loadNav()
  const q = (query || '').trim()

  const hymn = q.match(/^hymns?\s+(\d+)$/i)
  if (hymn) {
    const n = parseInt(hymn[1], 10)
    if (nav.hymns && n >= 1 && n <= 400) {
      return { docId: 'hymns', kind: 'hymn', number: n, label: `Hymn ${n}` }
    }
  }

  // "Alma 32", "1 Nephi 3:7", "John 3:16"
  const m = q.match(/^([1-4]?\s*[a-z][a-z .'—-]*?)\s+(\d+)(?::\d+)?$/i)
  if (!m) return null
  const bookQ = m[1].replace(/\s+/g, ' ').trim().toLowerCase()
  const chapter = parseInt(m[2], 10)
  if (bookQ.length < 3) return null

  for (const docId of ['triple', 'bible']) {
    const d = nav[docId]
    if (!d) continue
    for (const b of d.books) {
      const bn = b.name.toLowerCase()
      if (bn === bookQ || bn.startsWith(bookQ) || bookQ.startsWith(bn)) {
        return {
          docId,
          kind: 'scripture',
          label: `${b.name} ${chapter}`,
          book: b.name,
          chapter: chapter,
        }
      }
    }
  }
  return null
}

// --- snippet around the first matching term --------------------------------
function snippet(text, terms, radius = 90) {
  if (!text) return ''
  const lower = text.toLowerCase()
  let at = -1
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase())
    if (i !== -1 && (at === -1 || i < at)) at = i
  }
  if (at === -1) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '')
  let start = Math.max(0, at - radius)
  let end = Math.min(text.length, at + radius)
  if (start > 0) start = text.indexOf(' ', start) + 1 || start
  if (end < text.length) end = text.lastIndexOf(' ', end) || end
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '')
}
