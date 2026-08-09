import { OBOE_FAMILY, FAMILY_KEYS } from '../lib/instrumentation.mjs';

/**
 * All searching happens against an index that ships with the page, so the app
 * works offline, needs no server beyond static file hosting, and never sends
 * the user's query anywhere.
 */

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
};

const fold = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const state = {
  data: null,
  composer: null,
  required: new Set(),
  arrangements: false,
  estimated: true,
  group: true,
  sort: 'default',
};

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  // The single-file build injects the index directly; the hosted build fetches it.
  if (window.__WORKS_DATA__) return window.__WORKS_DATA__;
  const res = await fetch('data/works.json');
  if (!res.ok) throw new Error(`Could not load the work index (HTTP ${res.status}).`);
  return res.json();
}

// ── Composer matching ─────────────────────────────────────────────────────────
function indexComposers(composers) {
  return composers.map((c) => ({
    ...c,
    _folded: fold(c.name),
    _sortFolded: fold(c.sort),
    _surname: fold(String(c.sort).split(',')[0]),
    _aliases: (c.aliases ?? []).map(fold),
  }));
}

/** Ranked match: exact surname beats prefix beats substring. */
function matchComposers(query, limit = 8) {
  const q = fold(query);
  if (!q) return [];
  const scored = [];
  for (const c of state.data.composers) {
    let score = 0;
    if (c._surname === q || c._aliases.includes(q)) score = 100;
    else if (c._folded === q || c._sortFolded === q) score = 95;
    else if (c._surname.startsWith(q)) score = 80;
    else if (c._aliases.some((a) => a.startsWith(q))) score = 75;
    else if (c._folded.startsWith(q) || c._sortFolded.startsWith(q)) score = 70;
    else if (c._sortFolded.includes(q)) score = 40;
    else if (c._folded.includes(q)) score = 35;
    if (!score) continue;
    // Prefer composers we actually have a lot for; it is the better guess.
    scored.push({ c, score: score + Math.min(12, Math.log2(c.n + c.nArr + 1) * 2) });
  }
  scored.sort((a, b) => b.score - a.score || a.c._sortFolded.localeCompare(b.c._sortFolded));
  return scored.slice(0, limit).map((s) => s.c);
}

// ── Filtering ─────────────────────────────────────────────────────────────────
/** Does the work call for this instrument, whether as its own part or a doubling? */
const needs = (w, key) => (w.req?.includes(key) ?? false) || (w.counts?.[key] ?? 0) > 0;

