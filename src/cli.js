#!/usr/bin/env node
/** youtube-scraper "python tutorial" "home workout" */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { TokenMissing, searchKeyword, token, write } from "./scrape.js";

const USAGE = `usage: youtube-scraper KEYWORD [KEYWORD ...] [--limit N] [--out PATH]

  KEYWORD        what you would type into YouTube, quoted
  --limit N      videos per keyword, default 5, minimum 1
  --out PATH     output file, default youtube.json`;

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const CLEAR_LINE = "\r\x1b[2K";

/** Seconds as h:mm:ss, the shape a reader can read at a glance. */
function clock(seconds) {
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${Math.floor(seconds / 3600)}:${mm}:${ss}`;
}

/**
 * A spinner and a running clock, so minutes of waiting look alive.
 * Outside a terminal it prints one plain line instead, because a log wants a
 * line, not an animation.
 */
function waiting(label) {
  if (!process.stdout.isTTY) {
    process.stdout.write(`asking  ${label}...\n`);
    return () => {};
  }
  const started = Date.now();
  let frame = 0;
  const tick = () => {
    const spin = FRAMES[frame++ % FRAMES.length];
    process.stdout.write(`${CLEAR_LINE}${spin} ${label} ${clock(Math.floor((Date.now() - started) / 1000))}`);
  };
  tick();
  const timer = setInterval(tick, 100);
  timer.unref();
  return () => {
    clearInterval(timer);
    process.stdout.write(CLEAR_LINE); // leave the line clean for the result
  };
}

/** Reject a limit the API would charge for and not honour. */
function positive(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${value} is not 1 or more`);
  return number;
}

export async function main(argv = process.argv.slice(2)) {
  let keywords;
  let limit;
  let out;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { limit: { type: "string" }, out: { type: "string" } },
      allowPositionals: true,
    });
    keywords = positionals;
    limit = values.limit === undefined ? 5 : positive(values.limit);
    out = values.out ?? "youtube.json";
    if (!keywords.length) throw new Error("give at least one keyword");
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    return 2;
  }

  process.stdout.write(
    `Finding up to ${limit} videos per keyword, for: ${keywords.join(", ")}\n` +
      "Usually two to ten minutes each. Billed per video, 5,000 free credits a month.\n",
  );
  try {
    token(); // fail before the first wait, not after it
  } catch (error) {
    if (!(error instanceof TokenMissing)) throw error;
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  const outcomes = [];
  for (const keyword of keywords) {
    const done = waiting(JSON.stringify(keyword));
    const outcome = await searchKeyword(keyword, { limit });
    done();
    process.stdout.write(`${outcome.line()}\n`);
    outcomes.push(outcome);
  }

  await write(outcomes, out);
  const found = outcomes.flatMap((outcome) => outcome.videos);
  const fields = found.length ? ` (${Object.keys(found[0]).length} fields per video)` : "";
  // the path as typed, not resolved: the reader knows where they ran it
  process.stdout.write(`\nSaved ${found.length} videos as JSON to ${out}${fields}\n`);
  return outcomes.every((outcome) => outcome.ok) ? 0 : 1;
}

/**
 * Is this file the program being run?
 *
 * Comparing `import.meta.url` to `file://${argv[1]}` is wrong twice over. A
 * path with a space encodes to %20 on one side only, and `npm install -g`
 * puts a symlink on PATH, so argv[1] is the link while import.meta.url is the
 * file it points at. Either mismatch makes the installed command exit 0 and
 * do nothing at all.
 */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = await main();
}
