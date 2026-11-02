# HowMuch Agent Guidance

## Task boundaries

- For implementation and validation tasks, continue task-scoped local fixes, builds, tests, and reruns through relevant verification. Preserve unrelated work; a failed check is not a reason to stop when a safe local fix is within scope.
- Read the relevant implementation and guidance, not the whole repository. Verify the affected behavior and representative UI states; documentation-only changes do not require app builds or every feature recipe.
- Commit only when requested, honoring the requested scope and message, except that a thread lands its own finished work under [Landing work on main](#landing-work-on-main). Commit permission does not otherwise imply push permission. Do not infer permission to change an exact requested revision, sign/provision, publish builds, deploy, or install/publish external skills.
- Read-only requests stay read-only. Exact-revision validation must report failures on that revision, not silently include fixes or substitute newer code.

## Landing work on main

Do not open pull requests. A thread lands each finished round of its own work by merging its own thread branch into `main` with a merge commit. This is standing permission for the thread's lead session to commit the round, push its branch, merge it into `main` and push `main`. Subagents never commit to, merge into or push `main`, and no session lands another thread's branch. In any other checkout, stop and ask YJ.

Never put real data from screenshots or uploads (card or account numbers, balances, names) into code, tests, fixtures or commits; use obviously fake values. Prose uses British spelling and no em-dashes.

Verify every push, including the push to `main`: push with `git push -v origin HEAD:refs/heads/<branch>`, then check that `git ls-remote origin <branch>` shows the SHA you pushed. Plain pushes have silently failed before.

1. **Prepare.** Stop background agents that can still write to the checkout. `git fetch --unshallow origin main` (or `git fetch origin main` on a complete clone). Commit only this round's changes, run the affected E2E recipe at that commit (iOS recipes run on an Amp Mac satellite, or on the Devin Mac when no suitable satellite is available), commit its artefact under `.amp/in/artifacts/` (or note "docs only, n/a"), and push. The tree must be clean.
2. **Review, sized to risk.** Record the head and `origin/main` SHAs.
   - **No review** for changes limited to docs, copy, comments or artefacts. Note "no review: docs only".
   - **One reviewer**, Opus at high effort, for ordinary changes.
   - **Two reviewers**, Opus at max and Fable at high, launched together, when the diff touches D1 migrations, auth or tokens, money or rewards calculations, sync, deployment config or iOS persistence.

   A reviewer counts when it was launched with the stated model and effort (for example `features: ["model:claude-opus-5-5", "effort:max"]`) and returned a complete review. Record the launch settings; do not ask reviewers to confirm their own effort, as they cannot see it. Give each reviewer the intent, the checkout path, `git diff <base>...<head>` with literal SHAs, the E2E artefact and the sections of this file (and `apps/ios/AGENTS.md`) that apply to the diff, and ask for findings with `file:line` and a concrete failure path. If a required reviewer's launch is rejected or its review does not finish, record `BLOCKED: independent review`, tell YJ and do not merge.
3. **Fix.** Check every finding against the code. Fix each that holds up and dismiss the rest with a concrete reason. Rerun the recipe only if a fix changes behaviour. Re-review only the fix diff, with the same reviewers, and only when the fix is more than a few lines or touches a two-reviewer area. If that second round still finds real problems, stop and ask YJ.
4. **Pin.** The reviewed SHA is the branch head after the last fix that needed no further review, and `git ls-remote` must show it on the thread branch. Anything committed after it needs its own review under step 2.
5. **Merge.** Fetch `origin/main`. If it moved in files the branch changes, `git merge origin/main` on the thread branch, resolve, rerun the recipe, push and go back to step 2 (stop and ask YJ if this happens twice with nothing new on `main`). Otherwise `git worktree add --detach <tmp> origin/main` and `git merge --no-ff <reviewed-sha> -m "Merge branch '<branch>': <summary>"`. Commit nothing else in the worktree and never amend the merge commit. Run the checks for the touched paths that can run in this session; iOS checks are covered by the reviewed artefact. If a check fails or cannot run, record `BLOCKED: merge checks`, tell YJ and do not merge. Otherwise push `HEAD` to `main` and verify it; on a non-fast-forward rejection redo this step, on any other rejection stop and tell YJ. Remove the worktree on every exit. Never pull, rebase or reset `main`.
6. **Confirm.** `git fetch origin main`, check that `origin/main` is or contains the merge commit and that `git merge-base --is-ancestor <reviewed-sha> origin/main` succeeds, and report the merge commit, the reviewers and their verdicts, and anything left unfixed.

Merging never authorises tagging, deploying, production D1 migrations, TestFlight, Speedflight or triggering a workflow. Land only through git, never through the GitHub API or MCP file tools. Never force-push, rebase or amend pushed commits, or delete branches.

## Testing policy

- Never write unit tests after writing the implementation. Do not backfill tests that merely describe the code you just wrote. Verify existing code through E2E flows; for a regression that genuinely needs isolation, write the failing test before the fix.
- Strongly prefer E2E tests as the sole testing mechanism, including for complex features. Exercise the real user flow and persisted result using the browser or iOS Simulator recipes in `.cursor/skills/verify-howmuch/features/`, with an isolated local stack and synthetic data. A mocked client test or source-text assertion is not E2E coverage.
- End each E2E run with a verifiable, repeatable artifact: record the revision, fixture/setup, exact commands or interaction steps, expected outcomes, and observed results, alongside relevant screenshots, accessibility output, or API/database output. Use a recording when timing matters. Store review artifacts under `.amp/in/artifacts/`, overriding older recipe artifact and cleanup paths; exclude secrets and production data. A screenshot alone is not proof of a persisted write or a passing flow.
- If isolation is necessary, first write down the system's plausible failure modes and which ones existing E2E checks miss. Then write the smallest failing tests for those gaps, and only then write the implementation. State the failure modes beside the tests or in the task discussion; do not add a separate report by default.
- An isolated test must catch a concrete bug the E2E checks would miss, such as a race, partial failure, unsafe migration, or malformed external input. Derive expectations independently of the implementation. Do not add tests for constants, getters, mock call shapes, source spelling, or happy paths already proven end to end. When pruning, verify actual coverage: a recipe that delegates a check to a unit test does not replace that test, and an unexecuted recipe is not passing evidence.

## Hosting stance

Halation is self-hosted only. The owner does not host other people's financial data: there is no hosted service, no public sign-up and no multi-tenant plan. `https://howmuch.tk.sg` is the owner's personal instance, not a service for others. Other people run Halation on their own iPhone (local mode) or their own Cloudflare account ([self-hosting](docs/self-hosting.md)). Do not add features, copy or docs that offer hosting, accounts or data storage for other users.

The root `wrangler.jsonc`, `.dev.vars.example` and `scripts/deploy-button.sh` are the Deploy to Cloudflare button template for self-hosters. The owner's stacks never use them; they deploy from `apps/worker`. The root `bun run deploy` refuses to run outside Cloudflare Workers Builds. Keep the template's vars, cron and migrations in step with `apps/worker/wrangler.self-host.example.jsonc`.

## Cloudflare deployments

HowMuch's primary stack runs in the Tinkertanker Cloudflare account at
`https://howmuch.tk.sg`. The legacy stack in the owner's personal account now
serves only a permanent 308 redirect from `https://howmuch.soon.sg`, and its
D1 database is kept as a frozen cold backup. The `soon.sg` zone (including its
Cloudflare Email Routing) stays in the YJ account — do not move it.

### Primary stack (profile `tinkertanker`, account `Tinkertanker`)

- Wrangler profile `tinkertanker`, Cloudflare account `Tinkertanker` (`b8b1032c61d9475cd00229c74db7ec72`). Deploy with `bun run deploy:tk` from `apps/worker`, which pins `--env tk --profile tinkertanker`.
- The expected resources are Worker `howmuch` (env `tk` in `wrangler.jsonc`) and D1 database `howmuch-production-sg` (`d13295f9-10d4-4ac0-bf62-b3e8c78cbf29`, primary in SIN since the 2026-09-12 #183 cutover), serving `https://howmuch.tk.sg` (web front-end and API on one hostname).
- The pre-cutover KIX database `howmuch-production` (`df039dbc-6dda-4150-9dc3-5854a8ca6818`) is kept frozen in this account as an instant-rollback snapshot of the 2026-09-12 state; never write to it. Rollback is: point the `tk` env back at it, `deploy:tk`. Delete it only after an explicit decision.
- The `tk` environment has one cron, `5 16 * * *` (00:05 Asia/Singapore), which materialises due scheduled transactions. It has no YNAB configuration. `HOWMUCH_API_TOKEN` is an encrypted secret on this Worker. `TYPESAFE_API_KEY` (optional encrypted secret) enables Jev category suggestions and automatic categorisation of new transactions, which sends transaction details to TypeSafe; clients disclose it through `categoriser_enabled` in `/api/auth/status`. Never put it in `wrangler.jsonc` or the repo.
- Do not add `HOWMUCH_REDIRECT_TARGET` to the `tk` env. Wrangler warns that top-level vars are not inherited; that warning is expected, and setting the var here would make production redirect to itself.
- Production deploys automatically when a `v*` tag is pushed (`.github/workflows/deploy.yml`), using the `CLOUDFLARE_API_TOKEN` repo secret pinned to this account. The workflow never applies D1 migrations; migrations follow the order in `docs/deployment.md` and are run manually before tagging. It refuses to deploy while any migration is pending (`scripts/check-d1-migrations.sh`, a read-only check), using the separate `CLOUDFLARE_D1_READ_TOKEN` repo secret with only Account > D1 > Read, mapped to `CLOUDFLARE_API_TOKEN` for that step only. Do not broaden the deployment token for this check.
- This is the only environment that accepts writes. The iOS app's `productionBaseURL` points at `howmuch.tk.sg` but is no longer the default for new installs, which start with an empty server field; installs still carrying the former `howmuch.soon.sg` default migrate to it on launch, and the legacy `soon.sg` host stays reachable as a redirect.

### Legacy redirect + backup (profile `yj`, account `YJ`)

- Wrangler profile `yj`, Cloudflare account `YJ` (`810a0c404daff0737f4a2a97a7aab092`). This is the owner's personal Cloudflare account.
- Worker `howmuch` (top-level env in `wrangler.jsonc`) redirects every request to `https://howmuch.tk.sg` via `HOWMUCH_REDIRECT_TARGET` (308, path and query preserved). It has no cron and serves no data. Deploy it from `apps/worker` with `bun run deploy:yj-redirect`, which pins `--profile yj`.
- D1 database `howmuch-production` (`57dc5569-d639-44c1-bb9d-6214f43a43b8`) holds the final production snapshot taken at the 2026-09-11 cutover, frozen read-only. Treat it as a cold backup: never write to it. Restoring from it means re-importing into the Tinkertanker database using the chunked procedure in `docs/deployment.md`.
- The preview environment still lives here: Worker `howmuch-preview` and D1 `howmuch-preview` (`7ca818bd-7f04-4b9b-8a84-8c8f84a6a272`), deployed with `bun run deploy:preview`.
- The `soon.sg` zone, its DNS, and its Email Routing live here and must stay here.

### Rules for both

- Before running any remote D1 migration or Worker deployment, verify that Wrangler has selected the intended account (`Tinkertanker` or `YJ`, IDs above) and that the configured resources exist there. The account ID and resource IDs are authoritative; do not block deployment solely because the member email Cloudflare displays differs from what you expect.
- Never create replacement Cloudflare resources or change bindings merely because Wrangler is authenticated to the wrong account. Switch to the correct account instead.
- Run `scripts/backup-d1.sh` at least monthly and before any D1 migration (see `docs/deployment.md`). Dumps and checksums stay in gitignored `data/backups/`; the repository is public, so never commit them, upload them to GitHub releases or artifacts, or paste them anywhere world-readable. Restore is the manual chunked procedure, not a single command.
- Follow `docs/deployment.md` for migration, deployment, and verification order.

## iOS validation and publication

- Safe local builds/tests use `scripts/ios-xcodebuild.sh` and the [iOS validation contract](apps/ios/AGENTS.md). They do not require a clean/pushed HEAD, signing secrets, or an update to `main`. Unsigned compilation is not physical-device installation evidence.
- Speedflight is signed archive, export, and external publication in one command, not a validation step. Run it only for an explicitly authorized publication, following [the Speedflight runbook](docs/speedflight.md) and the repo skill [.agents/skills/howmuch-speedflight](.agents/skills/howmuch-speedflight/SKILL.md). iOS work alone does not authorize it.
- Preserve Apple team **Tinkertanker `PQ6U5ESLN2`**, bundle **`com.tinkertanker.halation`**, and registered-device/signing blockers. Never substitute unsigned archives or change teams to bypass a blocker.
- Install-page links are private bearer credentials: share only in the authorized private chat, never PRs/issues/public logs. Do not install an external skill or trigger CI as a fallback without an explicit request.

### iOS Speedflight

Signed archive, export, and upload in one command: `scripts/speedflight.sh`. Follow [the Speedflight runbook](docs/speedflight.md). iOS work alone does not authorize a cut; “build it on Speedflight” (or an equivalent share-a-build request) does.

- Increment every `CURRENT_PROJECT_VERSION` in `apps/ios/HowMuch.xcodeproj/project.pbxproj` before the cut so the phone replaces the last IPA. Leave `MARKETING_VERSION` unless a new marketing version was requested.
- The install page URL is derived from `SPEEDFLIGHT_SECRET` + bundle id. It stays the same across cuts. Do not rotate the secret unless the user explicitly wants a new page. “New link” means a new build on that page.
- Post the page URL only in the authorized private chat, never in PRs, issues, or public logs. There is no GitHub Actions publication path; do not invent one without an explicit request.
