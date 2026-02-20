import fs from 'fs';
import https from 'https';

const API_KEY     = process.env.ANTHROPIC_API_KEY || '';
const SOURCE_NAME = process.env.SOURCE_NAME || '';
const INPUT       = process.env.INPUT_FILE || 'posts_complete.json';
const OUTPUT      = process.env.OUTPUT_FILE || 'posts_cleaned.json';
const PROGRESS    = 'clean_progress.json';
const DELAY       = 800;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── STRIP HTML FROM INPUT ──────────────────────────────────────
function stripHTML(t) {
  if (!t) return '';
  t = t.replace(/<https?:\/\/[^>]+>/g, '');
  t = t.replace(/https?:\/\/\S+/g, '');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/\[content_ad_unit[^\]]*\]/g, '');
  t = t.replace(/ {2,}/g, ' ');
  return t.trim();
}

// ── REGEX QUOTE FIXER — runs on Claude OUTPUT ──────────────────
// Claude handles paragraphs. Regex handles quote artifacts.
function fixQuotes(t) {
  if (!t) return '';

  // Fix escaped quotes: \" → "
  t = t.replace(/\\"/g, '"');

  // Fix mismatched: "word' → "word"
  t = t.replace(/"([^"\n]{1,150})'/g, '"$1"');
  // Fix mismatched: 'word" → "word"
  t = t.replace(/'([^"\n]{1,150})"/g, '"$1"');

  // Fix space after opening quote: " word → "word
  t = t.replace(/" ([a-zA-Z0-9])/g, '"$1');

  // Fix space before closing quote: word " → word"
  t = t.replace(/([a-zA-Z0-9,\.]) "/g, '$1"');

  // Fix missing space before opening quote when preceded by a letter/number
  // e.g. said"Hello → said "Hello
  t = t.replace(/([a-zA-Z0-9])"([A-Z])/g, '$1 "$2');

  // Fix missing space after closing quote when followed by a letter
  // e.g. "word"He → "word" He
  t = t.replace(/"([^"\n]+)"([a-zA-Z])/g, '"$1" $2');

  // Normalize multiple spaces
  t = t.replace(/ {2,}/g, ' ');

  return t;
}

// ── CONVERT PARAGRAPHS TO HTML ─────────────────────────────────
function toHTML(text) {
  if (!text) return '';
  return text
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map(p => '<p>' + p + '</p>')
    .join('');
}

// ── ANTHROPIC API CALL ─────────────────────────────────────────
function callAPI(system, user) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: system,
      messages: [{ role: 'user', content: user }]
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error('HTTP ' + res.statusCode + ': ' + d));
            return;
          }
          const j = JSON.parse(d);
          resolve(j.content && j.content[0] ? j.content[0].text.trim() : null);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── PROMPTS ────────────────────────────────────────────────────
const TITLE_PROMPT = [
  'Fix typos and mismatched quotes in this article title.',
  'Mismatched means an opening double quote closed with a single quote — fix to matching double quotes.',
  'Return ONLY the corrected title. Nothing else.'
].join(' ');

const BODY_PROMPT = [
  'You are editing a music journalism article.',
  'Your only jobs are:',
  '1. Add paragraph breaks — group into paragraphs of 3-5 sentences, separated by a blank line.',
  '2. Fix obvious typos and broken punctuation.',
  '3. Do NOT change wording, meaning, or style.',
  'Return only the article text. Separate every paragraph with one blank line.'
].join(' ');

// ── MAIN ───────────────────────────────────────────────────────
async function main() {
  console.log('Cleaner starting');
  console.log('Source: ' + SOURCE_NAME);
  console.log('Input:  ' + INPUT);
  console.log('Output: ' + OUTPUT);

  if (!API_KEY) { console.error('ERROR: No API key'); process.exit(1); }
  if (!fs.existsSync(INPUT)) { console.error('ERROR: No input file: ' + INPUT); process.exit(1); }

  const posts = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const total = posts.length;
  console.log('Loaded ' + total + ' posts');

  let progress = {};
  if (fs.existsSync(PROGRESS)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log('Resuming — ' + Object.keys(progress).length + ' already done');
  }

  const result = posts.slice();
  let ok = 0;
  let err = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const key = post.post_name || String(i);

    if (progress[key]) {
      result[i] = Object.assign({}, post, progress[key], { source: SOURCE_NAME });
      continue;
    }

    console.log('[' + (i + 1) + '/' + total + '] ' + post.title.slice(0, 60));

    try {
      // ── TITLE: regex fixQuotes first, then Claude ──
      const rawTitle     = fixQuotes(post.title);
      const cleanedTitle = await callAPI(TITLE_PROMPT, rawTitle);
      await sleep(DELAY);

      // ── BODY: strip HTML → Claude for paragraphs → regex for quotes ──
      const strippedBody  = stripHTML(post.clean_content || post.content || '');
      const claudeBody    = await callAPI(BODY_PROMPT, strippedBody);
      await sleep(DELAY);

      // Regex runs on Claude's output — fixes what Claude missed
      const fixedBody     = fixQuotes(claudeBody || strippedBody);
      const finalTitle    = fixQuotes(cleanedTitle || rawTitle);

      const update = {
        title:         finalTitle,
        clean_content: toHTML(fixedBody),
        source:        SOURCE_NAME,
        ai_cleaned:    true
      };

      result[i]     = Object.assign({}, post, update);
      progress[key] = update;
      fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
      ok++;
    } catch (e) {
      console.log('Error on post ' + (i + 1) + ': ' + e.message);
      // Fallback: at minimum apply regex to original
      const fallbackTitle = fixQuotes(post.title);
      const fallbackBody  = fixQuotes(stripHTML(post.clean_content || post.content || ''));
      result[i] = Object.assign({}, post, {
        title:         fallbackTitle,
        clean_content: toHTML(fallbackBody),
        source:        SOURCE_NAME
      });
      err++;
      await sleep(2000);
    }
  }

  console.log('Done: ' + ok + ' cleaned, ' + err + ' errors');
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('Saved to ' + OUTPUT);
  if (err === 0 && fs.existsSync(PROGRESS)) fs.unlinkSync(PROGRESS);
}

main().catch(e => {
  console.error('Fatal: ' + e.message);
  process.exit(1);
});