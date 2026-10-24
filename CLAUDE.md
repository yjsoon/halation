# HowMuch: Claude guidance

Project rules live in [AGENTS.md](AGENTS.md): hosting stance, testing policy, Cloudflare deployments and iOS publication. Read it before changing code.

## Working style: pstack

Threads follow [pstack](https://github.com/michael-denyer/pstack-claude) when the plugin is loaded. Route work it covers (more than one file, a design choice, a bug with an unknown cause) through `pstack:poteto-mode`, and read the project playbooks in `.agents/playbooks/`.

Where pstack and this repository disagree, this repository wins:

- Testing follows AGENTS.md. Prefer E2E flows; do not backfill unit tests or add fixture-heavy tests by reflex. Use `pstack:tdd` only for a regression that needs an isolated failing test first.
- Never put real data from screenshots or uploads (card or account numbers, balances, names) into code, tests or commits. Use obviously fake values.
- Keep fan-out proportionate. Use `arena`, `swarm` and `architect` when the task needs competing designs or wide coverage, not by reflex.
- Prose uses British spelling and no em-dashes.

## Merge policy

Do not open pull requests. Land work with [.agents/playbooks/land-on-main.md](.agents/playbooks/land-on-main.md): on every round, an adversarial `interrogate` review with an Opus reviewer at max effort and a Fable reviewer at high effort, fix verified findings, then merge the reviewed commit of the thread branch into `main` with a merge commit. This is standing permission to merge thread branches into `main`, and it overrides the "do not infer permission to merge" line in AGENTS.md for that case only.

Merging never authorises tagging, deploying, production D1 migrations, TestFlight or Speedflight. Cloud threads cannot force-push or delete branches.
