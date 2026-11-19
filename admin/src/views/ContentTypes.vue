<template>
  <div>
    <div class="page-header">
      <h1>Content Types</h1>
      <button class="btn btn-primary" @click="showCreate = true">+ Neu</button>
    </div>

    <div v-if="loading" class="empty"><div class="spinner"></div></div>
    <div v-else-if="!items.length" class="empty">Keine Content Types vorhanden</div>
    <div v-else class="card table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Slug</th><th>Fields</th><th></th></tr></thead>
        <tbody>
          <tr v-for="ct in items" :key="ct.id">
            <td><router-link :to="`/content-types/${ct.id}`">{{ ct.name }}</router-link></td>
            <td><code>{{ ct.slug }}</code></td>
            <td>{{ ct.fields?.length || 0 }}</td>
            <td>
              <button class="btn btn-ghost btn-sm" @click="remove(ct)">Löschen</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="card" style="width:450px">
        <h3 style="margin-bottom:1rem">Neuer Content Type</h3>
        <form @submit.prevent="create">
          <div class="form-group">
            <label>Name</label>
            <input v-model="form.name" class="form-input" required />
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
const loading = ref(true);
const showCreate = ref(false);
const form = reactive({ name: '', slug: '' });

async function load() {
  if (!site.currentSiteId) return;
  loading.value = true;
  try {
    items.value = await api(`/sites/${site.currentSiteId}/content-types`);
  } catch { /* */ }
  loading.value = false;
}

async function create() {
  await api(`/sites/${site.currentSiteId}/content-types`, {
    method: 'POST',
    body: { name: form.name, slug: form.slug, fields: [] },
  });
  showCreate.value = false;
  form.name = '';
  form.slug = '';
  await load();
}

async function remove(ct) {
  if (!confirm(`"${ct.name}" wirklich löschen?`)) return;
  await api(`/sites/${site.currentSiteId}/content-types/${ct.id}`, { method: 'DELETE' });
  await load();
}

onMounted(load);
watch(() => site.currentSiteId, load);
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
