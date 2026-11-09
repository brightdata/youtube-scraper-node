/**
 * YouTube videos, transcripts, channels and comments on the Bright Data Scraper API, with fetch.
 *
 *     keyword -> trigger discover_by=keyword -> poll progress -> fetch snapshot -> videos
 *
 * No dependencies. The JavaScript SDK, `@brightdata/sdk` 1.2.0, collects
 * videos, channels and comments by URL but has none of the seven discovery
 * methods, so this module talks to the API over HTTP and covers all ten. Every
 * call is an asynchronous job: trigger it, poll until the snapshot is ready,
 * download it. On 2026-11-09 a run took 12 seconds (one channel) to 250
 * seconds (a podcast playlist); a channel's videos took 562 seconds to fail.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const API = "https://api.brightdata.com/datasets/v3";

/** Videos and Shorts: details, transcript, chapters. One collect and six discovery methods. */
export const VIDEOS = "gd_lk56epmy2i5g7lzu0k";
/** Channel details: subscribers, views, video count. */
export const CHANNELS = "gd_lk538t2k2p1k3oos71";
/** Comments on a video URL. */
export const COMMENTS = "gd_lk9q0ew71spt1mxywf";

/** The slowest run on 2026-11-09 was 562 seconds; the wait outlasts that comfortably. */
export const TIMEOUT_MS = 900_000;

export const NO_TOKEN = [
  "API token required but not found.",
  "  export BRIGHTDATA_API_TOKEN=YOUR_API_KEY   token: https://brightdata.com/cp/setting/users",
  "  or run once: npx -p @brightdata/cli bdata login",
].join("\n");

/** The API refused a request, or a job ended without a snapshot. */
export class ApiError extends Error {
  name = "ApiError";
}

/** No token in the environment and no Bright Data CLI login. */
export class TokenMissing extends ApiError {
  name = "TokenMissing";
  constructor() {
    super(NO_TOKEN);
  }
}

/**
 * The network and the clock, behind one indirection.
 *
 * ES module exports are read-only bindings, so a test cannot replace an
 * imported function. Going through this object lets the offline tests stand
 * in for the API and skip the waits.
 */
export const transport = {
  fetch: (...args) => globalThis.fetch(...args),
  pollMs: 10_000,
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  credentialsPath: () => {
    if (process.platform === "win32") {
      return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "brightdata-cli", "credentials.json");
    }
    const base = process.platform === "darwin" ? join(homedir(), "Library", "Application Support") : join(homedir(), ".config");
    return join(base, "brightdata-cli", "credentials.json");
  },
};

/** BRIGHTDATA_API_TOKEN, else the Bright Data CLI login. Never a key in code. */
export function token() {
  const found = (process.env.BRIGHTDATA_API_TOKEN ?? "").trim();
  if (found) return found;
  try {
    const key = JSON.parse(readFileSync(transport.credentialsPath(), "utf8")).api_key;
    if (key) return key;
  } catch {
    // no login file, or not JSON: same as no login
  }
  throw new TokenMissing();
}

