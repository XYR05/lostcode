const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('Testing Dashboard Scripts Syntax & Navbar Navigation Functions...');

const htmlPath = path.join(__dirname, '../private/dashboard.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify every script tag compiles with zero syntax errors
const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  count++;
  const src = match[1];
  if (!src.trim()) continue;
  try {
    new vm.Script(src, { filename: `dashboard_script_${count}.js` });
    console.log(`  ✓ Script ${count} compiled without syntax errors (${src.length} bytes)`);
  } catch (err) {
    assert.fail(`Script ${count} failed compilation: ${err.message}`);
  }
}

// 2. Verify showSection function exists and is syntactically intact
assert.ok(html.includes('function showSection(sectionId)'), 'Must declare function showSection(sectionId)');

// 3. Verify all 6 navbar links invoke showSection
const requiredSections = [
  'dashboard-content',
  'challenges-section',
  'scoreboard-section',
  'teams-section',
  'admin-section',
  'team-section'
];

requiredSections.forEach(section => {
  assert.ok(
    html.includes(`showSection('${section}')`),
    `Navbar must have link invoking showSection('${section}')`
  );
  assert.ok(
    html.includes(`id="${section}"`),
    `Dashboard must contain matching section element with id="${section}"`
  );
});

// 4. Strict styling constraint: No lock emojis
assert.ok(!html.includes('🔒'), 'No 🔒 emojis permitted');
assert.ok(!html.includes('🔓'), 'No 🔓 emojis permitted');

console.log('✅ Dashboard Scripts Syntax & Navbar Navigation verified successfully!');
