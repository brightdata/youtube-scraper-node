# For coding agents working in this repository

Read this before changing anything. Every line below was verified against the
live API, `@brightdata/sdk` 1.2.0 or the Bright Data CLI 0.4.1 on 2026-11-09.
Where the API reference pages disagree with the live API, the live API is what
is written here.

## Auth

- `token()` reads `BRIGHTDATA_API_TOKEN`, then the key `bdata login` stored in
  `brightdata-cli/credentials.json` (the same file the SDKs read). There is no
  `.env` support; Node 20 loads one with `node --env-file=.env`.
  Setting the variable, or running the login once, is the one step a human
  must do; never paste a key into code.
- The raw HTTP Quickstart in the README reads `BRIGHTDATA_API_TOKEN` only. It
  does not see the CLI login.

## How the API behaves

- Three datasets: videos `gd_lk56epmy2i5g7lzu0k` (collect by URL, discover by
  `keyword`, `search_filters`, `hashtag`, `url`, `explore`, `podcast_url`),
  channels `gd_lk538t2k2p1k3oos71` (collect by URL, discover by `keyword`) and
  comments `gd_lk9q0ew71spt1mxywf` (collect by URL).
- The JavaScript SDK collects videos, channels and comments by URL and has
  none of the seven discovery methods. This package calls
  `https://api.brightdata.com/datasets/v3` with the built-in `fetch` and has
  no dependencies, so all ten work the same way. Keep it that way. Tests stub
  the network through `transport`.
- Every call is an asynchronous job: `/trigger`, poll `/progress/<id>`, then
  `/snapshot/<id>?format=json`. Runs took 12 seconds (a channel) to 250
  seconds (a podcast playlist). `TIMEOUT_MS` is 900000.
- A status poll that fails with a network error is retried until the
  deadline; one `fetch failed` lost a paid job five minutes in on
  2026-10-24. An HTTP error still rejects.
- Always send `include_errors=true`. The API default drops error rows, and a
  failed input then looks like an empty result.
- Every discovery sends `limit_per_input`, so it cannot bill every match.
  `num_of_posts` and `num_of_comments` were honoured too: 2 asked, 2 returned;
  3 comments asked, 3 returned.
- Input field names, as the API validates them:
  - keyword search: `keyword`, `num_of_posts` is a text field ("3", not 3).
  - search filters: `keyword_search`, and YouTube's filter labels checked
    against fixed lists. "This month", "Video" and "Under 4 minutes" passed;
    `duration` "4-20 minutes" is a 400, "This value is not allowed".
  - hashtag: `hashtag` without the #, `num_of_posts` a number.
  - comments: `num_of_comments`, optional `sort_by`, `load_replies`.
  - `bdata pipelines info <dataset_id> <method>` prints the live input schema.
- **Channel videos (discover by `url`) is broken upstream.** On 2026-11-09
  three runs on @MrBeast and @NASA `/videos` returned six of six rows
  `parse_error`, "Parse error: ORIGINAL_LANGUAGE_TO_COUNTRY is not defined",
  after about nine minutes each. The README shows that output. When it returns
  rows again, rerun the README block and replace the shown output.
- The video record's `description` can belong to another video: "Me at the
  zoo" came back with a description about microplastics. Never show
  `description` in README output until that is fixed.
- The video record carries `transcript`, `formatted_transcript` (start and end
  in milliseconds) and `chapters`. Transcript text contains line breaks.
- The schema changes without notice. Never hardcode a field list.
- The full documentation index, one `.md` page per entry:
  https://docs.brightdata.com/llms.txt

## Working here

- `npm test` runs offline and needs no token. `npm run lint` must pass.
- CI follows the README's own commands on an empty machine, finding its
  sections by their exact H2 text. Rename a heading in ci.yml too.
- A weekly workflow executes every fenced block in the README against the real
  API, and a daily one runs a smaller live check. A snippet must be complete
  and paste-able on its own, and its shown output must be real.
- The field tables in the README sit between `<!-- fields:start -->` and
  `<!-- fields:end -->` and are regenerated daily by
  `.github/scripts/field_tables.mjs` from
  https://docs.brightdata.com/scrapers-full.json. Do not edit them by hand.
- The "last verified" badge line at the top of the README is rewritten by the
  daily run. Do not edit it by hand.
- Headings are written for search: "YouTube scraper for Node.js and JavaScript",
  "How to scrape YouTube ...". Keep that pattern when adding a section.
- Keep it small. Beyond the status poll, do not add retries, deduplication,
  scheduling, databases, async examples or concurrency.
