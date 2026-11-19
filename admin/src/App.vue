<template>
  <div v-if="auth.loading" class="loading-page">
    <div class="spinner"></div>
  </div>
  <div v-else-if="!auth.isAuthenticated">
    <router-view />
  </div>
  <div v-else class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-logo">M10 CMS</div>

      <div v-if="site.sites.length > 1" class="sidebar-site-select">
        <select :value="site.currentSite?.id" @change="onSiteChange">
          <option v-for="s in site.sites" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <nav class="sidebar-nav">
        <router-link to="/" class="sidebar-link" :class="{ active: $route.name === 'Dashboard' }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          Dashboard
        </router-link>
        <router-link to="/content-types" class="sidebar-link" :class="{ active: $route.name?.startsWith('ContentType') }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          Content Types
        </router-link>
        <router-link to="/entries" class="sidebar-link" :class="{ active: $route.name?.startsWith('Entr') }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Entries
        </router-link>
        <router-link to="/media" class="sidebar-link" :class="{ active: $route.name === 'Media' }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Media
        </router-link>
        <router-link to="/settings" class="sidebar-link" :class="{ active: $route.name === 'Settings' }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Settings
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div>{{ auth.user?.email }}</div>
        <a href="#" @click.prevent="doLogout" style="color:var(--danger)">Logout</a>
      </div>
    </aside>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useSiteStore } from './stores/site.js';

const auth = useAuthStore();
const site = useSiteStore();
const router = useRouter();

onMounted(async () => {
  if (auth.isAuthenticated) {
    await site.fetchSites();
    site.restoreSite();
  }
});

function onSiteChange(e) {
  const s = site.sites.find(s => s.id === e.target.value);
  if (s) site.selectSite(s);
}

function doLogout() {
  auth.logout();
  router.push('/login');
}
</script>
