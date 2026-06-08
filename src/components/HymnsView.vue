<template>
  <div class="hymns">
    <!-- Detail -->
    <article v-if="current" class="detail">
      <button class="back" @click="select(null)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        All hymns
      </button>
      <p class="d-section">{{ current.section }}</p>
      <h2 class="d-title"><span class="d-num">{{ current.number }}</span>{{ current.title }}</h2>
      <p v-for="(v, i) in current.verses" :key="i" class="verse">
        <span class="v-num">{{ i + 1 }}</span>{{ v }}
      </p>
      <p v-if="current.info" class="d-info">{{ current.info }}</p>
    </article>

    <!-- List -->
    <div v-else class="list-wrap">
      <div class="search-row">
        <svg class="s-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input v-model="filter" class="s-input" type="search" inputmode="search" placeholder="Find a hymn by title or number" />
      </div>

      <p v-if="!hymns.length" class="muted">Loading…</p>

      <template v-else-if="filter.trim()">
        <button v-for="h in filtered" :key="h.number" class="row" @click="select(h.number)">
          <span class="r-num">{{ h.number }}</span>
          <span class="r-title">{{ h.title }}</span>
        </button>
        <p v-if="!filtered.length" class="muted">No hymns match “{{ filter }}”.</p>
      </template>

      <template v-else>
        <section v-for="sec in sections" :key="sec.name" class="section">
          <h3 class="sec-label">{{ sec.name }}</h3>
          <button v-for="h in sec.items" :key="h.number" class="row" @click="select(h.number)">
            <span class="r-num">{{ h.number }}</span>
            <span class="r-title">{{ h.title }}</span>
          </button>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const hymns = ref([])
const filter = ref('')

const current = computed(() => {
  const n = parseInt(route.query.n)
  return n ? hymns.value.find((h) => h.number === n) || null : null
})

const sections = computed(() => {
  const map = new Map()
  for (const h of hymns.value) {
    if (!map.has(h.section)) map.set(h.section, [])
    map.get(h.section).push(h)
  }
  return [...map].map(([name, items]) => ({ name, items }))
})

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return hymns.value
  return hymns.value.filter(
    (h) => String(h.number) === q || h.title.toLowerCase().includes(q),
  )
})

function select(n) {
  router.replace({ query: n ? { n } : {} })
  if (n) scrollTop()
}
function scrollTop() {
  document.querySelector('.hymns')?.scrollTo?.({ top: 0 })
}

watch(current, (c) => { if (c) scrollTop() })

onMounted(async () => {
  hymns.value = await fetch('/search/hymns.json').then((r) => r.json())
})
</script>

<style scoped>
.hymns { height: 100%; overflow-y: auto; background: var(--bg-subtle); }
.list-wrap, .detail {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 12px 16px calc(40px + env(safe-area-inset-bottom));
}
.muted { color: var(--text-muted); padding: 24px 4px; font-size: 14px; text-align: center; }

.search-row {
  position: relative;
  margin: 6px 0 14px;
}
.s-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-faint); }
.s-input {
  width: 100%;
  padding: 12px 12px 12px 40px;
  font-size: 15px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
}
.s-input:focus { outline: none; border-color: var(--border-strong); }

.section { margin-bottom: 20px; }
.sec-label {
  font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-faint);
  margin: 0 2px 8px;
}
.row {
  width: 100%;
  display: flex; align-items: center; gap: 14px;
  padding: 12px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text); text-align: left;
  margin-bottom: 6px;
}
.row:active { border-color: var(--border-strong); background: var(--accent-soft); }
.r-num {
  flex-shrink: 0;
  min-width: 32px;
  font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: var(--accent);
}
.r-title { font-size: 15px; }

/* Detail */
.back {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: none; color: var(--accent);
  font-size: 14px; font-weight: 500; padding: 8px 0; margin-bottom: 4px;
}
.d-section {
  font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-faint); margin-bottom: 6px;
}
.d-title { font-size: 22px; font-weight: 650; line-height: 1.25; margin-bottom: 20px; display: flex; gap: 10px; align-items: baseline; }
.d-num { color: var(--accent); font-size: 16px; font-weight: 600; }
.verse {
  font-size: 16px; line-height: 1.6; margin-bottom: 16px;
  position: relative; padding-left: 28px;
}
.v-num {
  position: absolute; left: 0; top: 0;
  font-size: 12px; font-weight: 600; color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.d-info {
  margin-top: 12px; padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 13px; color: var(--text-muted); line-height: 1.6;
}
</style>
