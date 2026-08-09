#!/usr/bin/env node
/**
 * Merges the curated dataset with the harvested IMSLP dataset into the single
 * data/works.json the browser app loads, then emits a self-contained
 * dist/oboe-finder.html with the data and code inlined.
 *
 * Curated entries win over harvested ones for the same work: IMSLP records
 * orchestral scoring as the single word "orchestra", which is exactly the
 * detail this app exists to supply.
 *
 * Usage: node tools/build.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInstrumentation, formatOboeScoring, requiredInstruments } from '../lib/instrumentation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

const readJson = async (file, fallback = null) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
};

const fold = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Key for detecting that curated and IMSLP describe the same work. */
const workKey = (composerId, title) =>
  `${composerId}::${fold(title).replace(/\b(no|op|the|a|in|major|minor|for)\b/g, '').replace(/\s+/g, '')}`;

/**
 * Second key on the catalogue number. Titles drift between sources
 * ("Serenade for Winds" vs "Serenade for Wind Instruments") but "Op. 44" does
 * not, so this catches duplicates that the title key misses.
 */
const catKey = (composerId, catalogue) => {
  const c = fold(catalogue).replace(/\s+/g, '');
  return c ? `${composerId}::cat::${c}` : null;
};

const curated = await readJson(p('data/curated.json'), { composers: {}, works: [] });
const imslp = await readJson(p('data/imslp.json'), { composers: [], works: [] });

const composers = new Map();
const works = [];
const seen = new Set();

function addComposer(id, name, extra = {}) {
  if (!composers.has(id)) {
    // n counts original works only; arrangements are hidden by default, so
    // advertising them in the typeahead would promise more than the app shows.
    composers.set(id, { id, name, sort: extra.sort ?? name, dates: extra.dates ?? null, aliases: extra.aliases ?? [], n: 0, nArr: 0 });
  }
  const c = composers.get(id);
  if (extra.dates && !c.dates) c.dates = extra.dates;
  if (extra.aliases) c.aliases = [...new Set([...c.aliases, ...extra.aliases])];
  return c;
}

// ── Curated ───────────────────────────────────────────────────────────────────
for (const [id, meta] of Object.entries(curated.composers ?? {})) {
  addComposer(id, meta.name, { dates: meta.dates, aliases: meta.aliases, sort: meta.sort ?? meta.name });
}

for (const w of curated.works ?? []) {
  const parsed = parseInstrumentation(w.oboes);
  if (!parsed.total) {
    process.stderr.write(`  ! curated work has no oboe-family scoring: ${w.title}\n`);
    continue;
  }
  seen.add(workKey(w.c, w.title));
  const ck = catKey(w.c, w.cat);
  if (ck) seen.add(ck);
  works.push({
    c: w.c,
    t: w.title,
    cat: w.cat || null,
    y: w.year ?? null,
    g: w.genre || 'Other',
    s: formatOboeScoring(parsed),
    counts: parsed.counts,
    req: requiredInstruments(parsed),
    full: w.full || null,
    note: w.note || null,
    arr: false,
    est: false,
    src: 'curated',
    url: null,
  });
  composers.get(w.c).n++;
}

// ── IMSLP ─────────────────────────────────────────────────────────────────────
for (const w of imslp.works ?? []) {
  if (!w.composerId || !w.composer) continue;
  const key = workKey(w.composerId, w.title);
  const ck = catKey(w.composerId, w.catalogue);
  if (seen.has(key) || (ck && seen.has(ck))) continue; // curated version already covers this work
  seen.add(key);
  if (ck) seen.add(ck);

  // Re-parse the source string so harvested rows share the app's current
  // formatting and doubling rules without needing a fresh harvest.
  const parsed = parseInstrumentation(w.full || '');
  const usable = parsed.total > 0;

  addComposer(w.composerId, w.composer, { sort: w.composerSort });
  works.push({
    c: w.composerId,
    t: w.title,
    cat: w.catalogue || null,
    y: null,
    g: w.arrangement ? 'Arrangement' : 'IMSLP catalogue',
    s: usable ? formatOboeScoring(parsed) : w.scoring,
    counts: usable ? parsed.counts : w.counts,
    req: usable ? requiredInstruments(parsed) : Object.keys(w.counts || {}).filter((k) => w.counts[k] > 0),
    full: w.full || null,
    note: null,
    arr: !!w.arrangement,
    est: !!w.estimated,
    src: 'imslp',
    url: w.url,
  });
  const c = composers.get(w.composerId);
  if (w.arrangement) c.nArr++; else c.n++;
}

// Drop composers whose every entry is an arrangement or otherwise unshowable.
for (const [id, c] of composers) if (!c.n && !c.nArr) composers.delete(id);

const payload = {
  generated: new Date().toISOString(),
  sources: {
    curated: `${curated.works?.length ?? 0} hand-checked works`,
    imslp: imslp.generated ? `IMSLP snapshot ${imslp.generated.slice(0, 10)}` : 'IMSLP not yet harvested',
  },
  stats: { works: works.length, composers: composers.size },
  composers: [...composers.values()].sort((a, b) => String(a.sort).localeCompare(String(b.sort))),
  works,
};

await fs.mkdir(p('data'), { recursive: true });
await fs.writeFile(p('data/works.json'), JSON.stringify(payload));

// ── Self-contained single-file build ──────────────────────────────────────────
const html = await fs.readFile(p('index.html'), 'utf8');
const css = await fs.readFile(p('assets/styles.css'), 'utf8');
const appJs = await fs.readFile(p('assets/app.js'), 'utf8');
const libJs = await fs.readFile(p('lib/instrumentation.mjs'), 'utf8');

const inlined = html
  .replace('<link rel="stylesheet" href="assets/styles.css" />', `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="assets/app.js"></script>',
    `<script type="module">\n${libJs.replace(/^export /gm, '')}\n` +
    `window.__WORKS_DATA__ = ${JSON.stringify(payload)};\n` +
    `${appJs.replace(/^import[\s\S]*?from '[^']*';\n/m, '')}\n</script>`
  );

await fs.mkdir(p('dist'), { recursive: true });
await fs.writeFile(p('dist/oboe-finder.html'), inlined);

const kb = (s) => `${Math.round(s / 1024)} KB`;
process.stderr.write(
  `Built data/works.json — ${payload.stats.works} works, ${payload.stats.composers} composers ` +
  `(${kb(Buffer.byteLength(JSON.stringify(payload)))})\n` +
  `Built dist/oboe-finder.html — ${kb(Buffer.byteLength(inlined))} standalone\n`
);
