<template>
  <header class="app-header">
    <div class="left">
      <button v-if="back" class="icon-btn" @click="$router.back()" aria-label="Back">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <RouterLink v-else to="/" class="brand" aria-label="Home">
        <img src="/favicon.svg" alt="" width="26" height="26" />
        <span>Covenant</span>
      </RouterLink>
    </div>

    <h1 v-if="title" class="title">{{ title }}</h1>

    <div class="right"><slot /></div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  back:  { type: Boolean, default: false },
})
</script>

<style scoped>
.app-header {
  height: var(--header-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  padding-top: env(safe-area-inset-top);
  box-sizing: content-box;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.left, .right { display: flex; align-items: center; flex-shrink: 0; }
.right { margin-left: auto; }

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  text-decoration: none;
  color: var(--text);
  font-weight: 650;
  font-size: 17px;
  letter-spacing: -0.01em;
  padding: 0 6px;
}
.brand img { border-radius: 6px; }

.title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.icon-btn {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: none; color: var(--text);
  border-radius: 999px;
}
.icon-btn:active { background: var(--accent-soft); }
</style>
