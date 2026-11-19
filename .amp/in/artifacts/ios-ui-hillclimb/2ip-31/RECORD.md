# 2IP-31: Send behind the keyboard on an iPhone SE on its side

Fable 5.2 found, in its rescore of the iOS UI hillclimb, that on an iPhone SE in landscape the keyboard covers the lower 13 to 17pt of Send in an Assistant Conversation, at the default text size as well as the largest.

## Revision and setup

- Base: `origin/main` at `6fb00967` ("before").
- Change: `Views/CaptureConversationViews.swift` only (the Conversation dock). The commit that adds this record also holds the change.
- Mac satellite `macos-27`, `mac.large`, Xcode 27.3 beta, simulators on iOS 27.3: iPhone SE (3rd generation), iPhone 18 Pro, iPhone Duo and iPad Pro 13-inch (M5).
- No stack: each simulator was started in local mode ("Start on this iPhone"), which has the Assistant. Path: Insights, More, Assistant, New conversation (on the open Duo and the iPad, the Assistant tab or sidebar row).
- Landscape on the iPhone SE, the iPhone 18 Pro and the iPad comes from DeviceHub's Device > Orientation menu, with that device selected in DeviceHub's sidebar; `axe rotate` turns the Duo. The iPhone software keyboard is shown by writing `AutomaticMinimizationEnabled` false in `com.apple.keyboard.preferences`; on the iPad by Device > Keyboard > Toggle Software Keyboard, then unticking Simulate Hardware Keyboard. Drafts are typed by tapping the keys, because `axe type` hides the software keyboard.
- Both builds carried a temporary log of the room the Conversation measures between the bars and the keyboard (`composerRoom`). It was removed before the commit and the build tested.
- Frames are `[x, y, width, height]` in points from `axe describe-ui`. "Largest size" is `accessibility-extra-extra-extra-large`. Captures are in `.amp/in/artifacts/2ip-31/`, not in git.

## Cause

On the iPhone SE in landscape the room between the bars and the keyboard is 73pt at every text size (keyboard top at y 151). On the base build:

- At ordinary sizes the dock never looked at the room. Its regular layout needs 132pt, so Send was at y 123 or 124 and its lower 16 to 17pt was behind the keyboard.
- At accessibility sizes the dock used the tight layout added for 2IP-28 (two 44pt rows, 92pt). That still overflows 73pt, so Send was at y 120, 13pt behind.

So letting the tight layout apply at ordinary sizes, as the reviewer suggested, is not enough on this phone: two 44pt rows do not fit in 73pt.

## What changed

