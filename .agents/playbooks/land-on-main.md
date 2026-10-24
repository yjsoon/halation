---
extends: opening-a-pr, shipping
when: Landing any finished round of work from a thread branch onto main in this repository, in place of opening a pull request or running Shipping.
---

# Land on main

HowMuch does not use pull requests. A thread lands its own work by merging its branch straight into `main` after an independent two-model review. This playbook replaces pstack's PR and Shipping mechanics. Everything else in pstack still applies.

- **Replace** "Invoked at the end of every other playbook." with: invoked at the end of every other playbook, but do not open a PR. Keep the `/deslop` and `/no-comments` passes and the commit-message rules, then run the steps under **Landing** below and stop.
- **Replace** "Resolve the forge, then verify each PR independently before it lands." with: there is no forge step and no PR. Run **Landing** step 2 for the branch; the two reviewers are the independent verdict.
- **Replace** "Land bottom-up, one PR at a time." with: land one branch at a time with **Landing** steps 4 to 6. Never squash, rebase, retarget or force-push to land.

## Landing

1. **Prepare.** Commit the round on the thread branch. Run `/deslop` and `/no-comments` over `main...HEAD`. Write commit messages per **Opening a PR** (Conventional Commits title, short body).
2. **Review.** Run `interrogate` over `git diff origin/main...HEAD` with exactly two read-only reviewers, launched together: Reviewer A on Opus at `max` effort and Reviewer B on Fable at `high` effort. This replaces the default four-model panel and any `pstack-models.md` line. Ask each for findings with `file:line` and a concrete failure path.
3. **Fix.** Verify every finding against the code yourself. Fix each **Act on** finding, note the rest with a reason, and run step 2 again on the fix round. Repeat until a round has no **Act on** findings.
4. **Pin the reviewed commit.** Record the reviewed head SHA. If anything is committed after the last review, it needs its own review round.
5. **Merge.** `git fetch origin main`, check out `main` at `origin/main`, then `git merge --no-ff <reviewed-sha>` with the message `Merge branch '<thread-branch>': <summary>`. If the merge conflicts or main changed code the branch touches, resolve it, and review the resolution (step 2) before pushing. Push with a plain `git push origin main`. Never force-push.
6. **Confirm.** `git fetch origin main` and `git merge-base --is-ancestor <reviewed-sha> origin/main`. Report the merge commit SHA.

## Limits

- Merging never authorises tagging, deploying, production D1 migrations, TestFlight or Speedflight. Those need YJ's explicit request.
- Cloud threads cannot force-push, rewrite history or delete branches. Leave merged thread branches in place.
- pstack's `watch-pr` and `ship-pr` scripts, `babysit`, Autopilot and Orchestrate stack flows assume PRs and the `gh` CLI. Do not use them here.
