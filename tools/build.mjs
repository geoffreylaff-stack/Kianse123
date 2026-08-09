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

/**
 * Third key, on numbered forms. Wikipedia titles a work "Symphony No. 9" where
 * the curated entry is "Symphony No. 9 in E minor, 'From the New World'" — no
 * amount of title normalisation makes those equal, but (symphony, 9) does.
 * The qualifier keeps "Piano Concerto No. 2" apart from "Violin Concerto No. 2".
 */
const formKey = (composerId, title) => {
  const m = /^(.*?)\b(symphony|symphonies|concerto|quartet|quintet|sonata|trio|octet|sextet|septet|serenade|suite|rhapsody|overture|mass)\b[\s,]*(?:no\.?\s*)?(\d+)/i
    .exec(fold(title));
  if (!m) return null;
  const qualifier = (m[1].trim().split(/\s+/).pop() || '').replace(/[^a-z]/g, '');
  return `${composerId}::form::${qualifier}-${m[2]}-${m[3]}`;
};

const curated = await readJson(p('data/curated.json'), { composers: {}, works: [] });
const wikipedia = await readJson(p('data/wikipedia.json'), { works: [] });
const imslp = await readJson(p('data/imslp.json'), { composers: [], works: [] });

const composers = new Map();
const byName = new Map(); // fold(display name) -> id
const works = [];
const seen = new Set();

