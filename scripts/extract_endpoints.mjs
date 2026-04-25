import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../frontend/assets');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

const re = /["'`]\/(open_api|api|admin|user_api|telegram)\/[A-Za-z0-9_\-\/]+["'`]/g;

for (const f of files) {
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  const endpoints = new Set();
  let m;
  while ((m = re.exec(c)) !== null) {
    endpoints.add(m[0].replace(/["'`]/g, ''));
  }
  if (endpoints.size === 0) continue;
  console.log('=== ' + f + ' ===');
  [...endpoints].sort().forEach((e) => console.log('  ' + e));
}

