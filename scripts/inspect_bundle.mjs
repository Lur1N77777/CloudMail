import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../frontend/assets');
const files = ['index-hOIMbO0y.js', 'Admin-DL1NEMu-.js', 'SendMail-BRsVC6Xo.js'];

// Search terms: endpoint names and header/auth keywords
const searches = [
  '/open_api/settings',
  '/api/settings',
  '/user_api/open_settings',
  '/open_api/admin_login',
  'x-admin-auth',
  'x-custom-auth',
  'x-user-token',
  'x-user-access-token',
  'defaultDomains',
  'adminContacts',
  'telegram'
];

for (const f of files) {
  const c = fs.readFileSync(path.join(dir, f), 'utf8');
  console.log('=== ' + f + ' (' + c.length + ' chars) ===');
  for (const s of searches) {
    let idx = 0;
    let found = 0;
    while ((idx = c.indexOf(s, idx)) !== -1 && found < 3) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(c.length, idx + s.length + 200);
      console.log('[' + s + '] @' + idx + ': ' + c.slice(start, end).replace(/\s+/g, ' '));
      console.log('---');
      idx += s.length;
      found++;
    }
  }
  console.log('');
}

