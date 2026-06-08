<template>
  <div class="page">
    <AppHeader :title="doc?.title || 'Document'" back>
      <template #default>
        <RouterLink to="/search" class="hbtn" aria-label="Search">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        </RouterLink>
        <button v-if="isPdf" class="hbtn" aria-label="Contents" @click="tocOpen = true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        </button>
      </template>
    </AppHeader>

    <div v-if="doc" class="viewer">
      <PdfViewer v-if="isPdf" :src="doc.file" :doc-id="doc.id" :go-to="goToPage" />
      <HymnsView v-else-if="doc.type === 'hymns'" />
    </div>

    <div v-else class="missing">
      <h2>Not found</h2>
      <p>That document isn’t in the library.</p>
      <RouterLink to="/" class="back-link">← Back to library</RouterLink>
    </div>

    <TocDrawer
      v-if="isPdf"
      :doc-id="doc.id"
      :open="tocOpen"
      @select="onTocSelect"
      @close="tocOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import PdfViewer from '@/components/PdfViewer.vue'
import HymnsView from '@/components/HymnsView.vue'
import TocDrawer from '@/components/TocDrawer.vue'
import { getDocument } from '@/data/catalog.js'

const route = useRoute()
const router = useRouter()
const doc = computed(() => getDocument(route.params.id))
const isPdf = computed(() => doc.value && doc.value.type !== 'hymns')
const goToPage = computed(() => parseInt(route.query.page) || 0)
const tocOpen = ref(false)

function onTocSelect(page) {
  tocOpen.value = false
  router.replace({ query: { page } })
}
</script>

<style scoped>
.page { height: 100dvh; display: flex; flex-direction: column; }
.viewer { flex: 1; min-height: 0; }

.missing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 20px;
}
.missing h2 { font-size: 20px; font-weight: 600; }
.missing p { color: var(--text-muted); }
.back-link { color: var(--accent); text-decoration: none; margin-top: 8px; font-weight: 500; }
</style>
