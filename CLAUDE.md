# Notes for future sessions

## The Wind Repertory Project — https://www.windrep.org/

**Consult this when working on composer or instrumentation data, in this
repository and in the trumpet repertoire finder alike.** It is a standing
instruction from the repository owner, not a one-off.

It is a wiki cataloguing wind band and wind ensemble repertoire: a page per
work with its instrumentation, duration and grade, and a page per composer.
Its value here is precisely where the existing sources are weakest —

- **IMSLP is public-domain-weighted.** It has almost nothing by a composer
  still writing, and no person record at all for a large minority of the
  composers in these indexes.
- **Wikipedia has articles for very few individual works**, and for band
  repertoire almost none.
- **The Wind Repertory Project covers living band composers in depth**, which
  is most of what an oboe or trumpet index is missing.

### How it may and may not be read

Its `robots.txt` is specific, and the limits are not the same as IMSLP's:

```
User-agent: *
Crawl-delay: 5
Disallow: /api.php
Disallow: /index.php?title=
Disallow: /Special:
```

It runs MediaWiki 1.39 and `api.php` answers — but **it is disallowed for
crawlers, so do not build a harvester against it.** That rules out the approach
used for IMSLP and composerjim.com, both of which permit their APIs.

What is permitted: ordinary article URLs (`https://www.windrep.org/Work_Title`)
and the sitemap at `/sitemap/sitemap-index-windrep.xml`, at **no more than one
request every five seconds**. Anything read that way belongs in
`data/curated.json` as a hand-checked entry, not in a generated file.

If a bulk import is ever wanted, ask the owner to approach the site rather than
working around the stated limit.

### Naming

Article titles do not always match this index's display names. Search for the
surname rather than assuming a title.

## The sibling repository

The trumpet repertoire finder lives at
`geoffreylaff-stack/trumpet-repertoire-finder` and shares this design: the same
`lib/instrumentation.mjs` structure with a different family table, the same
harvesters, the same build. A change worth making to one is usually worth
making to the other.

Improvements made there and not yet brought back here include a composer-dates
harvester (birth and death years from IMSLP person records, so living composers
read "(b. 1948)"), a part-range reading for band scores ("Trumpet 1-4" meaning
four players), and a fix for run-on instrument lists where a stripped line break
let one instrument's part numbers become the next one's count.

## Deploying

The default branch here is `claude/composer-oboe-works-browser-app-m07x6x`, not
`main`. GitHub Pages deploys from the default branch, so a push to this branch
publishes the site directly — unlike the trumpet repository, where work is
merged into `main` first.
