#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────
// Riley Wallace Blog — AI Cleaner
// Cleans all post titles + content via Claude, saves output JSON
//
// Setup:
//   1. npm install node-fetch@2
//   2. Set your API key: export ANTHROPIC_API_KEY=sk-ant-…
//      (or paste it directly into API_KEY below)
//   3. Put posts_complete.json in the same folder as this script
//   4. node clean-posts.js
//
// It saves progress as it goes — if interrupted, re-run and it
// will skip already-cleaned posts.
// ─────────────────────────────────────────────────────────────

const fs   = require(‘fs’);
const path = require(‘path’);

// ── CONFIG ────────────────────────────────────────────────────
const API_KEY       = process.env.ANTHROPIC_API_KEY || ‘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’;
const INPUT_FILE    = ‘posts_complete.json’;
const OUTPUT_FILE   = ‘posts_cleaned.json’;
const PROGRESS_FILE = ‘clean_progress.json’; // resume support
const DELAY_MS      = 500;  // ms between API calls (avoid rate limits)
const MODEL         = ‘claude-haiku-4-5-20251001’;

// ─────────────────────────────────────────────────────────────

let fetch;
try {
fetch = require(‘node-fetch’);
} catch {
console.error(’\n❌  Missing dependency. Run: npm install node-fetch@2\n’);
process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHTML(text) {
if (!text) return ‘’;
return text
.replace(/<https?://[^>]+>/g, ‘’)
.replace(/<[^>]+>/g, ‘’)
.trim();
}

function textToHTML(text) {
if (!text) return ‘’;
return text
.split(/\n\n+/)
.map(p => `<p>${p.trim()}</p>`)
.filter(p => p !== ‘<p></p>’)
.join(’’);
}

async function callClaude(system, user) {
const res = await fetch(‘https://api.anthropic.com/v1/messages’, {
method: ‘POST’,
headers: {
‘Content-Type’: ‘application/json’,
‘x-api-key’: API_KEY,
‘anthropic-version’: ‘2023-06-01’
},
body: JSON.stringify({
model: MODEL,
max_tokens: 4096,
system,
messages: [{ role: ‘user’, content: user }]
})
});

if (!res.ok) {
const body = await res.text();
throw new Error(`API error ${res.status}: ${body}`);
}

const data = await res.json();
return data.content?.[0]?.text?.trim() || null;
}

async function cleanTitle(title) {
return callClaude(
‘You are a copy editor. Fix only typos, spacing errors, punctuation and capitalisation in this article title. Return ONLY the corrected title — no explanation, no quotes.’,
title
);
}

async function cleanContent(rawContent) {
const stripped = stripHTML(rawContent);
if (!stripped) return ‘’;

return callClaude(
`You are a copy editor. Fix typos, spacing errors, run-on words, broken punctuation and formatting issues in this article. Preserve the author's voice exactly — do not rewrite, shorten or change meaning. Separate paragraphs with a single blank line. Return ONLY the cleaned article text with no commentary, no preamble.`,
stripped
);
}

async function main() {
console.log(’\n🔍  Riley Wallace Blog — AI Cleaner’);
console.log(‘─’.repeat(40));

if (API_KEY === ‘PASTE_YOUR_KEY_HERE’) {
console.error(‘❌  No API key set. Edit the script or run:\n    export ANTHROPIC_API_KEY=sk-ant-…\n’);
process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
console.error(`❌  Input file not found: ${INPUT_FILE}\n`);
process.exit(1);
}

// Load posts
const posts = JSON.parse(fs.readFileSync(INPUT_FILE, ‘utf8’));
const total = posts.length;
console.log(`📂  Loaded ${total} posts from ${INPUT_FILE}`);

// Load progress (for resume)
let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, ‘utf8’));
const done = Object.keys(progress).length;
console.log(`♻️   Resuming — ${done} already cleaned, ${total - done} remaining`);
}

console.log(‘─’.repeat(40));

const cleaned = […posts]; // copy
let successCount = 0;
let errorCount   = 0;

for (let i = 0; i < posts.length; i++) {
const post = posts[i];
const key  = post.post_name || String(i);

```
if (progress[key]) {
  // Already done — apply cached clean data
  cleaned[i] = { ...post, ...progress[key] };
  process.stdout.write(`\r✅  [${i+1}/${total}] skipped (cached): ${post.title.slice(0,50)}…        `);
  continue;
}

process.stdout.write(`\r⏳  [${i+1}/${total}] cleaning: ${post.title.slice(0,50)}…        `);

try {
  // Clean title and content in sequence (to avoid burst rate limits)
  const cleanedTitle   = await cleanTitle(post.title);
  await sleep(DELAY_MS);
  const cleanedText    = await cleanContent(post.clean_content || post.content || '');
  await sleep(DELAY_MS);

  const update = {
    title:         cleanedTitle   || post.title,
    clean_content: cleanedText    ? textToHTML(cleanedText) : (post.clean_content || post.content || ''),
    ai_cleaned:    true
  };

  cleaned[i]    = { ...post, ...update };
  progress[key] = update;

  // Save progress after every post so we can resume safely
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  successCount++;

} catch (err) {
  console.error(`\n⚠️   Error on post "${post.title.slice(0,40)}": ${err.message}`);
  cleaned[i] = post; // keep original on error
  errorCount++;
  await sleep(1000); // back off a bit after errors
}
```

}

console.log(’\n’ + ‘─’.repeat(40));
console.log(`✅  Done! ${successCount} cleaned, ${errorCount} errors`);

// Write final output
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleaned, null, 2));
console.log(`💾  Saved → ${OUTPUT_FILE}`);

if (errorCount === 0 && fs.existsSync(PROGRESS_FILE)) {
fs.unlinkSync(PROGRESS_FILE);
console.log(`🗑️   Removed progress file (all done)`);
}

console.log(’\n📋  Next steps:’);
console.log(’    1. Upload posts_cleaned.json to your GitHub repo’);
console.log(’    2. Update the DEFAULT_URL in your blog to point to posts_cleaned.json’);
console.log(’    3. Commit — done!\n’);
}

main().catch(err => {
console.error(’\n❌  Fatal error:’, err.message);
process.exit(1);
});
