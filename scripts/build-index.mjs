// build-index.mjs — run once at build time to make the app searchable.
//
//   node scripts/build-index.mjs
//
// Reads the PDFs and the hymns .txt in public/, then writes compact JSON to
// public/search/ :
//   nav.json          interactive table-of-contents + reference->page maps
//   pages-<id>.json   per-page text (lazy-loaded; powers keyword search)
//   hymns.json        structured hymns (number, title, section, verses)
//
// Nothing here runs in the browser — the app just fetches the JSON.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')
const OUT = join(PUB, 'search')
mkdirSync(OUT, { recursive: true })

// ---- canonical scripture books, in order ---------------------------------
// Header lines read like "281 A LMA 30: 7–20" — the print page number, then the
// book in small-caps (letters get spaced out by the font), then chapter:verses.
// We match by stripping spaces and testing each book name as a prefix, longest
// first, so "DOCTRINE AND COVENANTS" wins over any shorter accidental match.

const BIBLE_BOOKS = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
  'Nehemiah','Esther','Job','Psalms','Psalm','Proverbs','Ecclesiastes',
  'Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea',
  'Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai',
  'Zechariah','Malachi',
  'Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians',
  'Galatians','Ephesians','Philippians','Colossians','1 Thessalonians',
  '2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James',
  '1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation',
]

const TRIPLE_BOOKS = [
  // Book of Mormon
  '1 Nephi','2 Nephi','Jacob','Enos','Jarom','Omni','Words of Mormon','Mosiah',
  'Alma','Helaman','3 Nephi','4 Nephi','Mormon','Ether','Moroni',
  // Doctrine and Covenants
  'Doctrine and Covenants','Official Declaration',
  // Pearl of Great Price
  'Moses','Abraham','Joseph Smith—Matthew','Joseph Smith—History',
  'Joseph Smith-Matthew','Joseph Smith-History','Articles of Faith',
]

const norm = (s) => s.toUpperCase().replace(/\s+/g, '').replace(/[‐-—]/g, '-')

// Build [{name, norm}] sorted so longest normalized names match first.
function bookTable(names) {
  return names
    .map((name) => ({ name, n: norm(name) }))
    .sort((a, b) => b.n.length - a.n.length)
}

function topLine(items) {
  if (!items.length) return ''
  const maxY = Math.max(...items.map((i) => i.transform[5]))
  return items
    .filter((i) => i.transform[5] > maxY - 4)
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Parse a running header into the book and the chapter span it covers.
// Headers look like "281 A LMA 30: 7–20"  (chapter 30 only)  or
//                   "5 D OCTRINE AND C OVENANTS 2:1–3:6" (chapters 2 and 3).
// Returns { book, chapters:[..] } — chapters is [] when only the book is known.
function parseHeader(line, books) {
  let s = line.trim().replace(/^\d+\s+/, '') // drop the print-page number
  const ns = norm(s)
  for (const b of books) {
    if (ns.startsWith(b.n)) {
      const rest = ns.slice(b.n.length)
      // ch1[:v1][-ch2:v2]  — the second chapter only appears across a span.
      const m = rest.match(/^(\d+):\d+(?:-(\d+):\d+)?/)
      if (!m) return { book: b.name, chapters: [] }
      const chapters = [parseInt(m[1], 10)]
      if (m[2]) chapters.push(parseInt(m[2], 10))
      return { book: b.name, chapters }
    }
  }
  return null
}

function pageText(items) {
  return items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
}

// Extract verse-level data from a page's text items.
// pageWidth is used to split the two-column layout (left col first, then right).
const EMPTY_PAGE = { verses: [], preamble: '', firstVerse: 999 }

function extractPageVerses(items, pageWidth) {
  if (!items.length) return EMPTY_PAGE
  const maxY = Math.max(...items.map(i => i.transform[5]))

  // Remove running header (top 8 pts), footnotes (h≈8.3), and section headings (h≈10.0).
  // LDS scripture PDFs: body text h≈10.4, section headings h≈10.0, footnote text h≈8.3, footnote letters h≈6.
  const body = items.filter(i => i.transform[5] < maxY - 8 && Math.abs(i.transform[3]) >= 10.2)
  if (!body.length) return EMPTY_PAGE

  // Two-column layout: left column then right column, each top-to-bottom left-to-right.
  const colSplit = (pageWidth || 432) / 2
  const byRow = (a, b) => {
    const dy = b.transform[5] - a.transform[5]
    return Math.abs(dy) > 2 ? dy : a.transform[4] - b.transform[4]
  }
  // Drop-cap letters (h≈44) have a lower baseline y than the surrounding text, causing them
  // to sort into the middle of verse 1 text rather than the start. Prepend them first.
  const isDropCap = i => Math.abs(i.transform[3]) > 20
  const colSort = (items) => [
    ...items.filter(isDropCap),
    ...items.filter(i => !isDropCap(i)).sort(byRow),
  ]
  const left  = colSort(body.filter(i => i.transform[4] < colSplit))
  const right = colSort(body.filter(i => i.transform[4] >= colSplit))

  let text = [...left, ...right].map(i => i.str).join(' ')
    .replace(/\s+/g, ' ')
    .replace(/([a-zA-Z])-\s+([a-zA-Z])/g, '$1$2')  // fix column-break hyphenation
    .trim()

  // Strip chapter headings (e.g. "C HAPTER 32 " in LDS small-caps two-column format)
  text = text.replace(/C\s+HAPTER\s+\d+\s+/g, '')

  // Split on verse boundaries: " N Capital" — also handles KJV pilcrow (¶) before verse text
  const parts = (' ' + text).split(/ (\d{1,3}) (?=[A-Z¶])/g)
  const verses = []
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const n = parseInt(parts[i])
    const t = parts[i + 1].replace(/^¶\s*/, '').trim()  // strip leading ¶
    if (n >= 1 && n <= 250) verses.push({ n, text: t })
  }
  const preamble = (parts[0] || '').trim()
  const firstVerse = verses[0]?.n ?? 999
  return { verses, preamble, firstVerse }
}

