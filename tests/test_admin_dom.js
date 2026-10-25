const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Admiralty Admin Portal DOM & UI Elements...');

const htmlPath = path.join(__dirname, '../private/dashboard.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify required sections & modals exist
assert.ok(html.includes('id="roundControlDeck"'), 'Must have #roundControlDeck');
assert.ok(html.includes('id="riddleBankSection"'), 'Must have #riddleBankSection');
assert.ok(html.includes('id="assignmentMatrixSection"'), 'Must have #assignmentMatrixSection');
assert.ok(html.includes('id="prelaunchValidationModal"'), 'Must have #prelaunchValidationModal');
assert.ok(html.includes('id="auditOverrideModal"'), 'Must have #auditOverrideModal');
assert.ok(html.includes('id="newRiddleModal"'), 'Must have #newRiddleModal');
assert.ok(html.includes('id="privatePreviewModal"'), 'Must have #privatePreviewModal');

// 2. Verify interactive action triggers
assert.ok(html.includes('openNewRiddleModal'), 'Must have openNewRiddleModal function');
assert.ok(html.includes('validateRoundModal'), 'Must have validateRoundModal function');
assert.ok(html.includes('activateRoundAction'), 'Must have activateRoundAction function');
assert.ok(html.includes('previewTeamChallenge'), 'Must have previewTeamChallenge function');

// 3. Strict constraint: ZERO lock emojis
assert.ok(!html.includes('🔒'), 'No 🔒 emojis permitted');
assert.ok(!html.includes('🔓'), 'No 🔓 emojis permitted');

console.log('✅ Admiralty Admin Portal DOM & UI Elements verified successfully!');
