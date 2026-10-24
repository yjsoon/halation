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
- **Replace** "Opening a PR does not start a babysit." with: there is no babysit. Delegates never open PRs, commit to `main` or push `main`; tell them so in every brief.
- **Replace** "Resolve the forge, then verify each PR independently before it lands." with: run **Landing** steps 1 to 4 for the branch. The two reviewers are the independent verdict.
- **Replace** "Land only the contiguous verified run rooted at the bottom." with: skip, one branch at a time.
- **Replace** "Re-check that the verdicts still describe the code." with: **Landing** step 4 pins the reviewed commit and its base.
- **Replace** "Land bottom-up, one PR at a time." with: run **Landing** steps 5 and 6. Never squash, rebase, retarget or force-push to land.
- **Replace** "Leave the stack alone while it lands." with: skip. Do not run `watch-pr`, `ship-pr` or `/loop`.
- **Replace** "Stop at the ceiling." with: stop once step 6 confirms the merge.

## Landing

1. **Prepare.** Stop any background agent that can still write to the checkout. Run `git fetch --unshallow origin main` (or `git fetch origin main` if the clone is complete). If pstack is loaded, run `/deslop` and `/no-comments` over `origin/main...HEAD`. Then commit and push the thread branch. The tree must be clean (`git status --porcelain` empty). Have the E2E artefact AGENTS.md asks for, under `.amp/in/artifacts/`, or note "docs only, n/a".
2. **Review.** Launch two read-only reviewers together, with no substitutes. Reviewer A is Opus at `max` effort, Reviewer B is Fable at `high` effort. Use `interrogate` when pstack is loaded, with its panel replaced by these two; otherwise spawn them with the Agent tool directly. Give each the same brief: the intent, `git diff origin/main...HEAD`, AGENTS.md (and `apps/ios/AGENTS.md` for iOS work), the E2E artefact, and a request for findings with `file:line` and a concrete failure path. If either model or effort level is unavailable, record `BLOCKED: independent review`, tell YJ and do not merge.
3. **Fix.** Verify every finding against the code. Fix each one that holds up, and dismiss others only with a concrete reason. Commit the fixes on the thread branch and run step 2 again on the fix round. After three rounds that still produce real findings, stop and ask YJ. The landing report lists every finding left unfixed and why.
4. **Pin.** Record the reviewed head SHA and the `origin/main` SHA it was diffed against. Anything committed after that needs its own review round.
5. **Merge.** Fetch `origin/main`. If it has moved and touches files the branch changes, or a trial merge conflicts, do not resolve on `main`: run `git merge origin/main` on the thread branch, resolve and commit there, push, and go back to step 2. Otherwise merge in a temporary detached worktree: `git worktree add --detach <tmp> origin/main`, then `git merge --no-ff <reviewed-sha> -m "Merge branch '<thread-branch>': <summary>"`. Check that `HEAD^1` is the fetched `origin/main` and `HEAD^2` is the reviewed SHA, run the checks for the touched paths, then `git push origin HEAD:refs/heads/main`. If the push is rejected, remove the worktree and restart step 5. Never `git pull`, rebase or reset `main`, and never force-push.
6. **Confirm.** `git fetch origin main`, check that `origin/main` is the merge commit (or contains it) and that `git merge-base --is-ancestor <reviewed-sha> origin/main` succeeds. Remove the temporary worktree. Report the merge commit SHA, the reviewers' verdicts and anything left unfixed.

## Limits

- Merging never authorises tagging, deploying, production D1 migrations, TestFlight, Speedflight or triggering any workflow. Those need YJ's explicit request.
- Land only through git. Never write to `main` with the GitHub API or MCP file tools.
- Never force-push, rewrite pushed history or delete branches, wherever the session runs. Leave merged thread branches in place.
- pstack's `watch-pr` and `ship-pr` scripts, `babysit`, Autopilot, Orchestrate and stacked-PR flows assume PRs and the `gh` CLI. Do not use them here. Multi-phase work runs as sequential rounds, each landed by this playbook.
