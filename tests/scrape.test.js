/** These run without a token. The API is a stub. */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";

import {
  ApiError,
  CANCELLED,
  CHANNELS,
  COMMENTS,
  TokenMissing,
  VIDEOS,
  channelVideos,
  channels,
  channelsSearch,
  comments,
  explore,
  hashtag,
  podcast,
  run,
  scrape,
  search,
  searchFilters,
  searchKeyword,
  token,
  transport,
  videos,
  write,
} from "../src/scrape.js";
import { main } from "../src/cli.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const exec = promisify(execFile);
const real = { ...transport };
const savedToken = process.env.BRIGHTDATA_API_TOKEN;

let temp;
before(async () => {
  temp = await mkdtemp(join(tmpdir(), "ytscraper-"));
});
after(async () => {
  await rm(temp, { recursive: true, force: true });
});
beforeEach(() => {
  process.env.BRIGHTDATA_API_TOKEN = "test";
  transport.sleep = async () => {};
});
afterEach(() => {
  Object.assign(transport, real);
  if (savedToken === undefined) delete process.env.BRIGHTDATA_API_TOKEN;
  else process.env.BRIGHTDATA_API_TOKEN = savedToken;
});

/** Answers trigger, progress and snapshot the way the live API does. */
function fakeApi({ rows = [], states = ["ready"], refuse } = {}) {
  const calls = [];
  const queue = [...states];
  transport.fetch = async (url, init) => {
    const path = url.slice("https://api.brightdata.com/datasets/v3".length);
    calls.push({ path, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const reply = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
    if (refuse) return reply(refuse.status, refuse.body);
    if (path.startsWith("/trigger")) return reply(200, { snapshot_id: "sd_test" });
    if (path.startsWith("/progress/")) return reply(200, { status: queue.length > 1 ? queue.shift() : queue[0] });
    if (path.startsWith("/snapshot/")) return reply(200, rows);
    throw new Error(path);
  };
  return {
    calls,
    trigger() {
      const { path, body } = calls[0];
      return { query: Object.fromEntries(new URLSearchParams(path.split("?")[1])), body };
    },
  };
}

const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

describe("what is sent", () => {
  test("a keyword search is capped twice and sends the limit as text", async () => {
    const api = fakeApi();
    await search("python tutorial", { limit: 3, country: "US" });

    const { query, body } = api.trigger();
    assert.deepEqual(query, {
      dataset_id: VIDEOS,
      include_errors: "true",
      type: "discover_new",
      discover_by: "keyword",
      limit_per_input: "3",
    });
    // num_of_posts is a text field in this scraper's schema
    assert.deepEqual(body, [{ keyword: "python tutorial", num_of_posts: "3", country: "US" }]);
  });

  test("each method sends the input the live API validates", async () => {
    for (const [call, args, dataset, discoverBy, item] of [
      [videos, [VIDEO], VIDEOS, undefined, { url: VIDEO }],
      [searchFilters, ["python tutorial", { limit: 2 }], VIDEOS, "search_filters", { keyword_search: "python tutorial" }],
      [hashtag, ["#cooking", { limit: 2 }], VIDEOS, "hashtag", { hashtag: "cooking", num_of_posts: 2 }],
      [channelVideos, ["https://www.youtube.com/@NASA/videos", { limit: 2 }], VIDEOS, "url",
        { url: "https://www.youtube.com/@NASA/videos", num_of_posts: 2 }],
      [explore, ["https://www.youtube.com/gaming/games", { limit: 2 }], VIDEOS, "explore", { url: "https://www.youtube.com/gaming/games" }],
      [podcast, ["https://www.youtube.com/playlist?list=PL1", { limit: 2 }], VIDEOS, "podcast_url", { url: "https://www.youtube.com/playlist?list=PL1" }],
      [channels, ["https://www.youtube.com/@MrBeast/about"], CHANNELS, undefined, { url: "https://www.youtube.com/@MrBeast/about" }],
      [channelsSearch, ["home cooking", { limit: 2 }], CHANNELS, "keyword", { keyword: "home cooking" }],
      [comments, [VIDEO, { limit: 3 }], COMMENTS, undefined, { url: VIDEO, num_of_comments: 3 }],
    ]) {
      const api = fakeApi();
      await call(...args);
      const { query, body } = api.trigger();
      assert.equal(query.dataset_id, dataset);
      assert.equal(query.discover_by, discoverBy);
      assert.deepEqual(body, [item]);
      // every discovery is capped, so a typo cannot bill every match
      if (discoverBy) assert.equal(query.limit_per_input, "2");
    }
  });

  test("options are passed through and unset ones are left out", async () => {
    const api = fakeApi();
    await videos(["https://a", "https://b"], { transcription_language: "English", country: undefined });
    assert.deepEqual(api.trigger().body, [
      { url: "https://a", transcription_language: "English" },
      { url: "https://b", transcription_language: "English" },
    ]);
  });
});

describe("the job", () => {
  test("run polls until the snapshot is ready", async () => {
    const api = fakeApi({ rows: [{ title: "Me at the zoo" }], states: ["running", "running", "ready"] });
    assert.deepEqual(await run(VIDEOS, [{ url: "x" }]), [{ title: "Me at the zoo" }]);
    assert.equal(api.calls.filter((c) => c.path === "/progress/sd_test").length, 3);
  });

  test("a dropped poll does not lose the job", async () => {
    fakeApi({ rows: [{ title: "Me at the zoo" }] });
    const answer = transport.fetch;
    let dropped = 0;
    transport.fetch = async (url, init) => {
      if (url.includes("/progress/") && !dropped++) throw new TypeError("fetch failed");
      return answer(url, init);
    };
    assert.deepEqual(await run(VIDEOS, [{ url: "x" }]), [{ title: "Me at the zoo" }]);
    assert.ok(dropped >= 2);
  });

  test("a failed snapshot is an error", async () => {
    fakeApi({ states: ["failed"] });
    await assert.rejects(run(VIDEOS, [{ url: "x" }]), /sd_test failed/);
  });

  test("a job that never finishes times out", async () => {
    fakeApi({ states: ["running"] });
    await assert.rejects(run(VIDEOS, [{ url: "x" }], { timeoutMs: -1 }), /timeout/);
  });

  test("an HTTP error names the status and the reason", async () => {
    fakeApi({ refuse: { status: 400, body: { errors: [["duration", "This value is not allowed"]] } } });
    await assert.rejects(searchFilters("x", { duration: "4-20 minutes" }), (error) => {
      assert.ok(error instanceof ApiError);
      assert.match(error.message, /HTTP 400.*duration/);
      return true;
    });
  });
});

describe("the token", () => {
  test("comes from the environment, then the CLI login", async () => {
    delete process.env.BRIGHTDATA_API_TOKEN;
    transport.credentialsPath = () => join(temp, "missing.json");
    assert.throws(() => token(), TokenMissing);

    const credentials = join(temp, "credentials.json");
    await writeFile(credentials, JSON.stringify({ api_key: "from-login" }));
    transport.credentialsPath = () => credentials;
    assert.equal(token(), "from-login");

    process.env.BRIGHTDATA_API_TOKEN = "from-env";
    assert.equal(token(), "from-env");
  });
});

describe("what the API answers", () => {
  test("error rows alone fail the keyword", async () => {
    fakeApi({ rows: [{ error: "Parse error: something", error_code: "parse_error" }] });
    const outcome = await searchKeyword("zzqqxx");
    assert.ok(!outcome.ok);
    assert.equal(outcome.line(), 'failed  "zzqqxx": Parse error: something');
  });

  test("videos already paid for are kept, and a cancelled crawl is not an error", async () => {
    fakeApi({ rows: [{ title: "Python for Beginners" }, { error: CANCELLED }, { error: "Video unavailable", error_code: "dead_page" }] });
    const outcome = await searchKeyword("python tutorial");
    assert.ok(outcome.ok);
    assert.deepEqual(outcome.videos, [{ title: "Python for Beginners" }]);
    assert.equal(outcome.line(), 'got     "python tutorial": 1 videos, 1 error rows: Video unavailable');
  });

  test("one bad keyword does not end the run", async () => {
    let n = 0;
    transport.fetch = async () => {
      n += 1;
      if (n === 1) throw new RangeError("boom");
      const body = n === 2 ? { snapshot_id: "s" } : n === 3 ? { status: "ready" } : [{ title: "bread" }];
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
    const [first, second] = await scrape(["boom", "bread"]);
    assert.equal(first.error, "RangeError: boom");
    assert.ok(second.ok);
    assert.deepEqual(second.videos, [{ title: "bread" }]);
  });

  test("a run writes what it found", async () => {
    fakeApi({ rows: [{ title: "Me at the zoo", views: 448084582 }] });
    const outcomes = await scrape(["first youtube video"], { limit: 1 });
    const document = JSON.parse(await readFile(await write(outcomes, join(temp, "out.json")), "utf8"));
    assert.deepEqual(document.keywords, [{ keyword: "first youtube video", videos: [{ title: "Me at the zoo", views: 448084582 }] }]);
    assert.ok(document.generated_at);
  });
});

describe("the command", () => {
  test("the exit code says whether every keyword worked", async () => {
    fakeApi({ rows: [{ title: "x" }] });
    assert.equal(await main(["python tutorial", "--out", join(temp, "ok.json")]), 0);
    fakeApi({ rows: [{ error: "boom" }] });
    assert.equal(await main(["python tutorial", "--out", join(temp, "bad.json")]), 1);
  });

  test("a bad limit is refused before any request", async () => {
    const api = fakeApi();
    for (const bad of [["x", "--limit", "0"], ["x", "--limit", "-3"], []]) {
      assert.equal(await main(bad), 2);
    }
    assert.equal(api.calls.length, 0);
  });

  test("a missing token is a message, not a stack trace, and the header comes first", async () => {
    const env = { ...process.env, HOME: temp, APPDATA: temp };
    delete env.BRIGHTDATA_API_TOKEN;
    const done = await exec(process.execPath, [join(ROOT, "src", "cli.js"), "python tutorial"], { env }).catch((e) => e);
    assert.equal(done.code, 2);
    assert.match(done.stderr, /export BRIGHTDATA_API_TOKEN/);
    assert.match(done.stderr, /bdata login/);
    assert.doesNotMatch(done.stderr, /at .*\.js:\d+/);
    assert.match(done.stdout, /^Finding up to 5 videos per keyword/);
  });
});

describe("the README", () => {
  test("the excerpt is the start of the example file", async () => {
    const sample = await readFile(join(ROOT, "examples", "sample_output.json"), "utf8");
    const readme = await readFile(join(ROOT, "README.md"), "utf8");
    assert.ok(readme.includes(sample.split("\n").slice(0, 20).join("\n")), "README excerpt drifted from the file");
    assert.ok(readme.includes("](examples/sample_output.json)"));
  });

  test("every in-page link has its heading", async () => {
    const readme = await readFile(join(ROOT, "README.md"), "utf8");
    const anchors = new Set(
      [...readme.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].toLowerCase().replace(/[^a-z0-9 -]/g, "").replaceAll(" ", "-")),
    );
    for (const [, anchor] of readme.matchAll(/\]\(#([^)]+)\)/g)) {
      assert.ok(anchors.has(anchor), `#${anchor} points at no heading`);
    }
  });
});