// Recover drop-cap verse 1 text from preamble (text before first explicit verse number).
// LDS scripture chapters start with a drop-cap letter for verse 1 — no "1" appears in the PDF.
// Chapter summaries are h≈10.4 (same as verse text) so they end up in the preamble; strip them.
function recoverVerse1(preamble) {
  let text = preamble
  // Strip LDS chapter summary (em-dash separated phrases ending in a period)
  const lastDash = text.lastIndexOf('—')  // em-dash
  if (lastDash !== -1) {
    const tail = text.slice(lastDash + 1)
    // Summary phrase ends with ". " before verse text
    const m = tail.match(/^[^]*?\.\s+(.+)/s)
    if (m) text = m[1]
    else text = tail.replace(/^[^A-Z]*([A-Z])/, '$1')
  }
  // Strip marginal date notes: "About 600 b.c." / "About 588–570 b.c."
  text = text.replace(/^About\s+[\d–—\-]+\s*[Bb]\.?\s*[Cc]\.?\s*/, '')
  // Fix PDF spacing artifacts: drop-cap "I , Nephi" → "I, Nephi"; "word ," → "word,"
  text = text.trim()
    .replace(/^([A-Z])\s+([,;:])/, '$1$2')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/\s+/g, ' ')
  // Only accept text that clearly starts a sentence (capital + lowercase/punctuation).
  // Rejects PDF artifacts like ", N EPHI" or orphan single-letter lines.
  if (text.length < 15 || !/^[A-Z][a-z,;:.!?]/.test(text)) return ''
  return text
}

// Merge and validate verses from consecutive pages into a clean monotonic sequence.
function assembleChapterVerses(pageVerseArrays) {
  const all = []
  for (const pv of pageVerseArrays) {
    for (const v of pv) {
      if (all.length > 0 && v.n === all[all.length - 1].n) {
        all[all.length - 1].text += ' ' + v.text  // continuation across page break
      } else {
        all.push({ n: v.n, text: v.text })
      }
    }
  }

  const startIdx = Math.max(0, all.findIndex(v => v.n === 1))
  const valid = []
  let maxN = 0
  for (let i = startIdx; i < all.length; i++) {
    const v = all[i]
    if (v.n > maxN && v.n <= maxN + 5 && v.text.length >= 5) {
      valid.push({ n: v.n, text: v.text })
      maxN = v.n
    } else if (v.n < maxN - 10 && valid.length >= 5) {
      break  // large backward jump = entered next chapter
    }
  }
  return valid
}

