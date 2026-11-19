<template>
  <div>
    <div class="page-header">
      <h1>Entries</h1>
      <button class="btn btn-primary" @click="showCreate = true" :disabled="!contentTypes.length">+ Neu</button>
    </div>

    <div style="margin-bottom:1rem">
      <select v-model="selectedCt" class="form-select" style="max-width:300px" @change="load">
        <option value="">Alle Content Types</option>
        <option v-for="ct in contentTypes" :key="ct.id" :value="ct.id">{{ ct.name }}</option>
      </select>
    </div>

    <div v-if="loading" class="empty"><div class="spinner"></div></div>
    <div v-else-if="!items.length" class="empty">Keine Entries vorhanden</div>
    <div v-else class="card table-wrap">
      <table>
        <thead><tr><th>Title</th><th>Slug</th><th>Content Type</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in items" :key="e.id">
            <td><router-link :to="`/entries/${e.id}`">{{ e.title || e.slug }}</router-link></td>
            <td><code>{{ e.slug }}</code></td>
            <td>{{ ctName(e.content_type_id) }}</td>
            <td>
              <span class="badge" :class="statusClass(e.status)">{{ e.status }}</span>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" @click="remove(e)">Löschen</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="card" style="width:450px">
        <h3 style="margin-bottom:1rem">Neuer Entry</h3>
        <form @submit.prevent="create">
          <div class="form-group">
            <label>Content Type</label>
            <select v-model="form.contentTypeId" class="form-select" required>
              <option v-for="ct in contentTypes" :key="ct.id" :value="ct.id">{{ ct.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Title</label>
            <input v-model="form.title" class="form-input" required />
          </div>
          <div class="form-group">
            <label>Slug</label>
            <input v-model="form.slug" class="form-input" required pattern="[a-z0-9-]+" />
          </div>
          <div style="display:flex;gap:0.5rem;justify-content:flex-end">
            <button type="button" class="btn btn-ghost" @click="showCreate = false">Abbrechen</button>
            <button type="submit" class="btn btn-primary">Erstellen</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import { useSiteStore } from '../stores/site.js';
import { api } from '../api/client.js';

const site = useSiteStore();
const items = ref([]);
const contentTypes = ref([]);
const selectedCt = ref('');
const loading = ref(true);
const showCreate = ref(false);
const form = reactive({ contentTypeId: '', title: '', slug: '' });

async function loadCts() {
  if (!site.currentSiteId) return;
  contentTypes.value = await api(`/sites/${site.currentSiteId}/content-types`);
  if (contentTypes.value.length) form.contentTypeId = contentTypes.value[0].id;
}

async function load() {
  if (!site.currentSiteId) return;
  loading.value = true;
  try {
    const params = selectedCt.value ? `?contentTypeId=${selectedCt.value}` : '';
    items.value = await api(`/sites/${site.currentSiteId}/entries${params}`);
    // Handle paginated response
    if (items.value.entries) items.value = items.value.entries;
  } catch { items.value = []; }
  loading.value = false;
}

function ctName(id) {
  return contentTypes.value.find(c => c.id === id)?.name || '—';
}

function statusClass(s) {
  if (s === 'published') return 'badge-success';
  if (s === 'draft') return 'badge-warning';
  return '';
}

async function create() {
  await api(`/sites/${site.currentSiteId}/entries`, {
    method: 'POST',
    body: {
      contentTypeId: form.contentTypeId,
      title: form.title,
      slug: form.slug,
      data: {},
      status: 'draft',
    },
  });
  showCreate.value = false;
  form.title = '';
  form.slug = '';
  await load();
}

async function remove(e) {
  if (!confirm(`"${e.title || e.slug}" wirklich löschen?`)) return;
  await api(`/sites/${site.currentSiteId}/entries/${e.id}`, { method: 'DELETE' });
  await load();
}

onMounted(async () => {
  await loadCts();
  await load();
});
watch(() => site.currentSiteId, async () => { await loadCts(); await load(); });
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
</style>