- At ordinary sizes on a short screen (compact height), the short layouts now apply when the room is less than the regular dock needs (the regular layout's paddings, a 44pt header row and the field at one line). Where the room is enough, as on the closed Duo in landscape (154pt), the dock is as it was.
- Where the room is less than the tight layout's two rows (92pt), the account and Add manually sit beside the field in one 44pt row. The account and Add manually take their width first and the field keeps at least 150pt. In that row the dock's text stops growing at `extra-extra-extra-large`, the largest size at which "Account: Choose Account" reads whole beside the field.
- The 2IP-28 rules are unchanged where two rows fit.

No keyboard height and no device name is used.

## Checks

### iPhone SE, landscape (Landscape Left), light, keyboard up, field empty

| Text size | Before (`6fb00967`) | After |
| --- | --- | --- |
| `extra-small` | Send `[581, 123, 44, 44]`, account `[32, 60, 518, 44]` | Send `[581, 106, 44, 44]`, account `[32, 104, 164, 44]`, Add manually `[204, 104, 76, 44]`, field `[350, 103, 222, 47]` |
| `large` (default) | Send `[581, 124, 44, 44]`, account `[32, 60, 513, 44]` | Send `[581, 106, 44, 44]`, account `[32, 105, 196, 44]`, Add manually `[236, 105, 82, 44]`, field `[388, 104, 185, 46]` |
| `extra-extra-extra-large` | Send `[581, 123, 44, 44]` | Send `[581, 106, 44, 44]`, account `[32, 106, 197, 44]`, Add manually `[237, 106, 114, 44]`, field `[422, 105, 152, 45]` |
| `accessibility-medium` to the largest (five sizes) | Send `[581, 120, 44, 44]`, account `[32, 74, 437 to 460, 44]` | the `extra-extra-extra-large` frames above at all five |

After the change Send, the attachment button and the field end at y 150, 1pt above the keyboard, at every size.

Further probes on the fixed build, iPhone SE in landscape:

| Probe | Observed |
| --- | --- |
| Landscape Right, default and largest size | the same frames as Landscape Left on both builds |
| Largest size, a draft typed over two lines | field `[422, 87, 152, 63]`, account and Add manually at y 96, Send `[581, 106, 44, 44]`; the field shows the last line and part of the line above |
| Dark, default and largest size, and the typed draft | the same frames as light; the captures read correctly |
| Tap the account button | the Account picker opened; Back returned the keyboard and the one-row frames |
| Tap Add manually | Add Transaction opened |
| Cancel from Add Transaction (keyboard stays down) | the dock is full size again: account `[32, 178, 340, 44]`, field `[94, 229, 479, 120]`, Send `[581, 305, 44, 44]` |

### Frames that must not move

Each state was captured on both builds with the keyboard up and the field empty, and every element's frame compared by script (keyboard keys left out).

| State | Differing frames |
| --- | --- |
| iPhone SE, portrait, default and largest size | 0 |
| iPhone 18 Pro, landscape, `accessibility-medium`, `-extra-extra-large` and the largest size (2IP-28) | 0: Send `[742, 133, 44, 44]`, account `[78, 87, 552 to 575, 44]`, keyboard top at y 178 |
| iPhone 18 Pro, portrait, default and largest size | 0 |
| Closed Duo, portrait, default and largest size | 0 apart from the keyboard's own first-use banner on one build |
| Closed Duo, landscape, default, `extra-extra-extra-large`, `accessibility-medium` and the largest size | 0 apart from the keyboard's shift key listed in another order |
| Open Duo, flat, portrait and landscape, default and largest size | 0 |
| iPad Pro 13-inch, portrait and landscape, default and largest size, software keyboard up | 0 |

### iPhone 18 Pro in landscape at ordinary sizes: changed

The room there is 100pt, less than the 132pt the regular dock needs, so it now takes the tight layout at ordinary sizes too.

| Text size | Before | After |
| --- | --- | --- |
| `large` (default) | account `[78, 73, 628, 44]`, Send `[742, 137, 44, 44]`, ending 3pt past the keyboard's top at y 178 | account `[78, 87, 628, 44]`, Send `[742, 134, 44, 44]`, ending 0pt above it |
| `extra-extra-extra-large` | Send `[742, 136, 44, 44]` | Send `[742, 133, 44, 44]` |

The sixth round of the Duo record noted the 3pt at the default size and left it, because the lead had asked for the default size to keep its frames there.

## Costs to judge

- On an iPhone SE on its side with the keyboard up, the account label is drawn smaller than the reader's text size (it shrinks to fit about 196pt), and at accessibility sizes the dock's text is drawn at `extra-extra-extra-large`. The field shows one line before it scrolls, and is 150 to 222pt wide.
- A long account name in the one-row layout shrinks to half size and is then cut with an ellipsis. Only "Choose Account" was seen; the ledger had no accounts.
- On an iPhone 18 Pro on its side at ordinary sizes the dock gives up its padding (above).

## Tests

`SIMULATOR_UDID=<iPhone 18 Pro> scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on the change without the log, simulator in portrait at the default text size, light, the app terminated first, the keyboard preference removed, and both `com.apple.Accessibility` settings written immediately before the run. build-for-testing ran at 12:25 UTC and the tests at 12:26:

- `Executed 822 tests, with 1 test skipped and 0 failures (0 unexpected) in 187.068 (187.418) seconds`
- `runner: test-without-building finished in 207s exit=0`

## Not checked

- Whether 2IP-31 was present before the hillclimb (`2258ef81`). At ordinary sizes the dock on `6fb00967` never read the room, so it is likely older; this was not built.
- iPhone SE with pending attachments or an ingest error, which add rows to the dock.
- The Duo's tabletop pose, the iPad mini, and other iPhone sizes.
- VoiceOver.