async function call(path, body) {
  const response = await transport.fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new ApiError(`HTTP ${response.status}: ${text.trim().slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Start a job and return its snapshot id. Error rows are always asked for. */
export async function trigger(datasetId, inputs, { discoverBy, limitPerInput } = {}) {
  const query = new URLSearchParams({ dataset_id: datasetId, include_errors: "true" });
  if (discoverBy) {
    query.set("type", "discover_new");
    query.set("discover_by", discoverBy);
  }
  if (limitPerInput !== undefined) query.set("limit_per_input", String(limitPerInput));
  return (await call(`/trigger?${query}`, inputs)).snapshot_id;
}

/** running, ready or failed. */
export async function status(snapshotId) {
  return (await call(`/progress/${snapshotId}`)).status;
}

/** The rows of a ready snapshot. Snapshots stay downloadable for 30 days. */
export async function fetchSnapshot(snapshotId) {
  const data = await call(`/snapshot/${snapshotId}?format=json`);
  return (Array.isArray(data) ? data : [data]).filter((row) => row && typeof row === "object");
}

/**
 * status(), except that a dropped connection is not the end of a paid job.
 *
 * A poll is safe to repeat, and one "fetch failed" five minutes into a job
 * lost it on 2026-10-24. An HTTP error still rejects.
 */
async function poll(snapshotId) {
  try {
    return await status(snapshotId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return "running";
  }
}

/** Trigger, wait, fetch. Rows the API could not collect carry an `error` key. */
export async function run(datasetId, inputs, { discoverBy, limitPerInput, timeoutMs = TIMEOUT_MS } = {}) {
  const snapshotId = await trigger(datasetId, inputs, { discoverBy, limitPerInput });
  const deadline = Date.now() + timeoutMs;
  let state;
  while (!["ready", "failed"].includes((state = await poll(snapshotId)))) {
    if (Date.now() > deadline) {
      throw new ApiError(`timeout: snapshot ${snapshotId} not ready after ${Math.round(timeoutMs / 1000)}s`);
    }
    await transport.sleep(transport.pollMs);
  }
  if (state === "failed") throw new ApiError(`snapshot ${snapshotId} failed`);
  return fetchSnapshot(snapshotId);
}

const many = (value) => (Array.isArray(value) ? value : [value]);

/** Only the fields that were actually set. */
function given(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
}

/** One input per URL, with every field that was actually set. */
function items(urls, fields = {}) {
  const extra = given(fields);
  return many(urls).map((url) => ({ url, ...extra }));
}

/**
 * Full records for video or Shorts URLs: views, likes, transcript, chapters.
 *
 * Options go into each input as the API names them: `country` or
 * `transcription_language`, for example "English".
 */
export function videos(urls, options = {}) {
  return run(VIDEOS, items(urls, options));
}

/**
 * Videos YouTube shows for a search, `limit` of them.
 *
 * Options: `start_date` and `end_date` (MM-DD-YYYY), `country`,
 * `include_shorts`. `num_of_posts` is a text field in this scraper's schema.
 */
export function search(keyword, { limit = 5, ...options } = {}) {
  const item = { keyword, num_of_posts: String(limit), ...given(options) };
  return run(VIDEOS, [item], { discoverBy: "keyword", limitPerInput: limit });
}

/**
 * Videos for a search with YouTube's own filters applied.
 *
 * Filters are YouTube's filter labels, checked against fixed lists:
 * `upload_date`, `type`, `duration`, `features`, `sort_by`, `country`.
 * Accepted live on 2026-11-09: "This month", "Video", "Under 4 minutes".
 * "4-20 minutes" is rejected with HTTP 400.
 */
export function searchFilters(keyword, { limit = 5, ...filters } = {}) {
  const item = { keyword_search: keyword, ...given(filters) };
  return run(VIDEOS, [item], { discoverBy: "search_filters", limitPerInput: limit });
}

/** Videos and Shorts for a hashtag, without the #. `start_date`, `end_date` in options. */
export function hashtag(tag, { limit = 5, ...options } = {}) {
  const item = { hashtag: String(tag).replace(/^#/, ""), num_of_posts: limit, ...given(options) };
  return run(VIDEOS, [item], { discoverBy: "hashtag", limitPerInput: limit });
}

/**
 * Recent videos from a channel's /videos or /shorts URL.
 *
 * On 2026-11-09 every run returned error rows, "Parse error:
 * ORIGINAL_LANGUAGE_TO_COUNTRY is not defined", after about nine minutes.
 */
export function channelVideos(channelUrls, { limit = 5, ...options } = {}) {
  return run(VIDEOS, items(channelUrls, { num_of_posts: limit, ...options }), { discoverBy: "url", limitPerInput: limit });
}

/** Videos from a YouTube explore page, such as https://www.youtube.com/gaming/games. */
export function explore(urls, { limit = 5, ...options } = {}) {
  return run(VIDEOS, items(urls, options), { discoverBy: "explore", limitPerInput: limit });
}

/** Episodes from a podcast playlist or a channel's /podcasts URL. */
export function podcast(urls, { limit = 5 } = {}) {
  return run(VIDEOS, items(urls), { discoverBy: "podcast_url", limitPerInput: limit });
}

/** Channel details for channel URLs: subscribers, views, video count, links. */
export function channels(urls) {
  return run(CHANNELS, items(urls));
}

/** Channels matching a keyword, with the same fields as `channels`. */
export function channelsSearch(keyword, { limit = 5 } = {}) {
  return run(CHANNELS, [{ keyword }], { discoverBy: "keyword", limitPerInput: limit });
}

/** Comments on video URLs, `limit` per video. Billed per comment. Options: `sort_by`, `load_replies`. */
export function comments(urls, { limit = 10, ...options } = {}) {
  return run(COMMENTS, items(urls, { num_of_comments: limit, ...options }));
}

/**
 * When a discovery reaches `limit_per_input`, crawls still running can come
 * back as rows with this error. That is the limit working, not a failure.
 */
export const CANCELLED = "Crawl aborted on job cancel";

/** Records, and the error messages of the rows that are not records. */
export function split(rows) {
  return {
    records: rows.filter((row) => !row.error),
    errors: rows.filter((row) => row.error && row.error !== CANCELLED).map((row) => String(row.error)),
  };
}

/** What happened to one search keyword. */
export class Outcome {
  constructor({ keyword, videos = [], error = null, note = "" }) {
    this.keyword = keyword;
    this.videos = videos;
    this.error = error;
    this.note = note;
  }

  get ok() {
    return this.error === null;
  }

  /** One line a reader can understand without having read the source. */
  line() {
    const name = JSON.stringify(this.keyword);
    if (!this.ok) return `failed  ${name}: ${this.error}`;
    const tail = this.note ? `, ${this.note}` : "";
    return `got     ${name}: ${this.videos.length} videos${tail}`;
  }
}

/**
 * Fetch one keyword. Never rejects for a bad keyword: a failure becomes an
 * Outcome. A missing token is the exception, because it fails every keyword
 * the same way.
 */
export async function searchKeyword(keyword, { limit = 5 } = {}) {
  const outcome = new Outcome({ keyword });
  let rows;
  try {
    rows = await search(keyword, { limit });
  } catch (error) {
    if (error instanceof TokenMissing) throw error;
    // one bad keyword must not end the run
    outcome.error = error instanceof ApiError ? error.message : `${error?.name ?? "Error"}: ${error?.message ?? error}`;
    return outcome;
  }
  const { records, errors } = split(rows);
  if (records.length) {
    // Keep what was paid for. A partial run reports the rest as a note.
    outcome.videos = records;
    if (errors.length) outcome.note = `${errors.length} error rows: ${errors[0]}`;
  } else if (errors.length) {
    outcome.error = [...new Set(errors)].join("; ");
  }
  return outcome;
}

/** Run every keyword and return one Outcome each, in order. */
export async function scrape(keywords, { limit = 5 } = {}) {
  const outcomes = [];
  for (const keyword of keywords) outcomes.push(await searchKeyword(keyword, { limit }));
  return outcomes;
}

/** Write one JSON file: when it ran, and the videos found per keyword. */
export async function write(outcomes, path) {
  const document = {
    generated_at: new Date().toISOString(),
    keywords: outcomes.map((o) => ({ keyword: o.keyword, videos: o.videos })),
  };
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return target;
}
