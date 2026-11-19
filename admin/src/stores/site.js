import { defineStore } from 'pinia';
import { api } from '../api/client.js';

export const useSiteStore = defineStore('site', {
  state: () => ({
    sites: [],
    currentSite: null,
    loading: false,
  }),

  getters: {
    currentSiteId: (state) => state.currentSite?.id,
  },

  actions: {
    async fetchSites() {
      this.loading = true;
      try {
        const data = await api('/sites');
        this.sites = data;
        if (!this.currentSite && data.length > 0) {
          this.currentSite = data[0];
        }
      } finally {
        this.loading = false;
      }
    },

    selectSite(site) {
      this.currentSite = site;
      localStorage.setItem('m10_site', site.id);
    },

    restoreSite() {
      const savedId = localStorage.getItem('m10_site');
      if (savedId && this.sites.length) {
        const found = this.sites.find(s => s.id === savedId);
        if (found) this.currentSite = found;
      }
    },
  },
});
