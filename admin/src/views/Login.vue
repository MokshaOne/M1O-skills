<template>
  <div class="login-page">
    <div class="card login-card">
      <h1>M10 CMS</h1>
      <div v-if="error" class="login-error">{{ error }}</div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>Email</label>
          <input v-model="email" type="email" class="form-input" required autofocus />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input v-model="password" type="password" class="form-input" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>Login</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useSiteStore } from '../stores/site.js';

const auth = useAuthStore();
const site = useSiteStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    await site.fetchSites();
    site.restoreSite();
    router.push('/');
  } catch (e) {
    error.value = e.message || 'Login fehlgeschlagen';
  } finally {
    loading.value = false;
  }
}
</script>
