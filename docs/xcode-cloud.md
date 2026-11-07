# Xcode Cloud and daily TestFlight

Halation's TestFlight builds come from one Xcode Cloud workflow, **Daily TestFlight**, on app `Halation - Finance and Rewards` (`com.tinkertanker.halation`, App Store Connect app `6829787957`, team Tinkertanker `PQ6U5ESLN2`).

| Setting | Value |
|---|---|
| Source | `main` of `yjsoon/halation` |
| Start | Daily at 03:00 Asia/Singapore, plus manual start on `main` |
| Action | Archive `HowMuch` (`apps/ios/HowMuch.xcodeproj`) for any iOS device, clean build |
| Xcode | Xcode 27.2 (the iPhoneOS 27.1 SDK or newer is required; see [Speedflight](speedflight.md)) |
| Distribution | `APP_STORE_ELIGIBLE` (TestFlight and App Store), so builds can reach external testers. Nothing submits them for App Store review or release |
| Internal testers | `Halation Internal`, which has access to all builds and gets each one once it has processed |
| External testers | `Halation Public`, joined through the public link [testflight.apple.com/join/fS4FFbSy](https://testflight.apple.com/join/fS4FFbSy) (no tester limit beyond Apple's 10,000). A **TestFlight External Testing** post-action adds each build to it and submits it for Beta App Review; testers get it once Apple approves it |
| Export compliance | `ITSAppUsesNonExemptEncryption` is `false` in `apps/ios/HowMuch/Info.plist`, so builds need no encryption declaration |

[`scripts/xcode-cloud-workflow.ts`](../scripts/xcode-cloud-workflow.ts) creates or updates, through the App Store Connect API, the workflow, the `Halation Public` group with its public link, the `en-GB` beta app description and the Beta App Review notes. Without `--apply` it only reads and prints the current state, including the public link and the newest build's external state:

```sh
ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=/path/AuthKey.p8 \
  BETA_FEEDBACK_EMAIL=... BETA_PRIVACY_POLICY_URL=... \
  BETA_CONTACT_FIRST_NAME=... BETA_CONTACT_LAST_NAME=... BETA_CONTACT_EMAIL=... BETA_CONTACT_PHONE=... \
  bun scripts/xcode-cloud-workflow.ts [--apply] [--submit]
```

The `BETA_*` values are the owner's feedback address and Beta App Review contact. They stay out of the repository; when one is unset, the script keeps what App Store Connect already has. App Store Connect refuses Beta App Review details without every contact field, and Beta App Review needs them and the feedback email, so the script lists any that are still missing. The privacy policy URL is optional for TestFlight. `--submit` adds the newest build to `Halation Public` and submits it for Beta App Review when it is ready for submission. Use it for a build that missed the post-action; the post-action handles the daily builds.

The beta description and review notes in the script describe the self-hosted app: local mode on the iPhone, or the tester's own server. They must never offer hosting, accounts or data storage ([hosting stance](../AGENTS.md#hosting-stance)). The first build of each app version (`MARKETING_VERSION`) gets a full Beta App Review, which can take a day or more; later builds of the same version are usually approved much faster. Apple allows six Beta App Review submissions a day.

The API does not expose Xcode Cloud post-actions, so the script only writes the workflow when one of its own fields differs. Whether a rewrite keeps the post-action is untested, so check that it is still there after any run that writes the workflow.

It needs a Tinkertanker key with Admin or App Manager access. Xcode Cloud schedules run whether or not `main` changed, so expect one build a day. Xcode Cloud signs with cloud-managed automatic signing for `PQ6U5ESLN2`; do not change the project's signing settings for it.

## One-time owner setup

The App Store Connect API cannot create an Xcode Cloud product or grant repository access, so these steps need YJ in Xcode and App Store Connect:

1. In Xcode 27.2 or newer, open `apps/ios/HowMuch.xcodeproj`, choose **Integrate > Create Workflow…**, select the `HowMuch` app with team Tinkertanker, and grant Xcode Cloud access to `yjsoon/halation` on GitHub when asked. On GitHub, give the Xcode Cloud app **Only select repositories: `yjsoon/halation`**; `danielsaidi/EmojiKit` is public and needs no access. Finish with **Close**, not **Start First Build**, then disable the **Default** workflow Xcode created, because it builds on every push to `main`.
2. In App Store Connect, **Apps > Halation > Xcode Cloud > Settings > Build Number**, set **Next Build Number** above the last TestFlight build (build 20 at the time of writing, so 21 or more). Xcode Cloud replaces `CURRENT_PROJECT_VERSION` with its own counter, and a lower number would collide with existing uploads.
3. Run `bun scripts/xcode-cloud-workflow.ts --apply` with a Tinkertanker key and the `BETA_*` values. It stops with `blocked:` until steps 1 and 2 are done.
4. In Xcode (**Integrate > Manage Workflows…**) or App Store Connect (**Xcode Cloud > Manage Workflows**), edit **Daily TestFlight**: under **Post-Actions** add **TestFlight External Testing** and choose the group `Halation Public`. Xcode Cloud then adds each build to the group and submits it for Beta App Review.

## Agent boundaries

Agents may run the script without `--apply` to inspect state. Applying it, `--submit`, starting builds, changing testers or groups, and changing the beta description or review notes need an explicit request. Submitting for App Store review or release is never part of this workflow.
