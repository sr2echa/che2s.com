// Vendors every heavy file into models/ so browsers can download it from this repo on GitHub (raw / jsDelivr)
// instead of from the site's host. Run after changing the stockfish or onnxruntime-web versions:
//   npm run models
import { copyFileSync, existsSync, mkdirSync, statSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const pkg = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
const copy = (from, toDir) => {
  mkdirSync(toDir, { recursive: true });
  const to = `${toDir}/${from.split('/').pop()}`;
  copyFileSync(from, to);
  console.log(`  ${to}  ${(statSync(to).size / 1e6).toFixed(1)} MB`);
};

console.log(`stockfish ${pkg('stockfish').version}`);
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) copy(`node_modules/stockfish/bin/${f}`, 'models/stockfish');
copyFileSync('node_modules/stockfish/Copying.txt', 'models/stockfish/COPYING');

const ort = pkg('onnxruntime-web').version;
console.log(`onnxruntime-web ${ort}`);
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copy(`node_modules/onnxruntime-web/dist/${f}`, `models/onnxruntime/${ort}`);
writeFileSync(`models/onnxruntime/${ort}/LICENSE.md`, `ONNX Runtime Web ${ort}, MIT License, Copyright (c) Microsoft Corporation.\nhttps://github.com/microsoft/onnxruntime/blob/main/LICENSE\n`);

const maia = 'models/maia/maia3_simplified.onnx';
console.log('maia-3');
if (existsSync(maia)) console.log(`  ${maia} already present`);
else {
  mkdirSync('models/maia', { recursive: true });
  const res = await fetch('https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/main/public/maia3/maia3_simplified.onnx');
  if (!res.ok) throw new Error(`Maia download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(maia));
  console.log(`  ${maia}  ${(statSync(maia).size / 1e6).toFixed(1)} MB`);
}
