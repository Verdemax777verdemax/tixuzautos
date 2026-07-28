const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'netlify', 'functions'),
  path.join(root, 'youtube', 'transcripciones'),
];

const mojibakePairs = [
  ['\u00c3\u00a1', '\u00e1'],
  ['\u00c3\u00a9', '\u00e9'],
  ['\u00c3\u00ad', '\u00ed'],
  ['\u00c3\u00b3', '\u00f3'],
  ['\u00c3\u00ba', '\u00fa'],
  ['\u00c3\u00bc', '\u00fc'],
  ['\u00c3\u00b1', '\u00f1'],
  ['\u00c3\u0081', '\u00c1'],
  ['\u00c3\u0089', '\u00c9'],
  ['\u00c3\u008d', '\u00cd'],
  ['\u00c3\u0093', '\u00d3'],
  ['\u00c3\u009a', '\u00da'],
  ['\u00c3\u009c', '\u00dc'],
  ['\u00c3\u0091', '\u00d1'],
  ['\u00c3\u2030', '\u00c9'],
  ['\u00c3\u201c', '\u00d3'],
  ['\u00c3\u0161', '\u00da'],
  ['\u00c3\u0153', '\u00dc'],
  ['\u00c3\u2018', '\u00d1'],
  ['\u00c2\u00bf', '\u00bf'],
  ['\u00c2\u00a1', '\u00a1'],
  ['\u00c2\u00b7', '\u00b7'],
  ['\u00c2\u00ba', '\u00ba'],
  ['\u00c2\u00aa', '\u00aa'],
  ['\u00c2\u00ab', '\u00ab'],
  ['\u00c2\u00bb', '\u00bb'],
  ['\u00c2\u00a0', ' '],
  ['\u00e2\u0080\u009c', '\u201c'],
  ['\u00e2\u0080\u009d', '\u201d'],
  ['\u00e2\u0080\u0098', '\u2018'],
  ['\u00e2\u0080\u0099', '\u2019'],
  ['\u00e2\u0080\u0093', '\u2013'],
  ['\u00e2\u0080\u0094', '\u2014'],
  ['\u00e2\u0080\u00a6', '\u2026'],
  ['\u00e2\u0080\u00a2', '\u2022'],
  ['\u00e2\u0082\u00ac', '\u20ac'],
  ['\u00e2\u009a\u00a1', '\u26a1'],
  ['\u00e2\u20ac\u0153', '\u201c'],
  ['\u00e2\u20ac\u009d', '\u201d'],
  ['\u00e2\u20ac\u2122', '\u2019'],
  ['\u00e2\u20ac\u201c', '\u2013'],
  ['\u00e2\u20ac\u201d', '\u2014'],
  ['\u00e2\u20ac\u00a6', '\u2026'],
  ['\u00e2\u20ac\u00a2', '\u2022'],
  ['\u00e2\u0161\u00a1', '\u26a1'],
  ['\u00ef\u00b8\u008f', ''],
  ['\u00f0\u009f\u009a\u0097', '\ud83d\ude97'],
  ['\u00f0\u009f\u009b\u0091', '\ud83d\uded1'],
  ['\u00f0\u009f\u0094\u00a5', '\ud83d\udd25'],
  ['\u00f0\u009f\u0093\u008d', '\ud83d\udccd'],
  ['\u00f0\u009f\u00a4\u009d', '\ud83e\udd1d'],
  ['\u00f0\u009f\u0091\u0089', '\ud83d\udc49'],
  ['\u00f0\u009f\u00a7\u00a0', '\ud83e\udde0'],
  ['\u00f0\u009f\u0094\u008d', '\ud83d\udd0d'],
  ['\u00f0\u009f\u0092\u00ac', '\ud83d\udcac'],
  ['\u00f0\u009f\u0093\u008b', '\ud83d\udccb'],
  ['\u00f0\u0178\u0161\u2014', '\ud83d\ude97'],
  ['\u00f0\u0178\u203a\u2018', '\ud83d\uded1'],
  ['\u00f0\u0178\u201d\u00a5', '\ud83d\udd25'],
  ['\u00f0\u0178\u201c\u008d', '\ud83d\udccd'],
  ['\u00f0\u0178\u00a4\u009d', '\ud83e\udd1d'],
  ['\u00f0\u0178\u2018\u2030', '\ud83d\udc49'],
  ['\u00f0\u0178\u00a7\u00a0', '\ud83e\udde0'],
  ['\u00f0\u0178\u201d\u008d', '\ud83d\udd0d'],
  ['\u00f0\u0178\u2019\u00ac', '\ud83d\udcac'],
  ['\u00f0\u0178\u201c\u2039', '\ud83d\udccb'],
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.(?:js|cjs|mjs|html|json|txt|xml)$/i.test(entry.name)) return [];
    return [full];
  });
}

function repairText(text) {
  let next = text;
  for (const [bad, good] of mojibakePairs) {
    next = next.split(bad).join(good);
  }
  next = next
    .replace(/www\.youtube\.com\/watchv=/g, 'www.youtube.com/watch?v=')
    .replace(/feeds\/videos\.xmlchannel_id=/g, 'feeds/videos.xml?channel_id=')
    .replace(/rest\/v1\/([A-Za-z0-9_]+)select=/g, 'rest/v1/$1?select=')
    .replace(/https:\/\/tixuzautos\.com\/publicar=1/g, 'https://tixuzautos.com/?publicar=1')
    .replace(/href="\/publicar=1"/g, 'href="/?publicar=1"')
    .replace(/href='\/publicar=1'/g, "href='/?publicar=1'")
    .replace(/href="\/lote=1/g, 'href="/?lote=1')
    .replace(/href='\/lote=1/g, "href='/?lote=1")
    .replace(/Autoridad automotriz/g, 'Biblioteca automotriz')
    .replace(/YouTube convertido en autoridad automotriz/g, 'Biblioteca YouTube Tixuz')
    .replace(/>Autoridad<\/a>/g, '>Biblioteca</a>')
    .replace(/Para que sirve esta autoridad/g, 'Para que sirve esta biblioteca')
    .replace(/Lote fundador Tixuz Autos/g, 'Vendedor Tixuz Autos')
    .replace(/Lote fundador/g, 'Agencia');
  return next;
}

const files = targets.flatMap(walk);
let changed = 0;
for (const file of files) {
  const oldText = fs.readFileSync(file, 'utf8');
  const newText = repairText(oldText);
  if (newText !== oldText) {
    fs.writeFileSync(file, newText, 'utf8');
    changed += 1;
  }
}

console.log(`Repaired ${changed} files`);
