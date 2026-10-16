const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');
const $ = id => document.getElementById(id);
// input id -> storage field
const AI_INPUTS = { key: 'aiKey', model: 'aiModel', groqKey: 'groqKey', groqModel: 'groqModel', cerebrasKey: 'cerebrasKey', cerebrasModel: 'cerebrasModel' };
const AI_FIELDS = [...Object.values(AI_INPUTS), 'aiPrimary'];
const SECRET = /\b(password|passphrase|seed|recovery phrase|private key|secret key|cvv|cvc|card number|otp|pin|bvn|nin|ssn|social security)\b/i;
// For free text we only refuse the unambiguous things, to avoid false alarms on normal sentences.
const SECRET_TEXT = /(password|passphrase|seed phrase|recovery phrase|private key|secret key|\bcvv\b|card number|\bbvn\b|\bssn\b|social security)/i;

function say(text, err = false) { statusEl.className = err ? 'err' : ''; statusEl.textContent = text; }

function field(tag, cls, value, placeholder) {
  const n = document.createElement(tag);
  n.className = cls; n.value = value || ''; n.placeholder = placeholder || '';
  return n;
}

function addRow(e = { label: '', keywords: '', value: '' }) {
  const row = document.createElement('div');
  row.className = 'row';
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.title = 'Delete row';
  del.addEventListener('click', () => row.remove());
  row.append(field('input', 'f-label', e.label, 'e.g. Full name'),
             field('input', 'f-kw', e.keywords, 'keywords, comma separated'),
             field('textarea', 'f-val', e.value, 'your answer'),
             del);
  rowsEl.append(row);
}

function header() {
  const h = document.createElement('div');
  h.className = 'row head';
  ['Label', 'Keywords', 'Answer', ''].forEach(t => { const s = document.createElement('div'); s.textContent = t; h.append(s); });
  rowsEl.append(h);
}

async function load() {
  const cfg = await chrome.storage.local.get(['profile', 'aboutMe', ...AI_FIELDS]);
  let { profile } = cfg;
  if (!Array.isArray(profile)) profile = structuredClone(globalThis.FormsDefaults);
  header();
  profile.forEach(addRow);
  $('about').value = cfg.aboutMe || '';
  for (const [id, field] of Object.entries(AI_INPUTS)) $(id).value = cfg[field] || '';
  $('primary').value = cfg.aiPrimary || 'gemini';
}

async function save() {
  const out = [];
  let blocked = 0;
  for (const row of rowsEl.querySelectorAll('.row:not(.head)')) {
    const label = row.querySelector('.f-label').value.trim();
    const keywords = row.querySelector('.f-kw').value.trim();
    const value = row.querySelector('.f-val').value.trim();
    if (!label && !value) continue;
    const bad = SECRET.test(label) || SECRET.test(keywords);
    row.classList.toggle('bad', bad);
    if (bad) { blocked++; continue; }
    out.push({ label, keywords, value });
  }
  const about = $('about').value.trim();
  const aboutBad = SECRET_TEXT.test(about);
  $('about').classList.toggle('bad-field', aboutBad);

  if (blocked || aboutBad) {
    say(blocked
      ? `${blocked} sensitive row(s) were NOT saved (red). Remove them.`
      : 'Your About me mentions passwords/seed phrases/card or ID numbers (red). Remove them; nothing was saved.', true);
    return;
  }
  const aiSettings = { aiPrimary: $('primary').value };
  for (const [id, field] of Object.entries(AI_INPUTS)) aiSettings[field] = $(id).value.trim();
  await chrome.storage.local.set({ profile: out, aboutMe: about, ...aiSettings });
  say('Saved ✓ (open forms update automatically)');
  setTimeout(() => { if (statusEl.textContent.startsWith('Saved')) statusEl.textContent = ''; }, 3000);
}

async function testAi() {
  await save();
  if (statusEl.classList.contains('err')) return;
  say('Testing each key…');
  const r = await chrome.runtime.sendMessage({ type: 'ai-test' });
  if (!r?.ok) return say('AI test failed: ' + (r?.error || 'no response'), true);
  const line = x => x.status === 'ok' ? `${x.provider} ✓` : x.status === 'no key' ? `${x.provider} — no key` : `${x.provider} ✗ ${x.error}`;
  const anyOk = r.results.some(x => x.status === 'ok');
  say(r.results.map(line).join('   ·   '), !anyOk);
}

$('add').addEventListener('click', () => addRow());
$('save').addEventListener('click', save);
$('test').addEventListener('click', testAi);
load();
