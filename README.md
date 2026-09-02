# Oboe & English Horn Repertoire Finder

Type a classical composer's name into a web browser and get back every
catalogued work whose scoring includes an instrument of the oboe family — with
the exact instrumentation for each: *two oboes, english horn*, *three oboes*,
*oboe d'amore*, and so on.

Nothing is installed. The end user opens a URL in Chrome or Edge and searches.

| | |
|---|---|
| **Works indexed** | 6,613 |
| **Composers** | 1,674 |
| **Works needing an English horn** | 810 |
| **Sources** | 133 hand-checked · 860 from Wikipedia · 5,620 from IMSLP |
| **Composer dates** | 1,418 of 1,674 · 383 living |
| **Family members covered** | oboe · english horn (cor anglais) · oboe d'amore · oboe da caccia · bass oboe · heckelphone · musette |

---

## Two ways to search

The two workflows are peers, chosen with a tab pair of equal weight rather than
one being a link inside the other's filter panel. The instrument grid is shared:
it narrows a composer's list in one mode and *is* the query in the other, so a
selection carries over when you switch and the scope note above it says which
applies. `Clear` sits outside both panels, since a search needs clearing from
either.

**By composer.** Type a name; accents are optional and near-misses are
suggested. Results group by genre, and the instrument grid then narrows them.

**By instrumentation, across every composer.** Pick one or more chips under *Must
include* and the whole catalogue is searched. Several chips mean **all** of them
— *oboe + english horn* returns the 492 works needing both, not the union.
Doublings count: Dvořák's *New World* answers an English horn search even though
the part belongs to the second oboist.

Each instrument sits on its own row with a quantity beside it — *exactly 2*,
*3 or more*, and so on. Both controls are present from the moment the page
loads. An earlier version only revealed the quantity once an instrument had been
ticked, which meant arriving at the page gave no sign the feature existed;
setting a quantity now also selects the instrument, so neither control is a
prerequisite for the other.

Counts as of the current index — they shift a little with each monthly refresh:

```
exactly two oboes                       1,342 works
three or more oboes                       131 works
exactly two oboes + english horn          321 works
exactly one oboe, without english horn  2,783 works
```

**none** is the other end of the same control, and it excludes rather than
requires: *exactly 1 oboe* with *none* against English horn finds works for a
single oboist with no English horn anywhere, doublings included. Exclusion could
not be expressed as a count layered on a presence test, so presence and quantity
are decided together in one predicate. An excluded instrument is struck through
in the panel and named separately in the heading — "Works including exactly one
oboe, without english horn" — because it is a different kind of clause from the
requirements beside it.

A count means players, not printed parts, which matters where the two differ. 94
works reach their English horn only through a doubling and so have no separate
part; *exactly one english horn* still finds them, because one person does play
one. Deselecting an instrument drops its count with it, so a rule can never
outlive the instrument it applied to. Results group by composer and render in
batches of 150, since *english horn* alone matches 810 works and building every
row up front makes the page crawl. The selection lives in the URL as
`#i=oboe,englishHorn`, so a search can be shared; CSV export covers the whole
match set rather than the batch on screen.

## Running it

**Hosted (what end users get):** <https://geoffreylaff-stack.github.io/oboe-repertoire-finder/>

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

## Making sure a visitor has the current build

GitHub Pages serves everything with `Cache-Control: max-age=600` and an ETag,
and gives no way to set headers. A visitor returning the next day revalidates
and gets current files — a conditional request answers `304` when nothing
changed — so the ordinary case was already correct. Two things were not:

- **Bare asset paths.** A freshly revalidated `index.html` could pair with an
  `app.js` still inside its ten-minute window: new markup, old code.
- **No way to tell.** Inside that window nothing revalidates, and the page said
  nothing about which build it was.

Both are closed without asking anyone to clear a cache:

**Content hashes in every asset URL.** `tools/build.mjs` hashes each asset and
rewrites the references — `app.js?v=6093b2dbae`, and the same for the stylesheet,
the shared parser and `works.json`. New markup therefore *cannot* load old
assets: the URL it asks for did not exist before. The hash is of file content, so
it changes only when that file does — editing the CSS does not re-download the
1.8 MB index.

