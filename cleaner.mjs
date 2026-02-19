import fs from 'fs';
import https from 'https';

const API_KEY     = process.env.ANTHROPIC_API_KEY || '';
const SOURCE_NAME = process.env.SOURCE_NAME || '';
const INPUT       = process.env.INPUT_FILE || 'posts_complete.json';
const OUTPUT      = process.env.OUTPUT_FILE || 'posts_cleaned.json';
const PROGRESS    = 'clean_progress.json';
const DELAY       = 800;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fixTitle(t) {
  if (!t) return '';
  t = t.replace(/\\"/g, '"');
  t = t.replace(/"([^"\n]{1,120})'/g, '"$1"');
  t = t.replace(/'([^"\n]{1,120})"/g, '"$1"');
  t = t.replace(/"\s+/g, '"');
  t = t.replace(/\s+"/g, '"');
  return t.trim();
}

function stripHTML(t) {
  if (!t) return '';
  t = t.replace(/<https?:\/\/[^>]+>/g, '');
  t = t.replace(/https?:\/\/\S+/g, '');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/\[content_ad_unit[^\]]*\]/g, '');
  t = t.replace(/ {2,}/g, ' ');
  return t.trim();
}

function toHTML(text) {
  if (!text) return '';
  return text
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map(p => '<p>' + p + '</p>')
    .join('');
}

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
          const text = j.content && j.content[0] ? j.content[0].text.trim() : null;
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const TITLE_PROMPT = [
  'Fix typos and mismatched quotes in this article title.',
  'A mismatched quote is when an opening double quote is closed with a single quote - fix both to double quotes.',
  'Return ONLY the corrected title. Nothing else.'
].join(' ');

const BODY_PROMPT = [
  'You are editing a music journalism article. Do exactly three things:',
  'ONE - Add paragraph breaks. Group sentences into paragraphs of 3 to 5 sentences each.',
  'Every paragraph must be separated from the next by exactly one blank line.',
  'TWO - Fix quote spacing. No space should appear directly inside a quotation mark.',
  'Wrong examples: " word" or "word ". Correct example: "word".',
  'THREE - Fix typos and broken punctuation.',
  'Do not rewrite anything. Do not change meaning.',
  'Return only the corrected article text with a blank line between every paragraph.'
].join(' ');

async function main() {
  console.log('Cleaner starting');
  console.log('Source: ' + SOURCE_NAME);
  console.log('Input: ' + INPUT);
  console.log('Output: ' + OUTPUT);

  if (!API_KEY) {
    console.error('ERROR: No API key set');
    process.exit(1);
  }
  if (!fs.existsSync(INPUT)) {
    console.error('ERROR: Input file not found: ' + INPUT);
    process.exit(1);
  }

  const posts = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const total = posts.length;
  console.log('Loaded ' + total + ' posts');

  let progress = {};
  if (fs.existsSync(PROGRESS)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log('Resuming - ' + Object.keys(progress).length + ' already done');
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
      const rawTitle = fixTitle(post.title);
      const cleanedTitle = await callAPI(TITLE_PROMPT, rawTitle);
      await sleep(DELAY);

      const rawBody = stripHTML(post.clean_content || post.content || '');
      const cleanedBody = await callAPI(BODY_PROMPT, rawBody);
      await sleep(DELAY);

      const update = {
        title: cleanedTitle || rawTitle,
        clean_content: cleanedBody ? toHTML(cleanedBody) : '<p>' + rawBody + '</p>',
        source: SOURCE_NAME,
        ai_cleaned: true
      };

      result[i] = Object.assign({}, post, update);
      progress[key] = update;
      fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
      ok++;
    } catch (e) {
      console.log('Error on post ' + (i + 1) + ': ' + e.message);
      result[i] = Object.assign({}, post, { source: SOURCE_NAME });
      err++;
      await sleep(2000);
    }
  }

  console.log('Done: ' + ok + ' cleaned, ' + err + ' errors');
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('Saved to ' + OUTPUT);

  if (err === 0 && fs.existsSync(PROGRESS)) {
    fs.unlinkSync(PROGRESS);
  }
}

main().catch(e => {
  console.error('Fatal: ' + e.message);
  process.exit(1);
});
