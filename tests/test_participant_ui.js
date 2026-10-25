const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Participant Island Map & Challenge Window Integration...');

const htmlPath = path.join(__dirname, '../private/dashboard.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify docking challenge window uses /api/team/challenge
assert.ok(html.includes('/api/team/challenge'), 'Must fetch participant riddle via /api/team/challenge');

// 2. Verify submission handler submits to /api/team/submit
assert.ok(html.includes('/api/team/submit'), 'Must submit flag answers via /api/team/submit');

// 3. Verify zero lock emojis
assert.ok(!html.includes('🔒'), 'Strictly zero 🔒 lock emojis permitted');
assert.ok(!html.includes('🔓'), 'Strictly zero 🔓 lock emojis permitted');

console.log('✅ Participant Island Map & Challenge Window Integration verified successfully!');
