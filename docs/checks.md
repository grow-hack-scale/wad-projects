# The checks

Every pull request runs four checks. They only read files. Nothing in a pull request is ever run.

1. **Markdown lint.** Standard [markdownlint](https://github.com/DavidAnson/markdownlint) rules, without the line-length rule.
2. **Links.** A link to a file in this repo must point at a file that exists. A link to another site must use `https` and answer. Sites that turn automated checkers away are reported as warnings, not failures.
3. **Project files.** Every folder in `projects/` needs a `project.md` that fits [the project file format](project-file-format.md).

4. **Work sent in.** A version of a task's work lives in `projects/{project}/tasks/{task}/submissions/v{n}/` and nowhere else. The We Are Distributed Projects app writes it; the check makes sure nothing else got in:
   - the task must be one listed in that project's `project.md`;
   - a version holds `work.md` (the text), `evidence.md` (links, and files kept outside the repo) and up to 5 other files;
   - files are `.md`, `.txt`, `.png`, `.jpg`, `.webp` or `.pdf`, with lower-case names, and each image or PDF must really be what its name says (the check reads the file's first bytes);
   - an image or PDF is 2 MB at most. Larger files and all video are linked from `evidence.md`, not committed;
   - no HTML in the text, and no file marked as a program.

   Work sent in is linted like any other markdown, apart from the rules about how a document opens and repeats its headings.

Not checked yet: a fact sheet sent in as work isn't checked against the fact sheet format, because that format isn't in this repo.

Symlinks aren't allowed anywhere in the repo.

The checks live in `.github/scripts/`, and CI always runs the copy on `main`, so a pull request can't change the checks that judge it.

To run them yourself, with Node 22:

```sh
cd .github/scripts && npm ci --ignore-scripts && cd ../..
node .github/scripts/check.mjs .
```

Add `--offline` to skip the outside links.
