/**
 * Rewrite the README's field tables from the published scraper schemas.
 *
 *     node .github/scripts/field_tables.mjs
 *
 * The JavaScript SDK reads no schema for page details or the Ad Library, so
 * this reads https://docs.brightdata.com/scrapers-full.json, the list the
 * Bright Data MCP server also loads: every scraper's output fields, with type
 * and description. No token, no dependencies.
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const START = "<!-- fields:start -->";
const END = "<!-- fields:end -->";
const SOURCE = "https://docs.brightdata.com/scrapers-full.json";

/** The README's order. Each scraper's collect_by_url method lists its full record. */
const SCRAPERS = [
  ["gd_lk56epmy2i5g7lzu0k", "video"],
  ["gd_lk538t2k2p1k3oos71", "channel"],
  ["gd_lk9q0ew71spt1mxywf", "comment"],
];

function table(fields) {
  const rows = ["| field | type | description |", "| --- | --- | --- |"];
  for (const field of fields) {
    const desc = (field.description ?? "")
      .replaceAll(" — ", ": ")
      .replaceAll("—", ":")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ")
      .replaceAll("`", "'") // no fences: a description must not become a command
      .replaceAll("|", "/"); // no table breaks
    rows.push(`| \`${field.name}\` | ${field.type ?? ""} | ${desc} |`);
  }
  return rows;
}

const text = readFileSync(root("README.md"), "utf8");
assert.ok(text.includes(START) && text.includes(END), "README field-table markers are missing");

const response = await fetch(SOURCE, { signal: AbortSignal.timeout(120_000) });
assert.ok(response.ok, `${SOURCE} answered HTTP ${response.status}`);
const published = new Map((await response.json()).map((scraper) => [scraper.id, scraper]));
const sample = JSON.parse(readFileSync(root("examples/sample_output.json"), "utf8"));
const first = sample.keywords[0].videos[0];

const lines = [
  START,
  "Regenerated every week from the published schema,",
  `[scrapers-full.json](${SOURCE}), so they cannot go stale. A record`,
  "carries the fields that apply to it, plus `timestamp` and `input`; the",
  `sample file's first video has ${Object.keys(first).length} keys.`,
];
const counts = [];
for (const [dataset, label] of SCRAPERS) {
  const fields = published.get(dataset).scrapers.collect_by_url.output_fields;
  counts.push(fields.length);
  lines.push(
    "",
    "<details>",
    `<summary>All ${fields.length} ${label} fields, <code>${dataset}</code></summary>`,
    "",
    ...table(fields),
    "",
    "</details>",
  );
}
lines.push(END);

const start = text.indexOf(START);
const end = text.indexOf(END) + END.length;
const updated = text.slice(0, start) + lines.join("\n") + text.slice(end);
writeFileSync(root("README.md"), updated, "utf8");
const total = counts.reduce((a, b) => a + b, 0);
console.log(`\nSchemas: ${SCRAPERS.length} scrapers, ${total} fields. Tables ${updated === text ? "already current" : "updated"}.`);