function worksFor(composerId) {
  let list = state.data.works.filter((w) => w.c === composerId);

  if (!state.arrangements) list = list.filter((w) => !w.arr);
  if (!state.estimated) list = list.filter((w) => !w.est);
  if (state.required.size) {
    // `req` counts doubled instruments too: Dvořák 9 has no separate English
    // horn part, but it unquestionably needs an English horn player.
    list = list.filter((w) => [...state.required].every((k) => needs(w, k)));
  }

  const sectionSize = (w) => FAMILY_KEYS.reduce((sum, k) => sum + (w.counts?.[k] ?? 0), 0);
  const cmpTitle = (a, b) => a.t.localeCompare(b.t);

  switch (state.sort) {
    case 'title': list.sort(cmpTitle); break;
    case 'year': list.sort((a, b) => (a.y ?? 9999) - (b.y ?? 9999) || cmpTitle(a, b)); break;
    case 'size': list.sort((a, b) => sectionSize(b) - sectionSize(a) || cmpTitle(a, b)); break;
    default: list.sort((a, b) => a.g.localeCompare(b.g) || (a.y ?? 9999) - (b.y ?? 9999) || cmpTitle(a, b));
  }
  return list;
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderWork(w) {
  const titleText = w.cat ? `${w.t}, ${w.cat}` : w.t;
  const title = w.url
    ? el('a', { href: w.url, rel: 'noopener', target: '_blank', textContent: titleText })
    : document.createTextNode(titleText);

  const metaBits = [];
  if (w.y) metaBits.push(String(w.y));
  if (w.g && w.g !== 'IMSLP catalogue') metaBits.push(w.g);

  const left = el('div', {},
    el('h3', { className: 'work-title' }, title,
      w.arr ? el('span', { className: 'badge', textContent: 'arrangement' }) : null),
    metaBits.length ? el('p', { className: 'work-meta', textContent: metaBits.join(' · ') }) : null,
    w.full ? el('p', { className: 'work-full', textContent: w.full }) : null,
    w.note ? el('p', { className: 'work-note', textContent: w.note }) : null,
  );

  const flags = [];
  if (w.est) flags.push('count inferred from a plural');
  if (w.src === 'imslp') flags.push('via IMSLP');

  const right = el('div', { className: 'scoring' },
    w.s || '—',
    flags.length ? el('span', { className: 'flags', textContent: flags.join(' · ') }) : null,
  );

  return el('article', { className: 'work' }, left, right);
}

function renderResults(composer, list) {
  const results = $('#results');
  results.replaceChildren();
  $('#intro').hidden = true;
  $('#filters').hidden = false;

  // Summary bar
  const summary = $('#summary');
  summary.hidden = false;
  const tally = FAMILY_KEYS
    .map((k) => {
      const n = list.filter((w) => needs(w, k)).length;
      return n ? `${n} with ${OBOE_FAMILY[k].label}` : null;
    })
    .filter(Boolean)
    .join(' · ');

  summary.replaceChildren(
    el('h2', {}, composer.name,
      composer.dates ? el('span', { className: 'dates', textContent: ` (${composer.dates})` }) : null),
    el('span', { className: 'tally', textContent: `${list.length} work${list.length === 1 ? '' : 's'}${tally ? ` — ${tally}` : ''}` }),
    el('div', { className: 'actions' },
      el('button', { type: 'button', textContent: 'Copy list', onclick: () => copyList(composer, list) }),
      el('button', { type: 'button', textContent: 'Download CSV', onclick: () => downloadCsv(composer, list) }),
    ),
  );

  if (!list.length) {
    results.append(el('div', { className: 'empty' },
      el('p', {}, el('strong', { textContent: 'No works match those filters.' })),
      el('p', { className: 'muted', textContent: 'Try clearing the “must include” chips, or allow arrangements.' }),
    ));
    return;
  }

  if (!state.group || state.sort !== 'default') {
    results.append(...list.map(renderWork));
    return;
  }

  const byGenre = new Map();
  for (const w of list) {
    if (!byGenre.has(w.g)) byGenre.set(w.g, []);
    byGenre.get(w.g).push(w);
  }
  for (const [genre, items] of byGenre) {
    results.append(
      el('h2', { className: 'genre-heading', textContent: `${genre} (${items.length})` }),
      ...items.map(renderWork),
    );
  }
}

function rerender() {
  if (!state.composer) return;
  renderResults(state.composer, worksFor(state.composer.id));
}

// ── Export ────────────────────────────────────────────────────────────────────
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function downloadCsv(composer, list) {
  const rows = [
    ['Composer', 'Work', 'Catalogue', 'Year', 'Genre', 'Oboe-family scoring', 'Full instrumentation', 'Arrangement', 'Source', 'URL'],
    ...list.map((w) => [composer.name, w.t, w.cat, w.y, w.g, w.s, w.full, w.arr ? 'yes' : 'no', w.src, w.url]),
  ];
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `${fold(composer.name).replace(/ /g, '-')}-oboe-works.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyList(composer, list) {
  const text = [`${composer.name} — works including oboe / English horn`, '']
    .concat(list.map((w) => `${w.cat ? `${w.t}, ${w.cat}` : w.t} — ${w.s}`))
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    flash('Copied to clipboard');
  } catch {
    flash('Copy failed — your browser blocked clipboard access');
  }
}

let flashTimer;
function flash(message) {
  let node = $('#flash');
  if (!node) {
    node = el('div', { id: 'flash' });
    Object.assign(node.style, {
      position: 'fixed', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--ink)', color: 'var(--bg)', padding: '.55rem 1.1rem',
      borderRadius: '999px', fontSize: '.88rem', zIndex: '50', boxShadow: '0 8px 24px rgb(0 0 0 / .25)',
    });
    document.body.append(node);
  }
  node.textContent = message;
  node.style.opacity = '1';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { node.style.opacity = '0'; }, 2200);
}

// ── Typeahead wiring ──────────────────────────────────────────────────────────
const input = $('#composer');
const suggestionList = $('#suggestions');
let activeIndex = -1;
let current = [];

/** Match the default view: originals, falling back to arrangements-only. */
const countLabel = (c) => (c.n
  ? `${c.n} work${c.n === 1 ? '' : 's'}`
  : `${c.nArr} arrangement${c.nArr === 1 ? '' : 's'}`);

function closeSuggestions() {
  suggestionList.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  activeIndex = -1;
}

function showSuggestions(matches) {
  current = matches;
  if (!matches.length) return closeSuggestions();
  suggestionList.replaceChildren(...matches.map((c, i) =>
    el('li', {
      role: 'option',
      id: `sug-${i}`,
      onclick: () => select(c),
    },
      el('span', { textContent: c.dates ? `${c.name} (${c.dates})` : c.name }),
      el('span', { className: 'count', textContent: countLabel(c) }),
    )));
  suggestionList.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  setActive(-1);
}

function setActive(i) {
  activeIndex = i;
  [...suggestionList.children].forEach((li, idx) =>
    li.setAttribute('aria-selected', String(idx === i)));
  input.setAttribute('aria-activedescendant', i >= 0 ? `sug-${i}` : '');
}

function select(composer, { silent = false } = {}) {
  state.composer = composer;
  input.value = composer.name;
  closeSuggestions();
  if (location.hash.slice(1) !== encodeURIComponent(composer.id)) {
    history.replaceState(null, '', `#${encodeURIComponent(composer.id)}`);
  }
  rerender();
  if (!silent) $('#summary').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

input.addEventListener('input', () => {
  const matches = matchComposers(input.value);
  showSuggestions(matches);
});

input.addEventListener('keydown', (e) => {
  if (suggestionList.hidden) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIndex + 1) % current.length); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIndex - 1 + current.length) % current.length); }
  else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); select(current[activeIndex]); }
  else if (e.key === 'Escape') closeSuggestions();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo')) closeSuggestions();
});

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const matches = matchComposers(input.value, 1);
  if (matches.length) return select(matches[0]);
  closeSuggestions();
  $('#summary').hidden = true;
  $('#intro').hidden = true;
  $('#results').replaceChildren(el('div', { className: 'empty' },
    el('p', {}, el('strong', { textContent: `No composer found for “${input.value}”.` })),
    el('p', { className: 'muted', textContent: 'Check the spelling, or use the surname on its own. The index covers composers with at least one catalogued oboe-family work.' }),
  ));
});

