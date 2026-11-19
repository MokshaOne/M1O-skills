import { defineStore } from 'pinia';
import { api, setTokens, onAuthFailure } from '../api/client.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    loading: true,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
  },

  actions: {
    async login(email, password) {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setTokens(data.accessToken, data.refreshToken);
      this.user = data.user;
      return data;
    },

    async fetchUser() {
      try {
        this.user = await api('/auth/me');
      } catch {
        this.user = null;
        setTokens(null, null);
      } finally {
        this.loading = false;
      }
    },

    logout() {
      setTokens(null, null);
      this.user = null;
    },

    init() {
      onAuthFailure(() => this.logout());
    },
  },
});
