# The checks

Every pull request runs three checks. They only read files. Nothing in a pull request is ever run.

1. **Markdown lint.** Standard [markdownlint](https://github.com/DavidAnson/markdownlint) rules, without the line-length rule.
2. **Links.** A link to a file in this repo must point at a file that exists. A link to another site must use `https` and answer. Sites that turn automated checkers away are reported as warnings, not failures.
3. **Project files.** Every folder in `projects/` needs a `project.md` that fits [the project file format](project-file-format.md).

Symlinks aren't allowed anywhere in the repo.

The checks live in `.github/scripts/`, and CI always runs the copy on `main`, so a pull request can't change the checks that judge it.

To run them yourself, with Node 22:

```sh
cd .github/scripts && npm ci --ignore-scripts && cd ../..
node .github/scripts/check.mjs .
```

Add `--offline` to skip the outside links.
