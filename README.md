# Oboe & English Horn Repertoire Finder

Type a classical composer's name into a web browser and get back every
catalogued work whose scoring includes an instrument of the oboe family — with
the exact instrumentation for each: *two oboes, english horn*, *three oboes*,
*oboe d'amore*, and so on.

Nothing is installed. The end user opens a URL in Chrome or Edge and searches.

| | |
|---|---|
| **Works indexed** | 6,592 |
| **Composers** | 1,671 |
| **Works needing an English horn** | 799 |
| **Sources** | 133 hand-checked · 852 from Wikipedia · 5,607 from IMSLP |
| **Family members covered** | oboe · english horn (cor anglais) · oboe d'amore · oboe da caccia · bass oboe · heckelphone · musette |

---

## Running it

**Hosted (what end users get):** <https://geoffreylaff-stack.github.io/Kianse123/>

Any static host works; the repository is laid out for GitHub Pages, and
`.github/workflows/pages.yml` publishes `index.html`, `assets/`, `lib/`,
`data/works.json` and the standalone build on every push to the default branch.

Two settings have to be switched on by hand once, because they are repository
settings rather than code: the repository must be **public** (Pages on a private
repository needs a paid plan), and **Settings → Pages → Source** must be set to
**GitHub Actions**. Until Pages is enabled the build job still succeeds and only
the `deploy-pages` step fails, which is the signature of that missing setting
rather than of a broken workflow.

**Locally**, because ES modules and `fetch` need a real origin:

```bash
npm run build     # regenerate data/works.json + dist/oboe-finder.html
python3 -m http.server 8765
# open http://localhost:8765
```

**As a single file with no server at all.** `dist/oboe-finder.html` inlines the
markup, styles, code and the entire index into one ~2 MB file. Double-click it
and it runs from `file://`, offline, forever. Useful for handing to someone on a
locked-down machine or taking into a library with no wifi.

---

## The design problem, and why it is shaped this way

The obvious approach — a page that queries a music database live — does not
work, for two independent reasons. Both were verified against the real APIs
before any code was written.

**1. IMSLP sends no CORS header.** IMSLP's MediaWiki API is the best public
source of instrumentation data, and it answers happily over HTTPS. But it
returns no `Access-Control-Allow-Origin`, so a browser will refuse to hand the
response to a page on another origin. A pure client-side app cannot read it at
runtime. The alternatives were a third-party CORS proxy (fragile, and it routes
users' queries through a stranger's server) or a backend of our own (which
contradicts "no install" only for the developer, but adds an outage surface and
a bill).

**2. Where the data is good, it is good; where it matters most, it is absent.**
IMSLP's `Instrumentation` field is exact for chamber music — Mozart's Oboe
Quartet reads `oboe, violin, viola, cello`. For orchestral works it collapses to
a single word:

```
Beethoven, Symphony No. 9  →  Instrumentation = "orchestra"
Berlioz, Symphonie fantastique  →  Instrumentation = "orchestra"
```

That is precisely the case where an oboist needs the detail — orchestral scoring
is where "2 oboes + English horn" is a fact worth looking up. Wikidata is worse:
it is CORS-enabled but its `instrumentation` property records Beethoven 9 as
"symphony orchestra" and "choir".

IMSLP is also public-domain-weighted, so composers who died recently are thin or
missing outright: Rachmaninoff had **no** entry at all, and Stravinsky had four
originals. **Wikipedia** fills both gaps — its article on an individual work
usually carries an `Instrumentation` section giving the full wind complement, for
20th-century repertoire as readily as for Mozart.

So the app is built as **a pre-computed index, shipped with the page**, drawing
on three sources in order of authority:

