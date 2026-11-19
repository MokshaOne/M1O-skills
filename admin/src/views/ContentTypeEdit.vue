<template>
  <div>
    <div class="page-header">
      <h1>{{ ct?.name || 'Content Type' }}</h1>
      <button class="btn btn-primary" @click="save" :disabled="saving">Speichern</button>
    </div>

    <div v-if="loading" class="empty"><div class="spinner"></div></div>
    <template v-else-if="ct">
      <div class="card" style="margin-bottom:1rem">
        <div class="form-group">
          <label>Name</label>
          <input v-model="ct.name" class="form-input" />
        </div>
        <div class="form-group">
          <label>Slug</label>
          <input v-model="ct.slug" class="form-input" disabled />
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3>Fields ({{ ct.fields?.length || 0 }})</h3>
          <button class="btn btn-ghost btn-sm" @click="addField">+ Field</button>
        </div>

        <div v-if="!ct.fields?.length" class="empty">Keine Fields definiert</div>
        <div v-for="(f, i) in ct.fields" :key="i" class="field-row">
          <div class="field-row-grid">
            <div class="form-group">
              <label>Name</label>
              <input v-model="f.name" class="form-input" />
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input v-model="f.slug" class="form-input" />
            </div>
            <div class="form-group">
              <label>Type</label>
              <select v-model="f.type" class="form-select">
                <option v-for="t in fieldTypes" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="form-group" style="display:flex;align-items:end">
              <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
                <input type="checkbox" v-model="f.required" /> Required
              </label>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" @click="ct.fields.splice(i, 1)">×</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSiteStore } from '../stores/site.js';
import { api } from '../api/client.js';

const route = useRoute();
const router = useRouter();
const site = useSiteStore();

const ct = ref(null);
const loading = ref(true);
const saving = ref(false);

const fieldTypes = [
  'text', 'textarea', 'richtext', 'number', 'boolean',
  'date', 'datetime', 'email', 'url', 'slug',
  'select', 'media', 'json', 'relation',
];

async function load() {
  loading.value = true;
  try {
    ct.value = await api(`/sites/${site.currentSiteId}/content-types/${route.params.id}`);
    if (!ct.value.fields) ct.value.fields = [];
  } catch {
    router.push('/content-types');
  }
  loading.value = false;
}

function addField() {
  ct.value.fields.push({ name: '', slug: '', type: 'text', required: false });
}

async function save() {
  saving.value = true;
  try {
    await api(`/sites/${site.currentSiteId}/content-types/${route.params.id}`, {
      method: 'PUT',
      body: { name: ct.value.name, slug: ct.value.slug, fields: ct.value.fields },
    });
    alert('Gespeichert!');
  } catch (e) {
    alert('Fehler: ' + e.message);
  }
  saving.value = false;
}

onMounted(load);
</script>

<style scoped>
.field-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}
.field-row:last-child { border-bottom: none; }
.field-row-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 0.75rem;
}
</style>
