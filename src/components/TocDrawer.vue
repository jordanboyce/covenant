<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="toc-backdrop" @click="$emit('close')" />
    </Transition>
    <Transition name="slide">
      <aside v-if="open" class="toc" role="dialog" aria-label="Contents">
        <header class="toc-head">
          <h2>Contents</h2>
          <button class="hbtn" @click="$emit('close')" aria-label="Close">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div class="toc-body">
          <p v-if="!nav" class="muted">Loading…</p>

          <!-- Scriptures: books -> chapters grid -->
          <template v-else-if="nav.type === 'reference'">
            <div v-for="b in nav.books" :key="b.name" class="book">
              <button class="book-row" @click="toggle(b.name)" :aria-expanded="expanded === b.name">
                <span class="book-name">{{ b.name }}</span>
                <svg class="chev" :class="{ open: expanded === b.name }" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
              <div v-if="expanded === b.name" class="chapters">
                <button
                  v-for="c in b.chapters"
                  :key="c.n"
                  class="chip"
                  @click="$emit('select', c.page)"
                >{{ c.n }}</button>
                <button v-if="!b.chapters.length" class="chip wide" @click="$emit('select', b.page)">Open</button>
              </div>
            </div>
          </template>

          <!-- Come, Follow Me: flat list of lessons -->
          <template v-else-if="nav.type === 'outline'">
            <button
              v-for="(e, i) in nav.entries"
              :key="i"
              class="entry"
              @click="$emit('select', e.page)"
            >{{ e.title }}</button>
          </template>

          <p v-else class="muted">No contents available.</p>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { loadNav } from '@/search/service.js'

const props = defineProps({
  docId: { type: String, required: true },
  open:  { type: Boolean, default: false },
})
defineEmits(['select', 'close'])

const nav = ref(null)
const expanded = ref('')

function toggle(name) { expanded.value = expanded.value === name ? '' : name }

watch(
  () => [props.open, props.docId],
  async ([open]) => {
    if (open && !nav.value) {
      const all = await loadNav()
      nav.value = all[props.docId] || null
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.toc-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 40;
}
.toc {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: min(360px, 86vw);
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  z-index: 41;
  display: flex; flex-direction: column;
  box-shadow: 4px 0 24px var(--shadow-strong);
}
.toc-head {
  flex-shrink: 0;
  height: var(--header-h);
  padding: env(safe-area-inset-top) 8px 0 16px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border);
}
.toc-head h2 { font-size: 16px; font-weight: 600; }
.toc-body { flex: 1; overflow-y: auto; padding: 8px 8px calc(20px + env(safe-area-inset-bottom)); }
.muted { color: var(--text-muted); padding: 16px; font-size: 14px; }

.book-row {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 12px 8px;
  background: none; border: none; color: var(--text);
  font-size: 15px; font-weight: 500; text-align: left;
  border-radius: var(--radius-sm);
}
.book-row:active { background: var(--accent-soft); }
.chev { color: var(--text-faint); transition: transform 0.15s; flex-shrink: 0; }
.chev.open { transform: rotate(90deg); }

.chapters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 6px;
  padding: 4px 8px 12px;
}
.chip {
  height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-subtle); border: 1px solid var(--border);
  color: var(--text); border-radius: var(--radius-sm);
  font-size: 14px; font-variant-numeric: tabular-nums;
}
.chip:active { background: var(--accent-soft); border-color: var(--border-strong); }
.chip.wide { grid-column: 1 / -1; font-weight: 500; }

.entry {
  width: 100%;
  display: block; text-align: left;
  padding: 12px 10px;
  background: none; border: none; color: var(--text);
  border-bottom: 1px solid var(--border);
  font-size: 14px; line-height: 1.4;
}
.entry:active { background: var(--accent-soft); }

.slide-enter-active, .slide-leave-active { transition: transform 0.22s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-100%); }
</style>
