import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://fernandesdiego.github.io',
  base: '/devblog',
  integrations: [sitemap()],
});