// Build per-chapter verse data from indexed page items + nav book data.
// pages is the [{p, ref}] array used to determine whether the lookback page
// belongs to a previous chapter (has a running header) or is a chapter-opening
// title page (no running header, ref='').
function buildScriptureChapters(allPageItems, books, totalPages, pages) {
  const pageRefs = new Map(pages.map(p => [p.p, p.ref]))
  const chapters = []

  for (const book of books) {
    for (let i = 0; i < book.chapters.length; i++) {
      const ch = book.chapters[i]
      const nextCh = book.chapters[i + 1]

      // Include the page before the nav start only when it has no running header —
      // that signals a chapter-title/intro page whose verse content belongs here.
      // Pages with a running header belong to the previous chapter.
      const lookback = ch.page - 1
      const startPage = (lookback >= 1 && (pageRefs.get(lookback) || '') === '')
        ? lookback : ch.page
      const endPage = nextCh ? nextCh.page : Math.min(totalPages, ch.page + 30)

      const pageVerseArrays = []
      let v1preamble = ''
      for (let p = startPage; p <= endPage; p++) {
        const entry = allPageItems[p - 1]
        if (entry) {
          const result = extractPageVerses(entry.items, entry.width)
          pageVerseArrays.push(result.verses)
          // Capture preamble from the first page where the leading explicit verse is 2 —
          // that means the text before it is drop-cap verse 1.  startPage may be the lookback
          // (ch.page-1) when that page is a chapter-opening page with no running header.
          // Limit to startPage..ch.page+1 so we never accidentally grab the next chapter's
          // opening page (endPage = nextCh.page) when chapter N's verse 2 falls late.
          if (!v1preamble && p >= startPage && p <= ch.page + 1 && result.firstVerse === 2 && result.preamble.length >= 15) {
            v1preamble = result.preamble
          }
        }
      }
      let verses = assembleChapterVerses(pageVerseArrays)
      // Prepend drop-cap verse 1 if it was missing from the explicit verse splits
      if (verses.length > 0 && verses[0].n !== 1 && v1preamble) {
        const v1text = recoverVerse1(v1preamble)
        if (v1text) verses = [{ n: 1, text: v1text }, ...verses]
      }
      if (verses.length > 0) {
        // Normalize "Psalm" → "Psalms": KJV Bible PDF alternates between both forms
        const bookName = book.name === 'Psalm' ? 'Psalms' : book.name
        chapters.push({ book: bookName, chapter: ch.n, verses })
      }
    }
  }
  return chapters
}

async function loadPdf(file) {
  const data = new Uint8Array(readFileSync(join(PUB, file)))
  return pdfjs.getDocument({ data }).promise
}

// Extract every page's text + a reference (from its running header), and build
// an ordered book -> chapters -> page table for the table of contents.
async function indexReferencePdf(docId, file, books) {
  const pdf = await loadPdf(file)
  const table = bookTable(books)
  const pages = []
  const allPageItems = []
  const order = [] // book names in first-seen order
  const byBook = new Map() // name -> { name, page, chapters:[{n,page}], seen:Set }

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const items = (await page.getTextContent()).items
    const width = page.getViewport({ scale: 1 }).width
    allPageItems.push({ items, width })
    const ref = parseHeader(topLine(items), table)
    const text = pageText(items)
    pages.push({ p: n, ref: ref ? refLabel(ref) : '', text })

    if (ref) {
      if (!byBook.has(ref.book)) {
        byBook.set(ref.book, { name: ref.book, page: n, chapters: [], seen: new Set(), max: 0 })
        order.push(ref.book)
      }
      const rec = byBook.get(ref.book)
      for (const c of ref.chapters) {
        // Guard against appendix pages that reuse a book name with a stray number
        // (e.g. a Bible-dictionary page header). A real next chapter is never far
        // beyond the running maximum.
        if (c <= 0 || rec.seen.has(c)) continue
        if (rec.max > 0 && c > rec.max + 50) continue
        rec.seen.add(c)
        rec.max = Math.max(rec.max, c)
        rec.chapters.push({ n: c, page: n })
      }
    }
    if (n % 250 === 0) console.log(`   ${docId}: ${n}/${pdf.numPages}`)
  }

  const booksOut = order.map((name) => {
    const r = byBook.get(name)
    return { name, page: r.page, chapters: r.chapters.sort((a, b) => a.n - b.n) }
  })
  return { numPages: pdf.numPages, pages, books: booksOut, allPageItems }
}

function refLabel(ref) {
  return ref.chapters.length ? `${ref.book} ${ref.chapters[0]}` : ref.book
}