```
  build time (a laptop or CI, never the user's browser)
  ┌──────────────────────────────────────────────────────────┐
  │  data/curated.json          hand-checked orchestral       │  ← wins
  │  tools/harvest-wikipedia.mjs → data/wikipedia.json        │
  │      Instrumentation section, or a "scored for" sentence  │
  │  tools/harvest-imslp.mjs     → data/imslp.json            │  ← breadth
  │      pass A: category names encode exact scoring          │
  │      pass B: |Instrumentation= field, 50 pages/call       │
  │                                                           │
  │  tools/build.mjs  merges all three → data/works.json      │
  └──────────────────────────────────────────────────────────┘
                              │
  run time                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │  index.html + assets/app.js  fetch data/works.json        │
  │  every search runs in memory, same origin, no network     │
  └──────────────────────────────────────────────────────────┘
```

Provenance drives the merge and the build-time checks, but it is deliberately
not shipped: `tools/build.mjs` drops the `src` and `url` fields when it writes
`data/works.json`, and the interface names no upstream catalogue. Which source a
row came from is answered here and in `data/`, not in the app.

This sidesteps CORS entirely, makes search instant, keeps working when IMSLP is
down, and sends no user query anywhere.

### The harvest trick

IMSLP files works under categories whose *name is the instrumentation*:

```
Category:For 2 oboes, english horn, bassoon
Category:For oboe, violin, viola, cello
Category:For 2 English horns, bass oboe, heckelphone, bassoon (arr)
```

Enumerating every `For …` category and keeping the 1,660 that mention an
oboe-family instrument yields exact scoring for thousands of chamber works from
a few hundred API calls, rather than fetching thousands of pages. A `(arr)`
suffix marks an arrangement by another hand; those are tagged and hidden by
default, so a transcription of Beethoven 9 for oboe quartet does not masquerade
as Beethoven scoring for oboe quartet.

### Reading Wikipedia

Two shapes have to be handled, because articles use both. A section:

```wikitext
==Instrumentation==
:4 [[oboe]]s (fourth doubling second [[cor anglais]])
:1 [[cor anglais]]
```

