<template>
  <div>
    <div class="page-header">
      <h1>Dashboard</h1>
    </div>

    <div v-if="loading" class="empty"><div class="spinner"></div></div>
    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="label">Content Types</div>
          <div class="value">{{ contentTypes.length }}</div>
        </div>
        <div class="stat-card">
          <div class="label">Entries</div>
          <div class="value">{{ totalEntries }}</div>
        </div>
        <div class="stat-card">
          <div class="label">Site</div>
          <div class="value" style="font-size:1.1rem">{{ site.currentSite?.name || '—' }}</div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:1rem">Content Types</h3>
        <div v-if="!contentTypes.length" class="empty">Keine Content Types vorhanden</div>
        <table v-else>
          <thead><tr><th>Name</th><th>Slug</th><th>Fields</th></tr></thead>
          <tbody>
            <tr v-for="ct in contentTypes" :key="ct.id">
              <td><router-link :to="`/content-types/${ct.id}`">{{ ct.name }}</router-link></td>
              <td>{{ ct.slug }}</td>
              <td>{{ ct.fields?.length || 0 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useSiteStore } from '../stores/site.js';
import { api } from '../api/client.js';

const site = useSiteStore();
const contentTypes = ref([]);
const totalEntries = ref(0);
const loading = ref(true);

async function load() {
  if (!site.currentSiteId) return;
  loading.value = true;
  try {
    contentTypes.value = await api(`/sites/${site.currentSiteId}/content-types`);
    // Count entries per content type
    let total = 0;
    for (const ct of contentTypes.value) {
      try {
        const data = await api(`/sites/${site.currentSiteId}/entries?contentTypeId=${ct.id}&limit=1`);
        total += data.total || data.length || 0;
      } catch { /* ignore */ }
    }
    totalEntries.value = total;
  } catch { /* ignore */ }
  loading.value = false;
}

onMounted(load);
watch(() => site.currentSiteId, load);
</script>
