const fs = require(‘fs’);
const https = require(‘https’);

const API_KEY = process.env.ANTHROPIC_API_KEY || ‘’;
const INPUT_FILE = ‘posts_complete.json’;
const OUTPUT_FILE = ‘posts_cleaned.json’;
const PROGRESS_FILE = ‘clean_progress.json’;
const DELAY_MS = 600;
const MODEL = ‘claude-haiku-4-5-20251001’;

function sleep(ms) {
return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

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
.map(function(p) { return ‘<p>’ + p.trim() + ‘</p>’; })
.filter(function(p) { return p !== ‘<p></p>’; })
.join(’’);
}

function callClaude(system, user) {
return new Promise(function(resolve, reject) {
var body = JSON.stringify({
model: MODEL,
max_tokens: 4096,
system: system,
messages: [{ role: ‘user’, content: user }]
});

var options = {
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

var req = https.request(options, function(res) {
  var data = '';
  res.on('data', function(chunk) { data += chunk; });
  res.on('end', function() {
    try {
      if (res.statusCode !== 200) {
        reject(new Error('API error ' + res.statusCode + ': ' + data));
        return;
      }
      var parsed = JSON.parse(data);
      var text = parsed.content && parsed.content[0] && parsed.content[0].text;
      resolve(text ? text.trim() : null);
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

function cleanTitle(title) {
var system = ‘You are a copy editor. Fix only typos, spacing errors, punctuation and capitalisation in this article title. Return ONLY the corrected title with no explanation and no quotes.’;
return callClaude(system, title);
}

function cleanContent(rawContent) {
var stripped = stripHTML(rawContent);
if (!stripped) return Promise.resolve(’’);
var system = ‘You are a copy editor. Fix typos, spacing errors, run-on words, broken punctuation and formatting issues in this article. Preserve the author voice exactly. Do not rewrite or shorten. Separate paragraphs with a blank line. Return ONLY the cleaned article text with no commentary.’;
return callClaude(system, stripped);
}

async function main() {
console.log(‘Riley Wallace Blog - AI Cleaner’);
console.log(’––––––––––––––––’);

if (!API_KEY) {
console.error(‘ERROR: No API key. Set ANTHROPIC_API_KEY environment variable.’);
process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
console.error(‘ERROR: ’ + INPUT_FILE + ’ not found.’);
process.exit(1);
}

var posts = JSON.parse(fs.readFileSync(INPUT_FILE, ‘utf8’));
var total = posts.length;
console.log(‘Loaded ’ + total + ’ posts’);

var progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, ‘utf8’));
console.log(‘Resuming - ’ + Object.keys(progress).length + ’ already done’);
}

var cleaned = posts.slice();
var successCount = 0;
var errorCount = 0;

for (var i = 0; i < posts.length; i++) {
var post = posts[i];
var key = post.post_name || String(i);

if (progress[key]) {
  cleaned[i] = Object.assign({}, post, progress[key]);
  process.stdout.write('\r[' + (i + 1) + '/' + total + '] skipped: ' + post.title.slice(0, 50) + '          ');
  continue;
}

process.stdout.write('\r[' + (i + 1) + '/' + total + '] cleaning: ' + post.title.slice(0, 50) + '          ');

try {
  var cleanedTitle = await cleanTitle(post.title);
  await sleep(DELAY_MS);
  var cleanedText = await cleanContent(post.clean_content || post.content || '');
  await sleep(DELAY_MS);

  var update = {
    title: cleanedTitle || post.title,
    clean_content: cleanedText ? textToHTML(cleanedText) : (post.clean_content || post.content || ''),
    ai_cleaned: true
  };

  cleaned[i] = Object.assign({}, post, update);
  progress[key] = update;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  successCount++;
} catch (err) {
  console.log('\nError on "' + post.title.slice(0, 40) + '": ' + err.message);
  cleaned[i] = post;
  errorCount++;
  await sleep(2000);
}

}

console.log(’\n––––––––––––––––’);
console.log(‘Done! ’ + successCount + ’ cleaned, ’ + errorCount + ’ errors’);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleaned, null, 2));
console.log(’Saved: ’ + OUTPUT_FILE);

if (errorCount === 0 && fs.existsSync(PROGRESS_FILE)) {
fs.unlinkSync(PROGRESS_FILE);
}

console.log(’\nNext: upload ’ + OUTPUT_FILE + ’ to GitHub and update blog URL.’);
}

main().catch(function(err) {
console.error(’Fatal: ’ + err.message);
process.exit(1);
});