/** "Sergei Rachmaninoff" -> "Rachmaninoff, Sergei" */
function toSortForm(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts.at(-1)}, ${parts.slice(0, -1).join(' ')}`;
}

const idFromSort = (sort) => fold(sort).replace(/\s+/g, '-');

/**
 * Resolve a composer across the three sources. Identity is matched on the
 * display name, not on a derived id: Wikipedia says "Pyotr Ilyich Tchaikovsky"
 * and IMSLP says "Tchaikovsky, Pyotr", which would otherwise become two people.
 */
function resolveComposer(name, extra = {}) {
  const key = fold(name);
  let id = byName.get(key) ?? extra.id;
  if (!id) id = idFromSort(extra.sort ?? toSortForm(name));

  if (!composers.has(id)) {
    // n counts original works only; arrangements are hidden by default, so
    // advertising them in the typeahead would promise more than the app shows.
    composers.set(id, {
      id, name, sort: extra.sort ?? toSortForm(name),
      dates: extra.dates ?? null, aliases: extra.aliases ?? [], n: 0, nArr: 0,
    });
  }
  byName.set(key, id);

  const c = composers.get(id);
  if (extra.dates && !c.dates) c.dates = extra.dates;
  if (extra.aliases) c.aliases = [...new Set([...c.aliases, ...extra.aliases])];
  return c;
}

// ── Curated ───────────────────────────────────────────────────────────────────
for (const [id, meta] of Object.entries(curated.composers ?? {})) {
  resolveComposer(meta.name, { id, dates: meta.dates, aliases: meta.aliases, sort: meta.sort });
}

for (const w of curated.works ?? []) {
  const parsed = parseInstrumentation(w.oboes);
  if (!parsed.total) {
    process.stderr.write(`  ! curated work has no oboe-family scoring: ${w.title}\n`);
    continue;
  }
  seen.add(workKey(w.c, w.title));
  for (const k of [catKey(w.c, w.cat), formKey(w.c, w.title)]) if (k) seen.add(k);
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

// ── Wikipedia ─────────────────────────────────────────────────────────────────
// Ranked above IMSLP: for orchestral works IMSLP records only "orchestra",
// while the Wikipedia article gives the full wind complement.
/**
 * Works filed directly under "Compositions by X" have no subcategory to name
 * their genre, so the harvester defaults them to "Orchestral". The title is a
 * better witness than that default.
 */
function genreFromTitle(title, fallback) {
  const t = title.toLowerCase();
  if (/\bsymphon(y|ie|ia)\b/.test(t) && !/symphonic poem/.test(t)) return 'Symphony';
  if (/\bconcert(o|ino)\b/.test(t)) return 'Concerto';
  if (/\boverture\b/.test(t)) return 'Overture';
  if (/\b(sonata|quartet|quintet|trio|octet|sextet|septet|duo)\b/.test(t)) return 'Chamber';
  if (/\b(mass|requiem|te deum|oratorio|cantata|psalm)\b/.test(t)) return 'Sacred vocal';
  if (/\b(suite|serenade|divertimento)\b/.test(t)) return 'Suite';
  if (/\b(ballet|pas de deux)\b/.test(t)) return 'Ballet';
  if (/\b(opera|opéra)\b/.test(t)) return 'Opera';
  if (/\b(symphonic poem|tone poem)\b/.test(t)) return 'Tone poem';
  return fallback;
}

for (const w of wikipedia.works ?? []) {
  if (!w.composer || !w.scoring) continue;
  const c = resolveComposer(w.composer);

  // Article titles carry a disambiguator: "Symphony No. 2 (Rachmaninoff)".
  const title = w.page.replace(/\s*\([^()]*\)\s*$/, '').trim() || w.page;
  const key = workKey(c.id, title);
  const fk = formKey(c.id, title);
  if (seen.has(key) || (fk && seen.has(fk))) continue; // curated already covers it
  seen.add(key);
  if (fk) seen.add(fk);

  // Re-parse the stored source text when it is present, so a parser change
  // reaches the index through `npm run build` alone rather than requiring
  // another full sweep of 3,200 articles.
  const reparsed = w.text ? parseInstrumentation(w.text) : null;
  const usable = reparsed?.total > 0;

  works.push({
    c: c.id,
    t: title,
    cat: null,
    y: null,
    g: w.subcat ? (w.genre || 'Orchestral') : genreFromTitle(title, w.genre || 'Orchestral'),
    s: usable ? formatOboeScoring(reparsed) : w.scoring,
    counts: usable ? reparsed.counts : w.counts,
    req: usable ? requiredInstruments(reparsed) : w.req,
    full: w.full || null,
    note: null,
    arr: false,
    est: usable ? reparsed.uncertain.length > 0 : !!w.estimated,
    src: 'wikipedia',
    url: w.url,
  });
  c.n++;
}

// ── IMSLP ─────────────────────────────────────────────────────────────────────
for (const w of imslp.works ?? []) {
  if (!w.composerId || !w.composer) continue;
  const c = resolveComposer(w.composer, { id: w.composerId, sort: w.composerSort });

  const key = workKey(c.id, w.title);
  const ck = catKey(c.id, w.catalogue);
  const fk = formKey(c.id, w.title);
  if (seen.has(key) || (ck && seen.has(ck)) || (fk && seen.has(fk))) continue; // a better source already covers it
  seen.add(key);
  for (const k of [ck, fk]) if (k) seen.add(k);

  // Re-parse the source string so harvested rows share the app's current
  // formatting and doubling rules without needing a fresh harvest.
  const parsed = parseInstrumentation(w.full || '');
  const usable = parsed.total > 0;

  works.push({
    c: c.id,
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
  if (w.arrangement) c.nArr++; else c.n++;
}

// Drop composers whose every entry is an arrangement or otherwise unshowable.
for (const [id, c] of composers) if (!c.n && !c.nArr) composers.delete(id);

const payload = {
  generated: new Date().toISOString(),
  sources: {
    curated: `${curated.works?.length ?? 0} hand-checked works`,
    wikipedia: wikipedia.generated
      ? `Wikipedia snapshot ${wikipedia.generated.slice(0, 10)}`
      : 'Wikipedia not yet harvested',
    imslp: imslp.generated ? `IMSLP snapshot ${imslp.generated.slice(0, 10)}` : 'IMSLP not yet harvested',
  },
  stats: { works: works.length, composers: composers.size },
  composers: [...composers.values()].sort((a, b) => String(a.sort).localeCompare(String(b.sort))),
  works,
};

await fs.mkdir(p('data'), { recursive: true });
await fs.writeFile(p('data/works.json'), JSON.stringify(payload));

/**
 * Plausibility report. An over-count from mis-read source text looks exactly
 * like a legitimate large section, so it never announced itself — "eight oboes"
 * for Die ägyptische Helena sat in the index unflagged. Very large sections are
 * rare and real ones are famous (Handel's Fireworks, The Rite of Spring), so
 * listing them at build time makes a regression visible instead of silent.
 * Curated rows are hand-checked and exempt.
 */
const OBOE_SECTION_LIMIT = 5;
const implausible = works.filter((w) => {
  if (w.src === 'curated' || w.arr) return false;
  const total = Object.values(w.counts ?? {}).reduce((s, n) => s + (n || 0), 0);
  return total > OBOE_SECTION_LIMIT;
});
if (implausible.length) {
  process.stderr.write(`\n  ${implausible.length} work(s) with more than ${OBOE_SECTION_LIMIT} oboe-family players — worth an eyeball:\n`);
  for (const w of implausible.slice(0, 20)) {
    process.stderr.write(`    ${w.s}  —  ${w.t} (${w.src})\n`);
  }
}

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
