# We Are Distributed: Community Projects

This is where work done on [We Are Distributed](https://wearedistributed.org) community projects is kept.

A project is a real piece of We Are Distributed work, split into tasks. You take a seat on a task, do the work with a small squad, and send it in. An AI reviewer checks it against the task's criteria, a person at We Are Distributed approves it, and the approved work is merged here and stays on your public record.

## You don't need to use GitHub

You take seats, talk to your squad and send your work on the We Are Distributed site, in [Community](https://wearedistributed.org/community). The site opens the pull request for you. If you've linked a GitHub account and chosen to sign your work, the commit is credited to you, so it shows on your GitHub profile.

Pull requests opened directly on GitHub aren't accepted. Only the We Are Distributed Projects app opens them.

## How it works

- **You choose.** Nobody is assigned a task, and no person has a deadline.
- **Dates belong to tasks.** Some tasks are needed by a date. If nobody finishes one in time, it goes back to the We Are Distributed team.
- **Criteria come first.** Every task lists what "done" means before anyone starts. The review checks your work against that list and asks two or three follow-up questions.
- **Approved means merged.** Work is complete when it has been approved and merged into `main`.

## What's in this repo

```text
projects/
  {project}/
    project.md                              the project and its tasks
    tasks/{task}/submissions/v{n}/          the work sent in for a task, one folder per version
```

- [The project file format](docs/project-file-format.md) explains `project.md`.
- Every pull request is checked automatically: markdown lint, a link check, a format check and a check on work sent in. See [the checks](docs/checks.md).

## This repo is public

Everything here can be read by anyone, so:

- You're anonymous unless you choose to sign your work.
- Don't put personal details in your work: yours or anyone else's.
- Don't include passwords, keys or anything from a private account.

## Ground rules

- Write from real experience. No invented stories, and no AI text passed off as your own words.
- No task asks for votes, reviews or anything a platform forbids.
- Be kind to your squad.
