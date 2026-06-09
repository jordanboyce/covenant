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

// Build scripture chapter data from the clean LDS scriptures JSON source.
// volumeFilter selects which volumes to include (Bible vs Triple Combination).
function buildScriptureChaptersFromJson(verses, volumeFilter) {
  const chapters = new Map()
  for (const v of verses.filter(volumeFilter)) {
    const book = v.book_title.replace(/--/g, '—')  // normalize double-dash → em-dash
    const key = `${book}\x00${v.chapter_number}`
    if (!chapters.has(key)) chapters.set(key, { book, chapter: v.chapter_number, verses: [] })
    chapters.get(key).verses.push({ n: v.verse_number, text: v.scripture_text })
  }
  return [...chapters.values()]
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
  const order = [] // book names in first-seen order
  const byBook = new Map() // name -> { name, page, chapters:[{n,page}], seen:Set }

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const items = (await page.getTextContent()).items
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
  return { numPages: pdf.numPages, pages, books: booksOut }
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
  const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))
  const ldsVerses = JSON.parse(readFileSync(join(SCRIPTS_DIR, 'lds-scriptures.json'), 'utf8'))
  const BIBLE_VOLS = new Set(['Old Testament', 'New Testament'])
  write('scripture-triple.json', buildScriptureChaptersFromJson(ldsVerses, v => !BIBLE_VOLS.has(v.volume_title)))
  write('scripture-bible.json', buildScriptureChaptersFromJson(ldsVerses, v => BIBLE_VOLS.has(v.volume_title)))

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
