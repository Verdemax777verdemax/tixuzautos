const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('live search waits 1400 ms, requires 3 characters and aborts pending requests', () => {
  assert.match(app, /const LIVE_SEARCH_DEBOUNCE_MS=1400/);
  assert.match(app, /if\(clean\.length<3\)/);
  assert.match(app, /externalAbortController\.abort\(\)/);
  assert.match(app, /signal:ctrl\.signal/);
  assert.match(app, /const delay=opts\.immediate\?0:LIVE_SEARCH_DEBOUNCE_MS/);
});

test('hero and filter inputs have one native input binding and no inline duplicate', () => {
  assert.doesNotMatch(index, /id="heroQ"[^>]*oninput=/);
  assert.doesNotMatch(index, /id="fQ"[^>]*oninput=/);
  assert.doesNotMatch(index, /class="hero-search"[^>]*onsubmit=/);
  assert.match(app, /input\.addEventListener\('input',\(\)=>handleLiveSearchInput\('hero'\)\)/);
  assert.match(app, /filterInput\.addEventListener\('input',\(\)=>handleLiveSearchInput\('filters'\)\)/);
});

test('Enter and Buscar use immediate search and only explicit actions scroll', () => {
  assert.match(app, /if\(ev\.key!==['"]Enter['"]\)return;[\s\S]*?forceHybridSearch\(\);[\s\S]*?scrollToInventory\(\{explicit:true\}\)/);
  assert.match(app, /form\.addEventListener\('submit',heroSearchSubmit\)/);
  assert.match(app, /scheduleExternalSearch\(qRaw,city,\{immediate:true\}\)/);
  assert.match(app, /if\(!opts\.explicit&&searchInputHasFocus\(\)\)return/);
  assert.doesNotMatch(app, /scrollToInventory\(\)(?!\s*\{)/);
});

test('native guard suppresses live-box scrolling while typing and permits explicit search', () => {
  assert.match(app, /installLiveSearchScrollGuard\(\)/);
  assert.match(app, /this\.id===['"]tixuz-live-box['"]\|\|this\.closest\?\.\(['"]#tixuz-live-box['"]\)/);
  assert.match(app, /if\(inLiveBox&&searchInputHasFocus\(\)&&!explicit\)return/);
  assert.match(app, /window\.__tixuzNativeExplicitSearchUntil=Date\.now\(\)\+3000/);
  assert.match(app, /heroSearchSubmit[\s\S]*?markExplicitSearch\(\);[\s\S]*?forceHybridSearch\(\)/);
});
