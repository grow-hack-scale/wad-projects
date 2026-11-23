// The checks CI runs on every pull request: markdown lint, links, the project file format, and
// the rules for work sent in (projects/{project}/tasks/{task}/submissions/v{n}/).
//
// Usage: node check.mjs <path to the checked-out pull request> [--offline]
//
// Safety: this only ever READS files from the pull request. It never imports, requires or runs
// anything from it, and it never follows a symlink. CI runs this copy from the base branch, so a
// pull request cannot change the checks that judge it.

import { lstat, open, readFile, readdir } from "node:fs/promises";
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
const stats = new Map();
async function walk(dir, out = []) {
  for (const name of (await readdir(dir)).sort()) {
    if (name === ".git" || name === "node_modules") continue;
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    const st = await lstat(full);
    if (st.isSymbolicLink()) fail(rel, "symlinks aren't allowed in this repo");
    else if (st.isDirectory()) await walk(full, out);
    else if (st.isFile()) {
      out.push(rel);
      stats.set(rel, { size: st.size, runs: (st.mode & 0o111) !== 0 });
    }
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
  return seen;
}

// ---- Work sent in -----------------------------------------------------------------------------
// The We Are Distributed Projects app writes a version as one folder:
//   projects/{project}/tasks/{task}/submissions/v{n}/
// holding work.md (the text), evidence.md (links, and files kept outside the repo) and up to five
// small files. Nothing else belongs under tasks/. These rules match the app's (wad-community,
// src/projects/repo.ts and work.ts); change both together.
export const SUBMISSION = { maxFiles: 5, maxBytes: 2 * 1024 * 1024, maxTextBytes: 200_000 };
const SUBMISSION_FILE = /^[a-z0-9][a-z0-9_-]{0,63}\.(png|jpg|webp|pdf|txt|md)$/;
const VERSION = /^v[1-9][0-9]{0,3}$/;

async function head(file, n = 16) {
  const fh = await open(path.join(root, file), "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(n), 0, n, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** What a file is, from its first bytes. The extension is a claim; this is the check. */
export function kindOf(b) {
  const at = (sig, from = 0) => sig.every((x, i) => b[from + i] === x);
  if (b.length >= 8 && at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (b.length >= 3 && at([0xff, 0xd8, 0xff])) return "jpg";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

async function checkSubmissionFile(file, name) {
  const bad = (msg) => fail(file, msg);
  const st = stats.get(file);
  if (st.runs) bad("is marked as a program; files here are never run");
  if (!SUBMISSION_FILE.test(name)) {
    return bad("isn't a file the app sends: lower-case names ending .md, .txt, .png, .jpg, .webp or .pdf only (video is linked, not committed)");
  }
  const ext = name.split(".").pop();
  if (ext === "md" || ext === "txt") {
    if (ext === "md" && name !== "work.md" && name !== "evidence.md") bad("the only markdown files in a version are work.md and evidence.md");
    if (st.size > SUBMISSION.maxTextBytes) return bad(`is over ${SUBMISSION.maxTextBytes / 1000} KB of text`);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path.join(root, file)));
    } catch {
      return bad("isn't plain text");
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return bad("isn't plain text");
    const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").replace(/<https:[^>\s]+>/g, "");
    if (/<\s*[a-z!/?][^>]*>/i.test(prose)) bad("no HTML in work sent in; use markdown");
    return;
  }
  if (st.size > SUBMISSION.maxBytes) return bad(`is over ${SUBMISSION.maxBytes / 1024 / 1024} MB; larger files are linked from evidence.md, not committed`);
  const kind = kindOf(await head(file));
  if (kind !== ext) bad(`is named .${ext} but ${kind ? `is a ${kind.toUpperCase()}` : "isn't a PNG, JPG, WebP or PDF"}`);
}

async function checkSubmissions(files, tasksByProject) {
  const versions = new Map();
  for (const file of files) {
    const parts = file.split(path.sep);
    if (parts[0] !== "projects" || parts.length < 3 || parts[2] === "project.md") continue;
    const [, project, tasksDir, task, subDir, version, name, ...rest] = parts;
    const shape = tasksDir === "tasks" && subDir === "submissions" && VERSION.test(version ?? "") && name && rest.length === 0;
    if (!shape) {
      fail(file, "doesn't belong here: a project holds project.md and tasks/{task}/submissions/v{n}/ only");
      continue;
    }
    const tasks = tasksByProject.get(project);
    if (tasks && !tasks.has(task)) fail(file, `"${task}" isn't a task in projects/${project}/project.md`);
    const key = parts.slice(0, 6).join(path.sep);
    versions.set(key, [...(versions.get(key) ?? []), name]);
    await checkSubmissionFile(file, name);
  }
  for (const [folder, names] of versions) {
    const extra = names.filter((n) => n !== "work.md" && n !== "evidence.md");
    if (extra.length > SUBMISSION.maxFiles) fail(folder, `holds ${extra.length} files; a version carries up to ${SUBMISSION.maxFiles}`);
    if (!names.includes("work.md") && !names.includes("evidence.md")) fail(folder, "has neither work.md nor evidence.md");
  }
  return versions.size;
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
const tasksByProject = new Map();
for (const dir of projectDirs) {
  const file = path.join("projects", dir, "project.md");
  if (!fileSet.has(file)) fail(path.join("projects", dir), "has no project.md");
  else {
    const tasks = checkProject(file, await readFile(path.join(root, file), "utf8"), dir);
    if (tasks) tasksByProject.set(dir, tasks);
  }
}

// 1b. Work sent in: only where it belongs, only the file types the app sends, checked by their bytes.
const versionCount = await checkSubmissions(all, tasksByProject);

// 2. Markdown lint. The rules come from this folder, never from the pull request.
const config = JSON.parse(await readFile(new URL("./markdownlint.json", import.meta.url), "utf8"));
const texts = Object.fromEntries(await Promise.all(md.map(async (f) => [f, await readFile(path.join(root, f), "utf8")])));
// Work sent in is written by people who never see a linter, so the rules about how a document must
// open and repeat its headings are off for it; everything else applies.
const isWork = (f) => f.split(path.sep)[2] === "tasks";
const pick = (want) => Object.fromEntries(Object.entries(texts).filter(([f]) => isWork(f) === want));
const linted = {
  ...(await lint({ strings: pick(false), config })),
  ...(await lint({ strings: pick(true), config: { ...config, MD041: false, MD024: false, MD025: false, MD026: false, MD036: false } })),
};
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
console.log(`\n${md.length} markdown files, ${projectDirs.size} projects, ${versionCount} versions of work, ${outside.size} outside links: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
