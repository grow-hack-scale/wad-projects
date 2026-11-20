# The project file format

Each project is one file: `projects/{project}/project.md`. The folder name is the project's address, so it uses lower-case letters, digits and hyphens only, and never changes once the project is live.

The file starts with a frontmatter block between two `---` lines, then plain markdown. We Are Distributed reads these files from `main` and shows them on the site. Nothing else in the repo can create or change a project.

Only the We Are Distributed team adds or changes a project file, and each change needs a Code Owner's approval.

## Example

```markdown
---
name: Finish the comparison pages
area: Comparison pages
why: Six job boards are scored but have no page yet.
approver: David Oragui
window: always-open
impact_metric: Visits to the new pages
status: open
tasks:
  - slug: alternatives-pages
    title: Write an alternatives page
    deliverable: One page, 600 to 900 words, in the house tone.
    criteria:
      - Every claim comes from the fact sheet.
      - It says who the other board suits better.
    skill: Writing
    fit: anyone
    seats: 3
    needed_by: "2026-12-10"
    evidence: pr
---

## What you'll work from

Anything written here is shown on the project page.
```

## Project keys

| Key | What it is |
|---|---|
| `name` | The project's name, up to 90 characters. |
| `area` | The workstream it belongs to, up to 40 characters. |
| `why` | Why the work matters, up to 400 characters. |
| `approver` | Who approves the work. |
| `window` | The date the project ends, as `"YYYY-MM-DD"`, or `always-open`. |
| `impact_metric` | What will be measured to show the work made a difference. |
| `status` | `open` or `closed`. |
| `tasks` | 1 to 12 tasks. |

## Task keys

| Key | What it is |
|---|---|
| `slug` | The task's address inside the project: lower-case letters, digits and hyphens. Never changes. |
| `title` | Up to 90 characters. |
| `deliverable` | What gets sent in, up to 600 characters. |
| `criteria` | 2 to 8 lines. The review checks the work against each one. |
| `skill` | One of: Writing, Research, Design, Video, Marketing, Product marketing, Product management, Testing, Community. |
| `fit` | `anyone`, `good-first-task`, `needs-sign-in` or `needs-experience`. |
| `fit_note` | Which sign-in or experience. Needed with the last two fits. |
| `seats` | How many people can work on it, 1 to 6. |
| `needed_by` | Optional. A date as `"YYYY-MM-DD"`. The date belongs to the task, never to a person. |
| `evidence` | `pr` when the work is files in this repo, `links` when it lives somewhere else (a forum post, a video). |

## The text under the frontmatter

Plain markdown, no HTML, up to 20,000 characters. It's public and is shown on the project page. Anything that isn't public stays out of this repo.
