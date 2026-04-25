import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../frontend/assets');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

const allEndpoints = new Set();
const endpointCalls = {};

const re = /["'`]\/(?:open_api|api|admin|user_api|telegram)\/[A-Za-z0-9_\-\/${}:.]+["'`]/g;
const methodRe = /method\s*:\s*["']([A-Z]+)["']/;

for (const f of files) {
  if (f.includes('jszip') || f.includes('esm') || f.includes('workbox') || f.includes('wasm')) continue;
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  let m;
  while ((m = re.exec(c)) !== null) {
    const ep = m[0].replace(/["'`]/g, '');
    allEndpoints.add(ep);

    // Look for method within ~120 chars around this endpoint
    const start = Math.max(0, m.index - 60);
    const end = Math.min(c.length, m.index + m[0].length + 120);
    const ctx = c.slice(start, end);
    const mm = methodRe.exec(ctx);
    const method = mm ? mm[1] : 'GET';

    if (!endpointCalls[ep]) endpointCalls[ep] = new Set();
    endpointCalls[ep].add(method + ' | ' + f);
  }
}

const sorted = [...allEndpoints].sort();
console.log('## ALL ENDPOINTS USED BY WEBUI (' + sorted.length + ' total)');
console.log('');
for (const ep of sorted) {
  console.log(ep);
  for (const call of endpointCalls[ep]) {
    console.log('  ' + call);
  }
}

