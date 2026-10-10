// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages では Actions が SITE と BASE_PATH を渡す（.github/workflows/deploy.yml）。
// 手元では未設定のままでよい。
export default defineConfig({
  site: process.env.SITE || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
});
