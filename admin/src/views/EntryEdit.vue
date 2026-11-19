<template>
  <div>
    <div class="page-header">
      <h1>{{ entry?.title || 'Entry' }}</h1>
      <div style="display:flex;gap:0.5rem">
        <select v-model="entry.status" class="form-select" style="width:auto">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button class="btn btn-primary" @click="save" :disabled="saving">Speichern</button>
      </div>
    </div>

    <div v-if="loading" class="empty"><div class="spinner"></div></div>
    <template v-else-if="entry">
      <div class="card" style="margin-bottom:1rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          <div class="form-group">
            <label>Title</label>
            <input v-model="entry.title" class="form-input" />
          </div>
          <div class="form-group">
            <label>Slug</label>
            <input v-model="entry.slug" class="form-input" />
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:1rem">Content Data</h3>
        <div v-if="!fields.length" class="empty">Content Type hat keine Fields</div>
        <div v-for="f in fields" :key="f.slug" class="form-group">
          <label>{{ f.name }} <span v-if="f.required" style="color:var(--danger)">*</span></label>

          <input v-if="f.type === 'text' || f.type === 'email' || f.type === 'url' || f.type === 'slug'"
                 v-model="entry.data[f.slug]" class="form-input" :type="f.type === 'email' ? 'email' : 'text'" />

          <textarea v-else-if="f.type === 'textarea' || f.type === 'richtext'"
                    v-model="entry.data[f.slug]" class="form-textarea" rows="5" />

          <input v-else-if="f.type === 'number'"
                 v-model.number="entry.data[f.slug]" class="form-input" type="number" />

          <label v-else-if="f.type === 'boolean'" style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
            <input type="checkbox" v-model="entry.data[f.slug]" /> {{ f.name }}
          </label>

          <input v-else-if="f.type === 'date'"
                 v-model="entry.data[f.slug]" class="form-input" type="date" />

          <input v-else-if="f.type === 'datetime'"
                 v-model="entry.data[f.slug]" class="form-input" type="datetime-local" />

          <textarea v-else-if="f.type === 'json'"
                    v-model="entry.data[f.slug]" class="form-textarea" rows="4"
                    placeholder='{"key": "value"}' />

          <input v-else v-model="entry.data[f.slug]" class="form-input" />
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

const entry = ref(null);
const fields = ref([]);
const loading = ref(true);
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const e = await api(`/sites/${site.currentSiteId}/entries/${route.params.id}`);
    if (!e.data) e.data = {};
    entry.value = e;

    // Fetch content type fields
    if (e.content_type_id) {
      const ct = await api(`/sites/${site.currentSiteId}/content-types/${e.content_type_id}`);
      fields.value = ct.fields || [];
      // Initialize missing data keys
      for (const f of fields.value) {
        if (!(f.slug in e.data)) e.data[f.slug] = f.type === 'boolean' ? false : '';
      }
    }
  } catch {
    router.push('/entries');
  }
  loading.value = false;
}

async function save() {
  saving.value = true;
  try {
    await api(`/sites/${site.currentSiteId}/entries/${route.params.id}`, {
      method: 'PUT',
      body: {
        title: entry.value.title,
        slug: entry.value.slug,
        data: entry.value.data,
        status: entry.value.status,
      },
    });
    alert('Gespeichert!');
  } catch (e) {
    alert('Fehler: ' + e.message);
  }
  saving.value = false;
}

onMounted(load);
</script>
