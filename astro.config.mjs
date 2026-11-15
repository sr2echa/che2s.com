import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  devToolbar: { enabled: false },
  vite: { worker: { format: 'es' }, optimizeDeps: { exclude: ['onnxruntime-web'] } },
});
