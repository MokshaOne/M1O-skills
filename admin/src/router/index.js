import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { auth: true },
  },
  {
    path: '/content-types',
    name: 'ContentTypes',
    component: () => import('../views/ContentTypes.vue'),
    meta: { auth: true },
  },
  {
    path: '/content-types/:id',
    name: 'ContentTypeEdit',
    component: () => import('../views/ContentTypeEdit.vue'),
    meta: { auth: true },
  },
  {
    path: '/entries',
    name: 'Entries',
    component: () => import('../views/Entries.vue'),
    meta: { auth: true },
  },
  {
    path: '/entries/:id',
    name: 'EntryEdit',
    component: () => import('../views/EntryEdit.vue'),
    meta: { auth: true },
  },
  {
    path: '/media',
    name: 'Media',
    component: () => import('../views/Media.vue'),
    meta: { auth: true },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/Settings.vue'),
    meta: { auth: true },
  },
];

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (auth.loading) {
    await auth.fetchUser();
  }

  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'Login' };
  }
  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'Dashboard' };
  }
});

export default router;
