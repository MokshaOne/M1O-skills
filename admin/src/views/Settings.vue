<template>
  <div>
    <div class="page-header">
      <h1>Einstellungen</h1>
      <button class="btn btn-primary" @click="save" :disabled="saving">Speichern</button>
    </div>

    <div v-if="loading" class="empty"><div class="spinner"></div></div>
    <div v-else class="card" style="max-width:600px">
      <div class="form-group">
        <label>Site Name</label>
        <input v-model="form.name" />
      </div>
      <div class="form-group">
        <label>Slug</label>
        <input v-model="form.slug" disabled />
      </div>
      <div class="form-group">
        <label>Domain</label>
        <input v-model="form.domain" />
      </div>
      <div v-if="error" class="form-error">{{ error }}</div>
      <div v-if="success" style="color:var(--success);margin-top:0.5rem">Gespeichert!</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useSiteStore } from '../stores/site.js';
import { api } from '../api/client.js';

const site = useSiteStore();
const form = ref({ name: '', slug: '', domain: '' });
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref(false);

async function load() {
  if (!site.currentSite) return;
  loading.value = true;
  form.value = {
    name: site.currentSite.name,
    slug: site.currentSite.slug,
    domain: site.currentSite.domain || '',
  };
  loading.value = false;
}

async function save() {
  saving.value = true;
  error.value = '';
  success.value = false;
  try {
    await api(`/sites/${site.currentSiteId}`, {
      method: 'PUT',
      body: { name: form.value.name, domain: form.value.domain },
    });
    await site.fetchSites();
    success.value = true;
    setTimeout(() => success.value = false, 3000);
  } catch (e) { error.value = e.message; }
  saving.value = false;
}

onMounted(load);
watch(() => site.currentSiteId, load);
</script>
