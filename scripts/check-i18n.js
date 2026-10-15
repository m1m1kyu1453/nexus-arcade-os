// Checks message files: every key must exist in every language (error), and keys that no
// source file mentions are listed as possibly unused (warning — keys can be built dynamically,
// e.g. `storage.${kind}Title`). Runs in CI as part of `npm run lint`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const LOCALES = ['en', 'de'];

/** Flattens nested messages; plural objects ({ one, other, … }) are leaves. */
function keysOf(messages, prefix = '') {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const isPlural = value && typeof value === 'object' && ('other' in value || 'one' in value);
    return value && typeof value === 'object' && !isPlural ? keysOf(value, path) : [path];
  });
}

/** @param {string} dir */
function sourceFiles(dir, skip = () => false) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (skip(path)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path, skip);
    return /\.(js|html)$/.test(name) ? [path] : [];
  });
}

/** Message namespaces: the system messages and each app/game with an i18n folder. */
const namespaces = [
  {
    name: 'system',
    dir: join(root, 'src/i18n'),
    sources: sourceFiles(join(root, 'src'), (p) => /[\\/](apps|games)[\\/]/.test(p)),
  },
];
for (const base of ['src/apps', 'src/games', 'src/dev']) {
  const dir = join(root, base);
  for (const name of readdirSync(dir)) {
    const i18n = join(dir, name, 'i18n');
    try {
      if (statSync(i18n).isDirectory())
        namespaces.push({ name: `${base}/${name}`, dir: i18n, sources: sourceFiles(join(dir, name)) });
    } catch {
      // no i18n folder
    }
  }
}

let errors = 0;
let warnings = 0;
for (const ns of namespaces) {
  const sets = Object.fromEntries(
    LOCALES.map((l) => [l, new Set(keysOf(JSON.parse(readFileSync(join(ns.dir, `${l}.json`), 'utf8'))))]),
  );
  const all = new Set(LOCALES.flatMap((l) => [...sets[l]]));
  for (const locale of LOCALES) {
    const missing = [...all].filter((k) => !sets[locale].has(k));
    for (const key of missing) console.error(`✖ ${ns.name}: "${key}" is missing in ${locale}.json`);
    errors += missing.length;
  }
  const code = ns.sources.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const key of all) {
    // Used if the key appears literally, or its parent appears in a template (`storage.${kind}Title`).
    const parent = key.includes('.') ? key.slice(0, key.lastIndexOf('.') + 1) : '';
    const leaf = key.slice(parent.length);
    const dynamic =
      code.includes(`${parent}\${`) || code.includes(`'${leaf}'`) || (parent === '' && code.includes(`'${key}'`));
    if (!code.includes(key) && !dynamic) {
      console.warn(`⚠ ${ns.name}: "${key}" looks unused`);
      warnings++;
    }
  }
}

const files = namespaces.map((n) => relative(root, n.dir)).join(', ');
console.log(`i18n: ${namespaces.length} namespace(s) (${files}): ${errors} missing, ${warnings} possibly unused`);
process.exit(errors ? 1 : 0);
