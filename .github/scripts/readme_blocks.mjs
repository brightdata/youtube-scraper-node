/**
 * The README's code blocks, as the live check runs them.
 *
 *     node readme_blocks.mjs list           # JSON matrix for the block jobs (ONLY filters)
 *     node readme_blocks.mjs run N          # run block N with the real token, one retry
 *     node readme_blocks.mjs cli-syntax     # every README CLI line with a dummy key
 *
 * One parser for all three, so the list and the runner can never disagree on
 * what block N is.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const README = fileURLToPath(new URL("../../README.md", import.meta.url));
const SKIP = ["npm install", "npm i ", "export ", "npx -p @brightdata/cli bdata login", "bdata login"];
const CLI = process.env.BDATA_CLI ?? ""; // the pinned CLI version; empty means whatever is installed
const TIMEOUT_MS = 1_920_000; // a block may run two searches, each waiting up to 15 minutes
// spawnSync kills a child that prints more than 1 MB by default, and reports
// exit null. Two YouTube videos as pretty JSON from the CLI came to 2.8 MB.
const MAX_BUFFER = 64 * 1024 * 1024;

export function blocks() {
  // never execute anything inside the generated field table: its text comes from
  // the API, and a fence in a description must not become a command
  const readme = readFileSync(README, "utf8").replace(/<!-- fields:start -->[\s\S]*?<!-- fields:end -->/g, "");
  const found = [];
  const seen = new Map();
  let heading = "README";
  for (const m of readme.matchAll(/^#{2,3} ([^\n]+)$|```(javascript|bash)\n([\s\S]*?)```/gm)) {
    if (m[1]) {
      heading = m[1].trim(); // a block is named after its section, not its first line
      continue;
    }
    const lang = m[2];
    let code = m[3];
    if (lang === "bash") {
      const lines = code
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#") && !SKIP.some((s) => l.startsWith(s)));
      if (!lines.length) continue;
      code = lines.join("\n");
    }
    const n = (seen.get(heading) ?? 0) + 1;
    seen.set(heading, n);
    const title = n === 1 ? heading : `${heading} (${n})`;
    found.push({ lang, title: title.slice(0, 50), code });
  }
  return found;
}

/**
 * The CLI cannot open a browser here, so the key goes in by flag, and an
 * unpinned npx is held to the version the job installed.
 */
export function cliLines(code, key) {
  return code
    .split("\n")
    .map((line) => {
      let out = CLI ? line.replace("npx -p @brightdata/cli ", `npx -p @brightdata/cli@${CLI} `) : line;
      if (out.includes("bdata pipelines")) out += ` -k ${key}`;
      return out;
    })
    .join("\n");
}

function list() {
  const wanted = new Set(
    (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(Number),
  );
  const out = blocks()
    .map((b, i) => ({ n: i + 1, lang: b.lang, title: b.title }))
    .filter((b) => !wanted.size || wanted.has(b.n));
  console.log(`blocks=${JSON.stringify(out)}`);
}

async function run(n) {
  const b = blocks()[n - 1];
  const secret = process.env.BRIGHTDATA_API_TOKEN ?? "";
  let out = "";
  let err = "";
  let ok = false;
  let secs = 0;
  let status = null;
  for (const attempt of [1, 2]) {
    const started = Date.now();
    // a README javascript block is ESM: node reads it from stdin under --input-type.
    // Only the shell ever sees the key's value.
    const done =
      b.lang === "bash"
        ? spawnSync("bash", ["-e", "-c", cliLines(b.code, '"$BRIGHTDATA_API_TOKEN"')], {
            encoding: "utf8",
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
          })
        : spawnSync(process.execPath, ["--input-type=module"], {
            input: b.code,
            encoding: "utf8",
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
          });
    secs = Math.round((Date.now() - started) / 1000);
    out = (done.stdout ?? "").trim();
    err = (done.stderr ?? "").trim();
    if (done.error?.code === "ETIMEDOUT" || done.signal) {
      err = err || "block timeout: no result within 32 minutes";
    }
    if (secret) {
      // summaries are not secret-masked the way logs are
      out = out.replaceAll(secret, "***");
      err = err.replaceAll(secret, "***");
    }
    status = done.status;
    ok = status === 0 && Boolean(b.lang === "javascript" ? out : out || err);
    if (ok || ((out || err) && !`${out}${err}`.toLowerCase().includes("timeout"))) break;
    if (attempt === 1) await sleep(30_000); // the API timed out or said nothing; one retry
  }
  // A block that exits 0 and prints nothing ran, and the API answered with no
  // rows. Say that, so the next reader does not go looking for a crash.
  const quiet = status === 0 && !out && !err;
  const shown = ok
    ? out.split("\n").slice(0, 1)
    : quiet
      ? ["exited 0 and printed nothing: the call returned no rows"]
      : (err.split("\n").filter(Boolean).length ? err : out || "no output").split("\n").slice(-6);
  const body = shown.map((line) => `    ${line.slice(0, 160)}`).join("\n");
  console.log(`\n\`${b.title}\`: ${ok ? "ok" : "FAILED"} in ${secs}s (exit ${status})\n\n${body}`);
  process.exit(ok ? 0 : 1);
}

/**
 * Run every README CLI line with a key the API rejects. A line the CLI still
 * understands reaches the API and gets a 401; a line it no longer understands
 * fails before that. Free, and needs no secret.
 */
function cliSyntax() {
  let failed = 0;
  console.log("| block | CLI line | result |\n| --- | --- | --- |");
  blocks().forEach((b, i) => {
    if (b.lang !== "bash") return;
    for (const line of b.code.split("\n")) {
      if (!line.includes("bdata pipelines")) continue;
      const done = spawnSync("bash", ["-c", cliLines(line, "invalid-key-for-syntax-check")], {
        encoding: "utf8",
        timeout: 120_000,
      });
      const text = `${done.stdout ?? ""}${done.stderr ?? ""}`;
      const ok = text.includes("401") || text.includes("Invalid credentials");
      const last = (done.stderr ?? "").trim().split("\n").filter(Boolean);
      const lastOut = last.length ? last : (done.stdout ?? "").trim().split("\n").filter(Boolean);
      const why = ok ? "reached the API" : (lastOut.slice(-3).join(" / ") || "no output").slice(0, 200);
      console.log(`| ${i + 1} | \`${line.slice(0, 90)}\` | ${ok ? "ok" : "FAILED"}: ${why.replaceAll("|", "/")} |`);
      if (!ok) {
        failed = 1;
        console.error(`::error::README block ${i + 1}: the CLI rejects \`${line}\``);
      }
    }
  });
  process.exit(failed);
}

/** Run as a script, not imported: a local runner imports blocks() and cliLines(). */
function isEntryPoint() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const [mode, arg] = process.argv.slice(2);
  if (mode === "list") list();
  else if (mode === "run") await run(Number(arg));
  else if (mode === "cli-syntax") cliSyntax();
  else {
    console.error("usage: node readme_blocks.mjs list | run N | cli-syntax");
    process.exit(2);
  }
}
