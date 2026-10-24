# HowMuch: Claude guidance

@AGENTS.md

Read [AGENTS.md](AGENTS.md) at the start of every thread, and [apps/ios/AGENTS.md](apps/ios/AGENTS.md) for iOS work. They hold the hosting stance, testing policy, Cloudflare deployments and iOS publication rules.

## Working style: pstack

Threads follow [pstack](https://github.com/michael-denyer/pstack-claude) when the plugin is loaded. It was vetted at version 0.9.102 (commit 356c6e0); flag to YJ if a different version is loaded. Route work it covers (more than one file, a design choice, a bug with an unknown cause) through `pstack:poteto-mode`, and apply the project playbooks in `.agents/playbooks/`. When pstack is not loaded, the merge policy below still applies in full.

Where pstack and this repository disagree, this repository wins:

- Testing follows AGENTS.md: never write unit tests after the implementation, and prefer E2E flows using the recipes in `.cursor/skills/verify-howmuch/features/`. Use `pstack:tdd` only for a regression that needs an isolated failing test first. An E2E recipe run satisfies pstack's "pin behaviour" steps.
- Never put real data from screenshots or uploads (card or account numbers, balances, names) into code, tests or commits. Use obviously fake values.
- Keep fan-out proportionate. Use `arena`, `swarm` and `architect` when the task needs competing designs or wide coverage, not by reflex.
- Never rebase, amend or squash commits that are already pushed, wherever the session runs.
- Keep pstack's working files (`todo.md`, `decisions.tsv`, `.audit/`) out of commits.
- Prose uses British spelling and no em-dashes.

## Merge policy

Do not open pull requests. Land work with [.agents/playbooks/land-on-main.md](.agents/playbooks/land-on-main.md). On every round, run an adversarial review with an Opus reviewer at max effort and a Fable reviewer at high effort, fix verified findings, then merge the reviewed commit of the thread branch into `main` with a merge commit.

This is standing permission for a thread's lead session to commit each round, push its own thread branch, and merge that branch into `main` and push `main`. It overrides AGENTS.md's "Commit only when requested", "Commit permission does not imply push permission" and "Do not infer permission to merge" for that case only. Subagents never commit to, merge into or push `main`, and no session lands another thread's branch.

Merging never authorises tagging, deploying, production D1 migrations, TestFlight or Speedflight. Never force-push or delete branches.
