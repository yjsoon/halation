# Xcode Cloud and daily TestFlight

Halation's TestFlight builds come from one Xcode Cloud workflow, **Daily TestFlight**, on app `Halation - Finance and Rewards` (`com.tinkertanker.halation`, App Store Connect app `6829787957`, team Tinkertanker `PQ6U5ESLN2`).

| Setting | Value |
|---|---|
| Source | `main` of `yjsoon/howmuch` |
| Start | Daily at 03:00 Asia/Singapore, plus manual start on `main` |
| Action | Archive `HowMuch` (`apps/ios/HowMuch.xcodeproj`) for any iOS device, clean build |
| Xcode | Xcode 27.2 (the iPhoneOS 27.1 SDK or newer is required; see [Speedflight](speedflight.md)) |
| Distribution | `INTERNAL_ONLY`: TestFlight internal testing, never App Store eligible |
| Testers | `Halation Internal`, which has access to all builds, so no post-action is needed |

The workflow is defined in [`scripts/xcode-cloud-workflow.ts`](../scripts/xcode-cloud-workflow.ts), which creates or updates it through the App Store Connect API. Without `--apply` it only reads and prints the current state:

```sh
ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=/path/AuthKey.p8 \
  bun scripts/xcode-cloud-workflow.ts [--apply]
```

It needs a Tinkertanker key with Admin or App Manager access. Xcode Cloud schedules run whether or not `main` changed, so expect one build a day. Xcode Cloud signs with cloud-managed automatic signing for `PQ6U5ESLN2`; do not change the project's signing settings for it.

## One-time owner setup

The App Store Connect API cannot create an Xcode Cloud product or grant repository access, so these steps need YJ in Xcode and App Store Connect:

1. In Xcode 27.2 or newer, open `apps/ios/HowMuch.xcodeproj`, choose **Product > Xcode Cloud > Create Workflow**, select the `HowMuch` app with team Tinkertanker, and grant Xcode Cloud access to `yjsoon/howmuch` on GitHub when asked. Delete or disable the default workflow Xcode proposes, or let it be replaced by step 3.
2. In App Store Connect, **Apps > Halation > Xcode Cloud > Settings > Build Number**, set **Next Build Number** above the last TestFlight build (build 20 at the time of writing, so 21 or more). Xcode Cloud replaces `CURRENT_PROJECT_VERSION` with its own counter, and a lower number would collide with existing uploads.
3. Run `bun scripts/xcode-cloud-workflow.ts --apply` with a Tinkertanker key. It stops with `blocked:` until steps 1 and 2 are done.

## Agent boundaries

Agents may run the script without `--apply` to inspect state. Applying it, starting builds, changing testers or submitting for review need an explicit request. App Store release is never part of this workflow.
