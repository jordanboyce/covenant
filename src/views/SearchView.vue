<template>
  <div class="page">
    <AppHeader back>
      <template #default><span class="head-title">Search</span></template>
    </AppHeader>

    <div class="search-bar">
      <svg class="s-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        ref="inputEl"
        v-model="query"
        class="s-input"
        type="search"
        inputmode="search"
        autocomplete="off"
        placeholder="Search scriptures, hymns, or a reference"
        @input="onInput"
      />
      <button v-if="query" class="clear" @click="clear" aria-label="Clear">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="results">
      <!-- Direct reference jump -->
      <RouterLink v-if="refJump" :to="refTarget" class="jump">
        <span class="jump-label">
          <strong>Go to {{ refJump.label }}</strong>
          <span v-if="refJump.exact === false" class="jump-note">nearest page</span>
        </span>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </RouterLink>

      <p v-if="preparing" class="status">Preparing search…</p>
      <p v-else-if="query.trim() && !results.length && searched" class="status">
        No results for “{{ query.trim() }}”.
      </p>

      <section v-for="g in grouped" :key="g.docId" class="group">
        <h2 class="group-label">{{ docTitle(g.docId) }} <span class="count">{{ g.items.length }}</span></h2>
        <RouterLink
          v-for="r in g.items"
          :key="r.id"
          :to="targetFor(r)"
          class="result"
        >
          <span class="r-head">
            <span class="r-ref">{{ resultLabel(r) }}</span>
          </span>
          <span class="r-snippet" v-html="highlight(r.snippet)" />
        </RouterLink>
      </section>

      <p v-if="!query.trim()" class="hint">
        Try a phrase like <em>“endure to the end”</em>, a reference like
        <em>Alma 32</em> or <em>John 3:16</em>, or <em>Hymn 5</em>.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { search, parseReference, docTitle, STOPWORDS } from '@/search/service.js'

const inputEl = ref(null)
const query = ref('')
const results = ref([])
const refJump = ref(null)
const preparing = ref(false)
const searched = ref(false)
let timer = null
let runId = 0

const DOC_ORDER = ['triple', 'bible', 'cfm-2026', 'hymns']
const grouped = computed(() => {
  const map = new Map()
  for (const r of results.value) {
    if (!map.has(r.docId)) map.set(r.docId, [])
    map.get(r.docId).push(r)
  }
  return DOC_ORDER.filter((d) => map.has(d)).map((docId) => ({ docId, items: map.get(docId) }))
})

const refTarget = computed(() => refJump.value ? targetForRef(refJump.value) : '/')

function onInput() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(run, 200)
}

async function run() {
  const q = query.value.trim()
  const myId = ++runId
  searched.value = false
  if (!q) { results.value = []; refJump.value = null; return }

  refJump.value = await parseReference(q)

  preparing.value = true
  const hits = await search(q)
  if (myId !== runId) return // a newer query superseded this one
  preparing.value = false
  searched.value = true
  results.value = hits
}

function clear() {
  query.value = ''
  results.value = []
  refJump.value = null
  searched.value = false
  inputEl.value?.focus()
}

function targetFor(r) {
  return r.kind === 'hymn'
    ? { path: `/view/hymns`, query: { n: r.number } }
    : { path: `/view/${r.docId}`, query: { page: r.page } }
}
function targetForRef(j) {
  return j.kind === 'hymn'
    ? { path: `/view/hymns`, query: { n: j.number } }
    : { path: `/view/${j.docId}`, query: { page: j.page } }
}

function resultLabel(r) {
  if (r.kind === 'hymn') return `${r.number}. ${r.title}`
  return r.ref ? `${r.ref} · p. ${r.page}` : `Page ${r.page}`
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function highlight(text) {
  const safe = escapeHtml(text || '')
  const terms = query.value
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t.toLowerCase()))
  if (!terms.length) return safe
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi')
  return safe.replace(re, '<mark class="hl">$1</mark>')
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

onMounted(() => inputEl.value?.focus())
</script>

<style scoped>
.page { min-height: 100dvh; display: flex; flex-direction: column; }
.head-title { font-size: 16px; font-weight: 600; }

.search-bar {
  position: sticky; top: var(--header-h); z-index: 5;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.s-icon { color: var(--text-faint); flex-shrink: 0; }
.s-input {
  flex: 1; min-width: 0;
  border: none; background: none; color: var(--text);
  font-size: 16px; padding: 6px 0;
}
.s-input:focus { outline: none; }
.clear { background: none; border: none; color: var(--text-faint); display: flex; padding: 4px; }

.results {
  width: 100%; max-width: var(--maxw); margin: 0 auto;
  padding: 12px 16px calc(40px + env(safe-area-inset-bottom));
}
.status { color: var(--text-muted); padding: 20px 4px; font-size: 14px; text-align: center; }
.hint { color: var(--text-faint); font-size: 14px; line-height: 1.7; padding: 24px 6px; }
.hint em { color: var(--text-muted); font-style: normal; font-weight: 500; }

.jump {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px; margin-bottom: 16px;
  background: var(--accent-soft);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  text-decoration: none; color: var(--text);
}
.jump-label { display: flex; align-items: baseline; gap: 8px; }
.jump-note { font-size: 12px; color: var(--text-muted); }

.group { margin-bottom: 22px; }
.group-label {
  font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-faint);
  margin: 0 2px 8px; display: flex; align-items: center; gap: 8px;
}
.count {
  font-size: 11px; color: var(--text-muted);
  background: var(--bg-subtle); border-radius: 999px; padding: 1px 7px;
  letter-spacing: 0;
}

.result {
  display: block;
  padding: 12px 14px; margin-bottom: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-decoration: none; color: var(--text);
}
.result:active { background: var(--accent-soft); }
.r-head { display: flex; justify-content: space-between; margin-bottom: 4px; }
.r-ref { font-size: 13px; font-weight: 600; color: var(--accent); }
.r-snippet {
  font-size: 14px; line-height: 1.5; color: var(--text-muted);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
</style>
