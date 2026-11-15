import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync } from 'node:fs';

export default defineConfig({
  integrations: [react()],
  devToolbar: { enabled: false },
  vite: {
    plugins: [
      // Dev only: serve models/ at /dev-models, the last fallback when GitHub and the CDNs are unreachable
      // (e.g. a network that blocks .wasm downloads). Production never serves these files.
      {
        name: 'dev-models',
        configureServer(server) {
          server.middlewares.use('/dev-models', (req, res, next) => {
            const file = fileURLToPath(new URL(`./models${decodeURIComponent((req.url ?? '').split('?')[0])}`, import.meta.url));
            if (!file.startsWith(fileURLToPath(new URL('./models/', import.meta.url))) || !existsSync(file)) return next();
            const type = file.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
            res.setHeader('Content-Type', type);
            createReadStream(file).pipe(res);
          });
        },
      },
    ],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['onnxruntime-web'] },
    // Use ONNX Runtime's "external wasm" build: it embeds no .wasm and loads glue + wasm from env.wasm.wasmPaths (the CDN),
    // so the 14 MB runtime is never bundled into our deploy.
    resolve: { alias: { 'onnxruntime-web/wasm': fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)) } },
  },
});
