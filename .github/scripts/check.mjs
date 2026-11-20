// The checks CI runs on every pull request: markdown lint, links, and the project file format.
//
// Usage: node check.mjs <path to the checked-out pull request> [--offline]
//
// Safety: this only ever READS files from the pull request. It never imports, requires or runs
// anything from it, and it never follows a symlink. CI runs this copy from the base branch, so a
// pull request cannot change the checks that judge it.

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { lint } from "markdownlint/promise";
import { parse as parseYaml } from "yaml";

const root = path.resolve(process.argv[2] ?? ".");
const offline = process.argv.includes("--offline");
const errors = [];
const warnings = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// ---- Walk the tree (no symlinks, nothing hidden except .github) ------------------------------
async function walk(dir, out = []) {
  for (const name of (await readdir(dir)).sort()) {
    if (name === ".git" || name === "node_modules") continue;
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    const st = await lstat(full);
    if (st.isSymbolicLink()) fail(rel, "symlinks aren't allowed in this repo");
    else if (st.isDirectory()) await walk(full, out);
    else if (st.isFile()) out.push(rel);
  }
  return out;
}

// ---- Project file format ----------------------------------------------------------------------
export const SKILLS = [
  "Writing", "Research", "Design", "Video", "Marketing", "Product marketing",
  "Product management", "Testing", "Community",
];
export const FITS = ["anyone", "good-first-task", "needs-sign-in", "needs-experience"];
export const EVIDENCE = ["pr", "links"];
const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROJECT_KEYS = ["name", "area", "why", "approver", "window", "impact_metric", "status", "tasks"];
const TASK_KEYS = [
  "slug", "title", "deliverable", "criteria", "skill", "fit", "fit_note", "seats", "needed_by", "evidence",
];

const isText = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[<>]/.test(v);
function isDate(v) {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return m ? { yaml: m[1], body: m[2] } : null;
}

export function checkProject(file, text, dirSlug) {
  const bad = (msg) => fail(file, msg);
  const parts = splitFrontmatter(text);
  if (!parts) return bad("must start with a frontmatter block between two --- lines");
  let fm;
  try {
    // Plain YAML only: no custom tags, no merge keys, no duplicate keys, dates stay as text.
    fm = parseYaml(parts.yaml, { schema: "core", merge: false, uniqueKeys: true, maxAliasCount: 0 });
  } catch (e) {
    return bad(`frontmatter isn't valid YAML: ${e.message.split("\n")[0]}`);
  }
  if (!fm || typeof fm !== "object" || Array.isArray(fm)) return bad("frontmatter must be a list of keys");
  if (!SLUG.test(dirSlug)) bad(`folder name "${dirSlug}" must be lower-case letters, digits and hyphens`);
  for (const k of Object.keys(fm)) if (!PROJECT_KEYS.includes(k)) bad(`unknown key "${k}"`);
  if (!isText(fm.name, 90)) bad("name: needed, up to 90 characters, no < or >");
  if (!isText(fm.area, 40)) bad("area: needed, up to 40 characters");
  if (!isText(fm.why, 400)) bad("why: needed, up to 400 characters");
  if (!isText(fm.approver, 60)) bad("approver: needed");
  if (fm.window !== "always-open" && !isDate(fm.window)) bad('window: a date (YYYY-MM-DD, in quotes) or "always-open"');
  if (!isText(fm.impact_metric, 200)) bad("impact_metric: needed, up to 200 characters");
  if (!["open", "closed"].includes(fm.status)) bad('status: "open" or "closed"');
  if (!Array.isArray(fm.tasks) || fm.tasks.length < 1 || fm.tasks.length > 12) {
    return bad("tasks: needs 1 to 12 tasks");
  }
  const seen = new Set();
  fm.tasks.forEach((t, i) => {
    const at = `tasks[${i}]${t && typeof t.slug === "string" ? ` (${t.slug})` : ""}`;
    if (!t || typeof t !== "object" || Array.isArray(t)) return bad(`${at}: must be a list of keys`);
    for (const k of Object.keys(t)) if (!TASK_KEYS.includes(k)) bad(`${at}: unknown key "${k}"`);
    if (typeof t.slug !== "string" || !SLUG.test(t.slug)) bad(`${at}: slug must be lower-case letters, digits and hyphens`);
    else if (seen.has(t.slug)) bad(`${at}: slug is used twice in this project`);
    else seen.add(t.slug);
    if (!isText(t.title, 90)) bad(`${at}: title needed, up to 90 characters`);
    if (!isText(t.deliverable, 600)) bad(`${at}: deliverable needed, up to 600 characters`);
    if (!Array.isArray(t.criteria) || t.criteria.length < 2 || t.criteria.length > 8 || !t.criteria.every((c) => isText(c, 300))) {
      bad(`${at}: criteria needs 2 to 8 lines, each up to 300 characters`);
    }
    if (!SKILLS.includes(t.skill)) bad(`${at}: skill must be one of ${SKILLS.join(", ")}`);
    if (!FITS.includes(t.fit)) bad(`${at}: fit must be one of ${FITS.join(", ")}`);
    if (t.fit_note !== undefined && !isText(t.fit_note, 160)) bad(`${at}: fit_note up to 160 characters`);
    if ((t.fit === "needs-sign-in" || t.fit === "needs-experience") && t.fit_note === undefined) {
      bad(`${at}: fit_note is needed to say which sign-in or experience`);
    }
    if (!Number.isInteger(t.seats) || t.seats < 1 || t.seats > 6) bad(`${at}: seats must be a whole number from 1 to 6`);
    if (t.needed_by !== undefined && !isDate(t.needed_by)) bad(`${at}: needed_by must be a date (YYYY-MM-DD, in quotes)`);
    if (!EVIDENCE.includes(t.evidence)) bad(`${at}: evidence must be "pr" or "links"`);
  });
  if (parts.body.length > 20000) bad("the text under the frontmatter is over 20,000 characters");
  if (/<[a-z!/][^>]*>/i.test(parts.body.replace(/<https?:[^>\s]+>/g, ""))) bad("no HTML in the text; use markdown");
}

