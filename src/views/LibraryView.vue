<template>
  <div class="page">
    <AppHeader>
      <template #default>
        <RouterLink to="/search" class="hbtn" aria-label="Search">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        </RouterLink>
      </template>
    </AppHeader>

    <main class="content">
      <p class="intro">Your scriptures and Come, Follow Me, available offline.</p>

      <RouterLink to="/search" class="search-cta">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <span>Search scriptures, hymns, or a reference</span>
      </RouterLink>

      <section v-for="cat in CATEGORIES" :key="cat.id" class="section">
        <h2 class="section-label">{{ cat.label }}</h2>
        <div class="list">
          <RouterLink
            v-for="doc in documentsByCategory(cat.id)"
            :key="doc.id"
            :to="`/view/${doc.id}`"
            class="doc"
          >
            <span class="doc-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15l-6-3.5L4 20z"/>
              </svg>
            </span>
            <span class="doc-text">
              <span class="doc-title">{{ doc.title }}</span>
              <span class="doc-sub">{{ doc.subtitle }}</span>
            </span>
            <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </RouterLink>
        </div>
      </section>

      <p class="foot">Works fully offline once each PDF has been opened.</p>
    </main>
  </div>
</template>

<script setup>
import AppHeader from '@/components/AppHeader.vue'
import { CATEGORIES, documentsByCategory } from '@/data/catalog.js'
</script>

<style scoped>
.page { min-height: 100dvh; display: flex; flex-direction: column; }

.content {
  width: 100%;
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 18px 16px calc(40px + env(safe-area-inset-bottom));
}

.intro {
  color: var(--text-muted);
  font-size: 15px;
  margin: 4px 2px 16px;
  line-height: 1.5;
}

.search-cta {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 14px; margin-bottom: 24px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 15px;
}
.search-cta:hover { border-color: var(--border-strong); }
.search-cta svg { color: var(--text-faint); flex-shrink: 0; }

.section { margin-bottom: 26px; }
.section-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin: 0 2px 10px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.15s, transform 0.05s;
}
.doc:hover { border-color: var(--border-strong); }
.doc:active { transform: scale(0.99); }

.doc-icon {
  flex-shrink: 0;
  width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
}

.doc-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.doc-title { font-size: 16px; font-weight: 600; }
.doc-sub {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chev { color: var(--text-faint); flex-shrink: 0; }

.foot {
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
  margin-top: 8px;
}
</style>
