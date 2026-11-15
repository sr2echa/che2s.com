import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  integrations: [react()],
  devToolbar: { enabled: false },
  vite: {
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['onnxruntime-web'] },
    // Use ONNX Runtime's "external wasm" build: it embeds no .wasm and loads glue + wasm from env.wasm.wasmPaths (the CDN),
    // so the 14 MB runtime is never bundled into our deploy.
    resolve: { alias: { 'onnxruntime-web/wasm': fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)) } },
  },
});