// ---- Links ------------------------------------------------------------------------------------
function linksIn(text) {
  const body = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const found = new Set();
  for (const m of body.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) found.add(m[1]);
  for (const m of body.matchAll(/<(https?:\/\/[^>\s]+)>/g)) found.add(m[1]);
  for (const m of body.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)) found.add(m[1]);
  return [...found];
}

async function reach(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetch(url, {
          method,
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
          headers: { "user-agent": "wad-projects-link-check (+https://github.com/grow-hack-scale/wad-projects)" },
        });
        if (res.status < 400) return { ok: true };
        // Sites that turn robots away still work for people: say so, don't fail the pull request.
        if ([401, 403, 405, 429, 999].includes(res.status) || res.status >= 500) {
          if (method === "GET") return { ok: true, note: `answered ${res.status} to the checker` };
          continue;
        }
        if (method === "GET") return { ok: false, note: `answered ${res.status}` };
      } catch (e) {
        if (method === "GET" && attempt === 1) return { ok: true, note: `couldn't be reached (${e.name})` };
      }
    }
  }
  return { ok: true, note: "couldn't be reached" };
}

async function checkLinks(file, text, files) {
  const external = [];
  for (const link of linksIn(text)) {
    if (link.startsWith("#") || link.startsWith("mailto:")) continue;
    if (/^https:\/\//i.test(link)) { external.push(link); continue; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) { fail(file, `link "${link}" must be https`); continue; }
    const target = path.normalize(path.join(path.dirname(file), decodeURIComponent(link.split("#")[0])));
    if (target.startsWith("..") || path.isAbsolute(target)) fail(file, `link "${link}" points outside the repo`);
    else if (!files.has(target) && ![...files].some((f) => f.startsWith(`${target}/`))) fail(file, `link "${link}" points at a file that isn't there`);
  }
  return external;
}

// ---- Run --------------------------------------------------------------------------------------
const all = await walk(root);
const fileSet = new Set(all);
const md = all.filter((f) => f.toLowerCase().endsWith(".md"));

// 1. Every folder in projects/ has a project.md, and each one fits the format.
const projectDirs = new Set(all.filter((f) => f.startsWith(`projects${path.sep}`)).map((f) => f.split(path.sep)[1]));
for (const dir of projectDirs) {
  const file = path.join("projects", dir, "project.md");
  if (!fileSet.has(file)) fail(path.join("projects", dir), "has no project.md");
  else checkProject(file, await readFile(path.join(root, file), "utf8"), dir);
}

// 2. Markdown lint. The rules come from this folder, never from the pull request.
const config = JSON.parse(await readFile(new URL("./markdownlint.json", import.meta.url), "utf8"));
const texts = Object.fromEntries(await Promise.all(md.map(async (f) => [f, await readFile(path.join(root, f), "utf8")])));
const linted = await lint({ strings: texts, config });
for (const [file, results] of Object.entries(linted)) {
  for (const r of results) fail(file, `line ${r.lineNumber}: ${r.ruleNames[0]} ${r.ruleDescription}${r.errorDetail ? ` (${r.errorDetail})` : ""}`);
}

// 3. Links: files that are linked must exist; outside links must be https and answer.
const outside = new Map();
for (const file of md) {
  for (const url of await checkLinks(file, texts[file], fileSet)) {
    if (!outside.has(url)) outside.set(url, file);
  }
}
if (!offline) {
  const list = [...outside.entries()];
  if (list.length > 300) fail("links", `too many outside links to check (${list.length})`);
  else {
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async ([url, file]) => {
        const r = await reach(url);
        if (!r.ok) fail(file, `link ${url} ${r.note}`);
        else if (r.note) warn(file, `link ${url} ${r.note}`);
      }));
    }
  }
}

for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.log(`error    ${e}`);
console.log(`\n${md.length} markdown files, ${projectDirs.size} projects, ${outside.size} outside links: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
