import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../frontend/assets');
const files = ['index-hOIMbO0y.js', 'Admin-DL1NEMu-.js', 'SendMail-BRsVC6Xo.js', 'SendMail-CuWAsHUf.js', 'Mail-Dhfh2IDH.js'];

const searches = process.argv.slice(2);

for (const f of files) {
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const s of searches) {
    let idx = 0;
    let found = 0;
    while ((idx = c.indexOf(s, idx)) !== -1 && found < 5) {
      const start = Math.max(0, idx - 100);
      const end = Math.min(c.length, idx + s.length + 300);
      console.log('[' + f + '] [' + s + '] @' + idx);
      console.log('  ' + c.slice(start, end).replace(/\s+/g, ' '));
      console.log('---');
      idx += s.length;
      found++;
    }
  }
}