$('#browse-all').addEventListener('click', () => {
  input.value = '';
  showSuggestions([...state.data.composers].sort((a, b) => b.n - a.n).slice(0, 40));
  input.focus();
});

// ── Filter wiring ─────────────────────────────────────────────────────────────
function buildInstrumentChips() {
  const holder = $('#instrument-filters');
  holder.replaceChildren(...FAMILY_KEYS.map((key) =>
    el('button', {
      type: 'button',
      className: 'chip',
      textContent: OBOE_FAMILY[key].label,
      'aria-pressed': 'false',
      onclick(e) {
        const on = e.currentTarget.getAttribute('aria-pressed') === 'true';
        e.currentTarget.setAttribute('aria-pressed', String(!on));
        if (on) state.required.delete(key); else state.required.add(key);
        rerender();
      },
    })));
}

$('#opt-arrangements').addEventListener('change', (e) => { state.arrangements = e.target.checked; rerender(); });
$('#opt-estimated').addEventListener('change', (e) => { state.estimated = e.target.checked; rerender(); });
$('#opt-group').addEventListener('change', (e) => { state.group = e.target.checked; rerender(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; rerender(); });

// ── Boot ──────────────────────────────────────────────────────────────────────
try {
  const data = await loadData();
  data.composers = indexComposers(data.composers);
  state.data = data;

  buildInstrumentChips();

  $('#provenance').textContent =
    `Index built ${new Date(data.generated).toLocaleDateString()} — ` +
    `${data.stats.works.toLocaleString()} works by ${data.stats.composers.toLocaleString()} composers. ` +
    `${data.sources.curated}; ${data.sources.imslp}.`;

  // A few well-stocked composers as one-click starting points.
  const popular = [...data.composers].sort((a, b) => b.n - a.n).slice(0, 10);
  $('#popular').replaceChildren(
    el('span', { className: 'label', textContent: 'Try:' }),
    ...popular.map((c) => el('button', {
      type: 'button', className: 'chip', textContent: c.name,
      onclick: () => select(c),
    })),
  );

  // Deep link: #composer-id, kept live so shared links, the back button and
  // hash edits all land on the right composer rather than only working on boot.
  const selectFromHash = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return false;
    const linked = data.composers.find((c) => c.id === hash);
    if (linked && linked !== state.composer) select(linked, { silent: true });
    return !!linked;
  };
  window.addEventListener('hashchange', selectFromHash);
  selectFromHash();
} catch (err) {
  $('#results').replaceChildren(el('div', { className: 'error' },
    el('p', {}, el('strong', { textContent: 'The work index could not be loaded.' })),
    el('p', { className: 'muted', textContent: err.message }),
    el('p', { className: 'muted', textContent: 'If you opened this file directly from disk, use the standalone build (dist/oboe-finder.html) instead — browsers block module and data loading over file:// URLs.' }),
  ));
}
