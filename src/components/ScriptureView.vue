<template>
  <div ref="containerEl" class="scripture">
    <div v-if="status === 'loading'" class="sc-state">
      <div class="spinner" />
      <p>Loading…</p>
    </div>

    <div v-else-if="status === 'error'" class="sc-state">
      <h2>Couldn't load scripture data</h2>
      <p class="muted">Try refreshing or check your connection.</p>
    </div>

    <template v-else-if="chapterData">
      <div class="chapter-wrap">
        <header class="ch-header">
          <p class="ch-book">{{ chapterData.book }}</p>
          <h1 class="ch-num">Chapter {{ chapterData.chapter }}</h1>
        </header>

        <div class="verses">
          <p v-for="v in chapterData.verses" :key="v.n" class="verse">
            <span class="v-num">{{ v.n }}</span><span class="v-text">{{ v.text }}</span>
          </p>
        </div>

        <nav class="ch-nav">
          <button v-if="prevRef" class="nav-btn" @click="navigate(prevRef)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            {{ prevRef.book !== chapterData.book ? prevRef.book : '' }}
            Ch. {{ prevRef.chapter }}
          </button>
          <div class="nav-gap" />
          <button v-if="nextRef" class="nav-btn" @click="navigate(nextRef)">
            {{ nextRef.book !== chapterData.book ? nextRef.book : '' }}
            Ch. {{ nextRef.chapter }}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </nav>
      </div>
    </template>

    <div v-else-if="status === 'ready'" class="sc-state">
      <p class="muted">Select a chapter from the contents.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const props = defineProps({
  docId:   { type: String, required: true },
  book:    { type: String, default: '' },
  chapter: { type: Number, default: 0 },
})

const router = useRouter()
const route = useRoute()
const containerEl = ref(null)
const status = ref('loading')

let chapters = []
const chapterIndex = new Map()  // "Book|N" -> index

const storageKey = () => `covenant:scripture:${props.docId}`

onMounted(async () => {
  try {
    const res = await fetch(`/search/scripture-${props.docId}.json`)
    if (!res.ok) throw new Error('not found')
    chapters = await res.json()
    for (let i = 0; i < chapters.length; i++) {
      chapterIndex.set(`${chapters[i].book}|${chapters[i].chapter}`, i)
    }
    status.value = 'ready'
    if (!(props.book && props.chapter > 0)) restorePosition()
  } catch {
    status.value = 'error'
  }
})

watch([() => props.book, () => props.chapter], ([b, ch]) => {
  if (b && ch > 0) {
    savePosition(b, ch)
    containerEl.value?.scrollTo({ top: 0, behavior: 'instant' })
  }
})

const chapterData = computed(() => {
  if (!props.book || !props.chapter || !chapters.length) return null
  const idx = chapterIndex.get(`${props.book}|${props.chapter}`)
  return idx !== undefined ? chapters[idx] : null
})

const prevRef = computed(() => {
  if (!props.book || !props.chapter || !chapters.length) return null
  const idx = chapterIndex.get(`${props.book}|${props.chapter}`)
  if (idx == null || idx <= 0) return null
  const c = chapters[idx - 1]
  return { book: c.book, chapter: c.chapter }
})

const nextRef = computed(() => {
  if (!props.book || !props.chapter || !chapters.length) return null
  const idx = chapterIndex.get(`${props.book}|${props.chapter}`)
  if (idx == null || idx >= chapters.length - 1) return null
  const c = chapters[idx + 1]
  return { book: c.book, chapter: c.chapter }
})

function navigate(dest) {
  router.replace({ query: { book: dest.book, chapter: dest.chapter } })
}

function savePosition(book, chapter) {
  try { localStorage.setItem(storageKey(), JSON.stringify({ book, chapter })) } catch (_) {}
}

function restorePosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || 'null')
    if (saved?.book && saved?.chapter && chapters.length) {
      router.replace({ query: { book: saved.book, chapter: String(saved.chapter) } })
      return
    }
  } catch (_) {}
  if (chapters.length) {
    const first = chapters[0]
    router.replace({ query: { book: first.book, chapter: String(first.chapter) } })
  }
}
</script>

<style scoped>
.scripture {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-subtle);
  -webkit-overflow-scrolling: touch;
}

.sc-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 60%;
  text-align: center;
  padding: 20px;
}
.sc-state h2 { font-size: 18px; font-weight: 600; }
.sc-state .muted { color: var(--text-muted); font-size: 15px; }

.chapter-wrap {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 24px 20px calc(60px + env(safe-area-inset-bottom));
}

.ch-header { margin-bottom: 24px; }
.ch-book {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 4px;
}
.ch-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.verses { display: flex; flex-direction: column; gap: 0; }

.verse {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  line-height: 1.65;
  color: var(--text);
  border-bottom: 1px solid var(--border);
}
.verse:last-child { border-bottom: none; }

.v-num {
  flex-shrink: 0;
  min-width: 24px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  padding-top: 5px;
  text-align: right;
  line-height: 1.65;
}

.v-text {
  flex: 1;
  font-size: 16px;
  line-height: 1.65;
}

.ch-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.nav-gap { flex: 1; }

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--accent);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-btn:active { background: var(--accent-soft); }

.spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
