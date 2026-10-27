// Verifies every menu item in public/index.html points to an existing file in /assets.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const match = html.match(/let menu = (\{[\s\S]*?\n {2}\});/);
assert.ok(match, 'menu definition not found in public/index.html');

const menu = vm.runInNewContext('(' + match[1] + ')');
const items = menu.categories.flatMap(cat => cat.items);
const missing = items.filter(item => !item.image || !fs.existsSync(path.join(root, item.image)));

// Compare as a string: arrays from the vm context have a different prototype.
assert.strictEqual(missing.map(item => item.name).join(', '), '', 'items with missing images');
assert.strictEqual(new Set(items.map(item => item.id)).size, items.length, 'duplicate item ids');

console.log('menu images: ' + items.length + ' items, all images found');
