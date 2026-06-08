// catalog.js — the list of offline PDFs the app shows.
//
// To add a document: drop the PDF into  public/pdfs/  and add an entry below.
// `file` is the path relative to the site root (files in public/ are served at /).
// Nothing else in the app needs to change.

export const CATEGORIES = [
  { id: 'scriptures', label: 'Scriptures' },
  { id: 'cfm',        label: 'Come, Follow Me' },
  { id: 'music',      label: 'Music' },
]

export const DOCUMENTS = [
  // ---- Scriptures (combined volumes) ----
  {
    id: 'triple',
    category: 'scriptures',
    type: 'scripture',
    title: 'Triple Combination',
    subtitle: 'Book of Mormon · Doctrine and Covenants · Pearl of Great Price',
    file: '/pdfs/triple-combination.pdf',
  },
  {
    id: 'bible',
    category: 'scriptures',
    type: 'scripture',
    title: 'Holy Bible',
    subtitle: 'Old & New Testament · King James Version',
    file: '/pdfs/holy-bible.pdf',
  },

  // ---- Come, Follow Me ----
  {
    id: 'cfm-2026',
    category: 'cfm',
    type: 'pdf',
    title: 'Come, Follow Me 2026',
    subtitle: 'Old Testament · For Home and Church',
    file: '/pdfs/come-follow-me-2026.pdf',
  },

  // ---- Music ----
  {
    id: 'hymns',
    category: 'music',
    type: 'hymns',
    title: 'Hymns',
    subtitle: 'Lyrics · The Church of Jesus Christ of Latter-day Saints',
    file: '/search/hymns.json',
  },
]

export function getDocument(id) {
  return DOCUMENTS.find(d => d.id === id) || null
}

export function documentsByCategory(categoryId) {
  return DOCUMENTS.filter(d => d.category === categoryId)
}
