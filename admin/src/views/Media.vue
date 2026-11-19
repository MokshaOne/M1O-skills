<template>
  <div>
    <div class="page-header">
      <h1>Media</h1>
      <label class="btn btn-primary">
        Upload
        <input type="file" hidden @change="upload" multiple />
      </label>
    </div>

    <div v-if="loading" class="empty"><div class="spinner"></div></div>
    <div v-else-if="!items.length" class="empty">Keine Medien vorhanden</div>
    <div v-else class="media-grid">
      <div v-for="m in items" :key="m.id" class="media-item card">
        <img v-if="isImage(m.mime_type)" :src="m.url" :alt="m.filename" />
        <div v-else class="media-file-icon">📄</div>
        <div class="media-info">
          <div class="media-name">{{ m.filename }}</div>
          <div class="media-meta">{{ m.mime_type }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useSiteStore } from '../stores/site.js';
import { api } from '../api/client.js';
import { getAccessToken } from '../api/client.js';

const site = useSiteStore();
const items = ref([]);
const loading = ref(true);

function isImage(mime) { return mime?.startsWith('image/'); }

async function load() {
  if (!site.currentSiteId) return;
  loading.value = true;
  try {
    items.value = await api(`/sites/${site.currentSiteId}/media`);
  } catch { items.value = []; }
  loading.value = false;
}

async function upload(e) {
  const files = e.target.files;
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    try {
      await fetch(`/api/sites/${site.currentSiteId}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAccessToken()}` },
        body: form,
      });
    } catch { /* */ }
  }
  e.target.value = '';
  await load();
}

onMounted(load);
watch(() => site.currentSiteId, load);
</script>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
.media-item { padding: 0; overflow: hidden; }
.media-item img {
  width: 100%;
  height: 140px;
  object-fit: cover;
}
.media-file-icon {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: var(--bg-input);
}
.media-info { padding: 0.75rem; }
.media-name { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.media-meta { font-size: 0.7rem; color: var(--text-muted); }
</style>
