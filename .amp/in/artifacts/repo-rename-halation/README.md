# Repository rename to yjsoon/halation: first-owner-setup recipe

- Revision: the round's commit "Point repository links at yjsoon/halation" on top of `de4d59b2`.
- Fixture: `control-howmuch launch` (disposable stack, `fixtures/demo-ledger.json`, run `20261107T042156-6686`), fixed verifier credentials from `.cursor/skills/verify-howmuch/SKILL.md`.
- Driver: agent-browser at 1280x720, scale 2.
- Recipe: `.cursor/skills/verify-howmuch/features/first-owner-setup.md`, plus `/docs` for the API docs source link.

| Step | Expected | Observed |
| --- | --- | --- |
| Open setup | `Set up Halation`, **How to set it** links to the self-hosting guide | Link href `https://github.com/yjsoon/halation/blob/main/docs/self-hosting.md#4-create-the-setup-token` ([setup-form.png](setup-form.png)) |
| Short password | `Create account` disabled | Disabled |
| Wrong token | Mismatch alert, form stays | `That setup token does not match. Use the HOWMUCH_API_TOKEN value you set when deploying this server.` |
| Create owner | Ledger shell | Title `Ledger · Halation`; `/api/auth/status` `setup_required: false` |
| `/plan` | Lands on Ledger | `/transactions?range=all&accounts=all`, `Ledger · Halation` |
| `/docs` | **View source** links to the API contract | `https://github.com/yjsoon/halation/blob/main/docs/api-contract.md` ([api-docs.png](api-docs.png)) |
| Sign out | Sign-in form, no Setup token field, private-instance note | Username, Password, `Sign in`; note `This is a private Halation instance. Run your own.`; **Run your own** href `https://github.com/yjsoon/halation` ([sign-in.png](sign-in.png)) |
| Sign in | Ledger loads | `Ledger · Halation` |

Pre-existing mismatch, not changed by this round: the recipe expects the sign-in heading `Sign in to Halation`; the page shows `Halation` with `Clarity for a longer view`.