// Come, Follow Me: use the PDF's own bookmarks (one per weekly lesson).
async function indexOutlinePdf(docId, file) {
  const pdf = await loadPdf(file)
  const outline = (await pdf.getOutline()) || []
  const entries = []
  for (const item of outline) {
    const page = await destToPage(pdf, item.dest)
    const title = (item.title || '').replace(/﻿/g, '').replace(/\s+/g, ' ').trim()
    if (title && page) entries.push({ title, page })
  }
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = (await pdf.getPage(n).then((p) => p.getTextContent())).items
    pages.push({ p: n, ref: '', text: pageText(items) })
    if (n % 250 === 0) console.log(`   ${docId}: ${n}/${pdf.numPages}`)
  }
  return { numPages: pdf.numPages, pages, entries }
}

async function destToPage(pdf, dest) {
  try {
    let d = dest
    if (typeof d === 'string') d = await pdf.getDestination(d)
    if (!Array.isArray(d)) return null
    const idx = await pdf.getPageIndex(d[0])
    return idx + 1
  } catch {
    return null
  }
}

// ---- hymns .txt parser ----------------------------------------------------
const SECTIONS = new Set([
  'Restoration','Praise and Thanksgiving','Prayer and Supplication','Sacrament',
  'Easter','Christmas','Special Topics','For Women','For Men','Patriotic',
])

function parseHymns(file) {
  const raw = readFileSync(join(PUB, file), 'utf8')
  const lines = raw.split(/\r?\n/)
  const hymns = []
  let section = ''
  let cur = null
  let state = 'between' // between | verses | meta

  const flush = () => {
    if (cur) {
      cur.text = cur.verses.join(' ')
      hymns.push(cur)
      cur = null
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (state === 'meta') state = 'between'
      continue
    }
    if (line === 'hymns' || line === 'LYRICS') continue
    if (SECTIONS.has(line)) { flush(); section = line; state = 'between'; continue }
    if (line === 'Info') { state = 'meta'; continue }

    const numbered = line.match(/^(\d+)\.\s+(.*)$/)

    if (state === 'between') {
      if (numbered) {
        flush()
        cur = { number: parseInt(numbered[1], 10), title: numbered[2].trim(), section, verses: [], info: '' }
        state = 'verses'
      }
      // a stray non-numbered line between hymns is ignored
      continue
    }
    if (state === 'verses') {
      if (cur) cur.verses.push(line.replace(/^\d+\.\s+/, ''))
      continue
    }
    if (state === 'meta') {
      if (cur) cur.info = (cur.info ? cur.info + ' ' : '') + line
      continue
    }
  }
  flush()
  return hymns
}

// ---- run ------------------------------------------------------------------
function write(name, obj) {
  const path = join(OUT, name)
  writeFileSync(path, JSON.stringify(obj))
  const kb = (statSync(path).size / 1024).toFixed(0)
  console.log(`   wrote ${name}  (${kb} KB)`)
}

async function main() {
  const nav = {}

  console.log('Triple Combination…')
  const triple = await indexReferencePdf('triple', '/pdfs/triple-combination.pdf', TRIPLE_BOOKS)
  nav.triple = { type: 'reference', numPages: triple.numPages, books: triple.books }
  write('pages-triple.json', triple.pages)

  console.log('Holy Bible…')
  const bible = await indexReferencePdf('bible', '/pdfs/holy-bible.pdf', BIBLE_BOOKS)
  nav.bible = { type: 'reference', numPages: bible.numPages, books: bible.books }
  write('pages-bible.json', bible.pages)

  console.log('Building scripture verse data…')
  const scriptureTriple = buildScriptureChapters(triple.allPageItems, triple.books, triple.numPages, triple.pages)
  write('scripture-triple.json', scriptureTriple)

  const scriptureBible = buildScriptureChapters(bible.allPageItems, bible.books, bible.numPages, bible.pages)
  write('scripture-bible.json', scriptureBible)

  console.log('Come, Follow Me…')
  const cfm = await indexOutlinePdf('cfm-2026', '/pdfs/come-follow-me-2026.pdf')
  nav['cfm-2026'] = { type: 'outline', numPages: cfm.numPages, entries: cfm.entries }
  write('pages-cfm-2026.json', cfm.pages)

  console.log('Hymns…')
  const hymns = parseHymns('/Hymns of The Church of Jesus Christ of Latter-day Saints Lyrics.txt')
  nav.hymns = { type: 'hymns', count: hymns.length }
  write('hymns.json', hymns)

  write('nav.json', nav)

  console.log('\nSummary:')
  console.log(`  triple: ${triple.books.length} books`)
  console.log(`  bible:  ${bible.books.length} books`)
  console.log(`  cfm:    ${cfm.entries.length} lessons`)
  console.log(`  hymns:  ${hymns.length} hymns`)
}

main().catch((e) => { console.error(e); process.exit(1) })