…and a bare sentence, which is how Boléro states it — *"written for a large
orchestra consisting of: 2 oboes (one doubling on oboe d'amore), cor anglais…"*.
The prose fallback only fires when the surrounding text also names at least three
other orchestral instruments, so "written for Diaghilev" cannot be mistaken for a
scoring. Markup is stripped, the result is flattened to one comma-separated
string, and the same parser the rest of the app uses reads it.

### Counting: first explicit number wins

An instrument gets named more than once all the time — a reduced orchestration
listed after the main one, or plain narrative:

> …two flutes, piccolo, **two oboes**, two clarinets … and strings. *The **oboes**
> are silent for the second movement.*

Adding those up gave Shostakovich's Second Piano Concerto four oboes when the
score has two. So counts are never accumulated. Each instrument takes the
**first explicit number** it is given; a bare plural is recorded separately and
only used when no number appears anywhere, in which case the row is marked
*count inferred from a plural*. The prose fallback is also cut at the end of the
scoring sentence, so commentary never reaches the parser at all.

That single change corrected 73 entries, only 14 of which had ever carried the
inferred-count flag — the flag was not a reliable signal of a wrong count,
because two explicit numbers summing to a wrong total looks perfectly confident.
`tools/build.mjs` therefore prints any non-curated work with more than five
oboe-family players at build time, since that is what the failure looks like
from the outside.

One transport note worth recording: `api.php` rate-limits this network path
hard — 429 within a handful of requests even at one per 1.2 seconds, because the
address is shared rather than because of our pace. The CDN-cached paths are not
throttled at all, so the harvester reads article text from
`index.php?action=raw` and category membership from the rendered category page.
Measured on ten fetches: **0 throttled via `action=raw`, 8 via the REST API.**

### The curated layer

`data/curated.json` supplies what IMSLP cannot: 133 hand-checked works,
concentrated on the orchestral repertoire, each with full wind-section context
and a note where the instrument does something notable. Curated entries override
harvested ones for the same work (matched on title *and* catalogue number, since
"Serenade for Winds" and "Serenade for Wind Instruments" are the same Op. 44).

It is deliberately a separate, human-editable file. Adding a work means adding
one line — the scoring string is parsed, not hand-encoded:

```json
{ "c": "dvorak-antonin", "title": "Symphony No. 9 in E minor, 'From the New World'",
  "cat": "Op. 95", "year": 1893, "genre": "Symphony",
  "oboes": "2 oboes (2nd doubling english horn)",
  "full": "piccolo, 2 flutes, 2 oboes (2nd doubling english horn), …" }
```

---

## Doublings are the interesting case

Dvořák's *New World* has no separate English horn part. The second oboist puts
the oboe down and picks up an English horn for the Largo. Getting this right
matters in two opposite directions, and the app handles both:

- **It is still an English horn work.** Filter by "english horn" and the *New
  World* appears. The parser records doublings as *required instruments*
  distinct from *part counts*.
- **It is still two players.** The section is two, not three. Sorting by section
  size does not promote it above a genuine three-oboe work.

Rendered, the distinction is explicit — the doubling sits with the instrument
that actually doubles:

```
Symphony No. 9, 'From the New World'   two oboes (2nd doubling english horn)
Boléro                                 two oboes (2nd doubling oboe d'amore), english horn
The Planets                            two oboes, english horn, bass oboe
St Matthew Passion                     two oboes, two oboes d'amore, two oboes da caccia
```

---

## Layout

```
index.html                     app shell
assets/app.js                  search, filtering, rendering
assets/styles.css              light/dark, no external assets
lib/instrumentation.mjs        the parser — runs in Node and the browser alike
tools/harvest-imslp.mjs        build-time IMSLP harvester
tools/harvest-wikipedia.mjs    build-time Wikipedia harvester
tools/build.mjs                merge + single-file bundle
tools/test-instrumentation.mjs regression tests (npm test)
data/curated.json              hand-checked works  (edit this)
data/wikipedia.json            harvest output      (generated)
data/imslp.json                harvest output      (generated)
data/works.json                merged index the app loads (generated)
dist/oboe-finder.html          standalone offline build (generated)
```

`lib/instrumentation.mjs` is deliberately shared rather than duplicated: the
harvester and the browser must agree on what "3 ob." means, or filters silently
disagree with the text on screen.

## Refreshing the data

```bash
npm run harvest              # both sources; roughly an hour in total
npm run harvest:imslp        # ~1,900 API calls, ~20 min
npm run harvest:wikipedia    # ~90 composers, ~45 min
npm run build
npm test
```

The Wikipedia sweep saves after every composer and takes `--resume`, so an
interrupted run picks up where it stopped instead of starting over. Composers are
ordered most-wanted first for the same reason.

`.github/workflows/refresh-data.yml` does this monthly and opens a pull request
when the index changes, so the snapshot does not quietly rot.

---

## Known limits

Worth being straight about:

- **Coverage follows the sources.** The Wikipedia sweep covers a fixed list of
  composers (see `COMPOSERS` in the harvester) — adding a name there and
  re-running is the way to extend it. Outside that list, coverage falls back to
  IMSLP, which is public-domain-weighted and thin on recent composers.
- **A work needs an article to be found.** Wikipedia only yields a scoring where
  the individual work has its own page with an instrumentation section or a
  "scored for…" sentence. Well-known symphonies and tone poems almost always do;
  minor works often do not.
- **Wikipedia is taken at face value.** Its scorings are used as given, without
  checking them against a score. Rows are labelled *via Wikipedia* and link to
  the article so a claim can be followed back.
- **A bare plural is a guess.** `"oboes, bassoons, strings"` gives no number;
  the parser records two and flags the row *count inferred from a plural*. A
  checkbox hides these.
- **Editions differ.** Stravinsky's *Firebird* is a different animal in 1910 and
  1919; the curated entries say which. Confirm against a published score before
  hiring players.

Corrections belong in `data/curated.json` — they will survive the next harvest,
which is exactly why that file is separate.

## Licence

App code MIT. Work metadata derives from
[IMSLP / Petrucci Music Library](https://imslp.org), which publishes catalogue
data under CC-BY-SA.
