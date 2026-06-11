// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    optimizeDeps: {
      // MSW is test-only and pulls in Node-only internals that Vite's
      // browser-targeted pre-bundler cannot resolve.
      exclude: ['msw'],
    },
  },
});