**A freshness check the cache cannot answer.** `data/version.json` is a few bytes
holding the build id, fetched on load with `cache: 'no-store'`, which bypasses
the HTTP cache outright. The page compares it with the id stamped into itself and
shows a bar — *"A newer version of this index has been published. Load it"* —
when they differ. The button navigates to `?v=<newbuild>`, a URL the browser has
never seen, so even the markup cannot come from cache. The current search is
carried across in the fragment.

**A re-check when a tab is brought back to the front.** The load-time check
misses a tab left open all day, and `visibilitychange` covers that without
polling. The bar never appears twice.

**A build id in the footer**, next to the work count, so it can be read off and
compared against what is published.

So after a redeploy an end user does nothing: a new visit fetches the new build,
and a session already open is offered it. Clearing caches or cookies is never
required, and a hard reload is never required.

Builds are byte-identical when nothing changed, which matters more than it
sounds: a CI run that changes nothing must produce the same id, or every run
would prompt every visitor to re-download the index for nothing. This took three
attempts to get right, each failing further along:

1. Dating the index from the clock — every build differed.
2. Dating it from the newest input file's mtime — correct locally, useless in
   CI, where `git checkout` resets every mtime to the moment it cloned.
3. Dating it from the harvest timestamps *inside* the data files — which travel
   with the content, but are rewritten by every harvest even when the harvest
   found nothing new.

The third only showed up in a real scheduled run: it pushed six files, one line
each, with the work count unchanged at 6,613. Nothing about the repertoire had
moved; only the timestamps and the request counters. So the harvesters and the
build now compare the *substance* — the works and composers — and leave the file
untouched when it matches (`tools/stable-json.mjs`). A month with no upstream
change now writes nothing, pushes no branch, and prompts nobody.

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

### Who is still alive

A name on its own answers less than it looks like it does. Whether a composer is
someone you could commission from or someone three centuries dead is usually the
first thing worth knowing, and the index knew it for 41 of its 1,674 composers —
all of them typed in by hand.

IMSLP keeps a structured person record on each composer's category page, and
`tools/harvest-composers.mjs` reads it in thirty-three API calls:

```
{{#fte:person
|Born Year=1948|Born Month=|Born Day=
|Died Year=|Died Month=|Died Day=
```

**The empty death year is the whole problem.** It can mean the composer is
alive, or only that nobody recorded the death, and the difference decides
whether the entry reads "(b. 1948)". The data settles it rather than a guess:
among composers with a birth year and no death year there is a wide empty gap —
a handful born before 1900, then nobody at all until the moderns. A gap that
wide means the boundary needs no judgement.

So a birth from 1900 onwards with no death recorded is treated as living, and
anything earlier as a death nobody wrote down — shown as `1556–?` rather than
`b. 1556`, because next to a list where `(b. 1948)` means a composer you could
write to, a bare birth year would claim a 470-year-old is still working.

| | |
|---|---|
| `1841–1904` | both years known — 903 composers |
| `b. 1948` | living — 383 |
| `d. 1904` | birth unrecorded — 92 |
| `1556–?` | death unrecorded — 22 |
| *(nothing)* | neither known — 256 |

None of the undated is a missed living composer: not one has a work in this
index dated after 1950. Twenty composers have no IMSLP page at all — Walton,
Glass, Pärt and other names that reached the index through Wikipedia — and
their dates are typed into the curated file, where a hand-checked date outranks
the harvest.

**Two faults kept several hundred composers blank, and both are worth
recording.** IMSLP writes the person record under two different template names,
`{{#fte:person` and `{{#imslpcomposer:`, and a guard on only the first silently
rejected every page using the second. And a transliterated name reaches this
index under whichever spelling its source used: IMSLP files Glazunov under
*Aleksandr* while Wikipedia says *Alexander*, so an exact lookup found nothing
and one of the best-known composers here kept no dates at all. IMSLP lists the
variants itself, so a match now needs the surname to agree **and** the forename
to be one IMSLP knows for that person — both halves required, since matching on
surname alone would hand Johann Christian Bach his brother's dates.

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

`.github/workflows/refresh-data.yml` does this monthly. It pushes the result to
`chore/refresh-repertoire-data` and links a pull request from the run summary,
rather than opening one itself: creating pull requests is off by default for
GitHub Actions (*Settings → Actions → General → Workflow permissions*), and a
refresh should not depend on a setting nobody remembers. Enabling that setting
is optional and changes nothing here.

Nothing is published straight to the live site. The run also refuses a refresh
that loses more than a fifth of the index, since a renamed upstream category can
gut a harvest while every step still reports success.

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
