---
extends: opening-a-pr, shipping
when: Landing any finished round of work from a thread branch onto main in this repository, in place of opening a pull request or running Shipping.
---

# Land on main

HowMuch does not use pull requests. A thread lands its own work by merging its own branch into `main` after an independent two-model review. This playbook replaces pstack's PR and Shipping mechanics. The rest of pstack applies as limited by `CLAUDE.md`.

- **Replace** "Invoked at the end of every other playbook." with: invoked at the end of every other playbook, but never open a PR, through `gh`, the GitHub API, MCP tools or a built-in PR tool. Run the steps under **Landing** below and stop.
- **Replace** "Rebase into small, ordered commits before opening PRs." with: commit forward in small commits. Never rebase, amend or squash a commit that is already on origin.
- **Replace** "Conventional Commits `type(scope): subject`, no trailing period." with: the repository's style, `Area: subject`, no trailing period.
- **Replace** "Resolve the forge before the first PR operation and keep that choice for create, edit, view, watch, and merge." with: there is no forge step. Use plain git only.
- **Replace** "When the run provides a built-in PR tool, create, edit, retarget, and mark ready through it, never through a forge CLI." with: do not use any PR tool.
- **Replace** "Prefer five narrow PRs to one large PR." with: one thread branch, landed in rounds. No stacks.
- **Replace** "Open every PR ready, never as a draft." with: skip, there is no PR.
- **Replace** "Opening a PR does not start a babysit." with: there is no babysit. Delegates never open PRs, commit to `main` or push `main`; give them CLAUDE.md and say so in every brief.
- **Replace** "Resolve the forge, then verify each PR independently before it lands." with: run **Landing** steps 1 to 4 for the branch. The two reviewers are the independent verdict.
- **Replace** "Land only the contiguous verified run rooted at the bottom." with: skip, one branch at a time.
- **Replace** "Re-check that the verdicts still describe the code." with: **Landing** step 4 pins the reviewed commit and its base.
- **Replace** "Land bottom-up, one PR at a time." with: run **Landing** steps 5 and 6. Never squash, rebase, retarget or force-push to land.
- **Replace** "Leave the stack alone while it lands." with: skip. Do not run `watch-pr`, `ship-pr` or `/loop`.
- **Replace** "Stop at the ceiling." with: stop once step 6 confirms the merge.

## Landing

Land only from the thread's own `claude/...` branch. Never commit on `main`, and commit only this round's changes. In any other checkout, stop and ask YJ.

1. **Prepare.** Stop any background agent that can still write to the checkout. Run `git fetch --unshallow origin main` (or `git fetch origin main` if the clone is complete). If pstack is loaded, run `/deslop` and `/no-comments` over `origin/main...HEAD`. Commit, run the affected E2E recipe at that commit as AGENTS.md asks, commit its artefact under `.amp/in/artifacts/` (or note "docs only, n/a"), and push the thread branch. The tree must be clean (`git status --porcelain` empty).
2. **Review.** Record the head SHA and the `origin/main` SHA as the base. Launch two read-only reviewers together, each with an explicit `model` and `effort` on the Agent call: Reviewer A is Opus at `max`, Reviewer B is Fable at `high`. No substitutes, and no other panel: interrogate's model sheet and fallbacks and poteto-mode's effort adjustments do not apply here. When pstack is loaded, use `interrogate`'s reviewer prompt and judgment steps with these two reviewers. Give each the same brief: the intent, the checkout path, `git diff <base>...<head>` with literal SHAs, CLAUDE.md, AGENTS.md (and `apps/ios/AGENTS.md` for iOS work), the E2E artefact (ask them to check its recorded revision matches the code), and a request for findings with `file:line` and a concrete failure path. If either reviewer is rejected or does not return a complete review at its stated model and effort, record `BLOCKED: independent review`, tell YJ and do not merge. A clean round is one where both reviewers return and no finding holds up.
3. **Fix.** Verify every finding against the code. Fix each one that holds up, and dismiss others only with a concrete reason. Commit the fixes, rerun the affected E2E recipe at that commit, commit its artefact, push, and run step 2 again. After three rounds that still produce real findings, stop and ask YJ. The landing report lists every finding left unfixed and why.
4. **Pin.** The reviewed SHA is the head of the last clean review round, and it must be on `origin/<thread-branch>`. Anything committed after it needs its own review round.
5. **Merge.** Fetch `origin/main`. If it has moved and touches files the branch changes, go to the conflict path. Otherwise merge in a temporary detached worktree: `git worktree add --detach <tmp> origin/main`, then `git merge --no-ff <reviewed-sha> -m "Merge branch '<thread-branch>': <summary>"`. If that merge conflicts, `git merge --abort`, remove the worktree and take the conflict path. Never commit anything in the worktree except the merge commit, and never change that commit. Check that `HEAD^1` is the fetched `origin/main` and `HEAD^2` is the reviewed SHA, run the checks for the touched paths (install dependencies first if the worktree has none). If any check fails, remove the worktree and take the conflict path. Only when they pass, `git push origin HEAD:refs/heads/main`. If the push is rejected as non-fast-forward, remove the worktree and restart step 5. On any other rejection, stop and tell YJ. Never `git pull`, rebase or reset `main`, and never force-push.
   - **Conflict path.** Run `git merge origin/main` on the thread branch, resolve and fix there, commit, rerun the affected E2E recipe at that commit, commit its artefact, push, and go back to step 2.
6. **Confirm.** `git fetch origin main`, check that `origin/main` is the merge commit (or contains it) and that `git merge-base --is-ancestor <reviewed-sha> origin/main` succeeds. Remove the temporary worktree. Report the merge commit SHA, the reviewers' verdicts and anything left unfixed.

## Limits

- Merging never authorises tagging, deploying, production D1 migrations, TestFlight, Speedflight or triggering any workflow. Those need YJ's explicit request.
- Land only through git. Never write to `main` with the GitHub API or MCP file tools.
- Never force-push, rewrite pushed history or delete branches, wherever the session runs. Leave merged thread branches in place.
- pstack's `watch-pr` and `ship-pr` scripts, `babysit`, Autopilot, Orchestrate and stacked-PR flows assume PRs and the `gh` CLI. Do not use them here. Multi-phase work runs as sequential rounds, each landed by this playbook.
