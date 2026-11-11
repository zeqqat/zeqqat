#!/usr/bin/env node
// Bumps the version everywhere it lives and adds the changelog entry, in one go.
//
//   pnpm bump "What changed" "Another line"            patch (0.3.37 -> 0.3.38)
//   pnpm bump --minor "What changed"                     minor (0.3.37 -> 0.4.0)
//   pnpm bump --major "What changed"                     major (0.3.37 -> 1.0.0)
//
// Each quoted argument is one line in content/changelog.json, which also
// becomes the GitHub release notes. At least one line is required.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const VERSION_FILES = ["package.json", "plugin/plugin.json", "server.json"];

const args = process.argv.slice(2);
const level = args.includes("--major") ? "major" : args.includes("--minor") ? "minor" : "patch";
const changes = args.filter((a) => !a.startsWith("--")).map((a) => a.trim()).filter(Boolean);

function fail(msg) {
  console.error(`bump: ${msg}`);
  process.exit(1);
}

if (changes.length === 0) {
  fail('give at least one changelog line, e.g. pnpm bump "Blog: new post on Dokploy backups"');
}
for (const line of changes) {
  if (line.includes("—")) fail(`no em dashes in changelog lines: "${line}"`);
}

const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!m) fail(`package.json version "${current}" isn't x.y.z; bump it by hand`);
let [maj, min, pat] = m.slice(1).map(Number);
if (level === "major") [maj, min, pat] = [maj + 1, 0, 0];
else if (level === "minor") [min, pat] = [min + 1, 0];
else pat += 1;
const next = `${maj}.${min}.${pat}`;

for (const file of VERSION_FILES) {
  const text = readFileSync(file, "utf8");
  const pattern = new RegExp(`("version"\\s*:\\s*")${current.replace(/\./g, "\\.")}(")`);
  if (!pattern.test(text)) fail(`${file} doesn't have "version": "${current}"; fix it by hand first`);
  writeFileSync(file, text.replace(pattern, `$1${next}$2`));
}

const changelogPath = "content/changelog.json";
const changelog = JSON.parse(readFileSync(changelogPath, "utf8"));
if (changelog.some((e) => e.version === next)) fail(`${changelogPath} already has ${next}`);
const date = new Date().toISOString().slice(0, 10);
changelog.unshift({ version: next, date, changes });
writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + "\n");

// Catch any other file still holding the old version.
let leftovers = "";
try {
  leftovers = execSync(
    `git grep -n -F '"${current}"' -- ':!content/changelog.json' ':!pnpm-lock.yaml'`,
    { encoding: "utf8" },
  ).trim();
} catch {
  // git grep exits 1 when nothing matches
}

console.log(`${current} -> ${next}: ${VERSION_FILES.join(", ")}, ${changelogPath}`);
if (leftovers) {
  console.warn(`\nStill mentions "${current}" (check these):\n${leftovers}`);
}
