# AI providers and model selection

## Which settings affect which features?

- **iOS Add, Assistant and shared documents:** Settings → AI provider, described below. Requests go directly from the phone to the provider, including in local mode with no Halation server. Keys stay in the device Keychain.
- **Web statement formatter and reward terms drafting:** each tool accepts an exact model ID and a key held only in page memory. Both support OpenAI and OpenRouter; statements also support Gemini, and terms also support OpenCode. There is no model allow-list. For Claude through OpenRouter, choose OpenRouter and enter its full ID, for example `anthropic/claude-sonnet-4.5`, not a direct Anthropic ID. Statements need an image-capable model. Requests pass through the owner's Halation server. These two tools do not currently have native iOS equivalents.
- **Category suggestions and automatic categories:** the server uses TypeSafe's Jev choice API, configured by the operator with `TYPESAFE_API_KEY` and optionally `TYPESAFE_MODEL` (SDK default `jev-latest`). There is no user-selectable general-purpose provider list. iOS capture can propose categories using its selected AI provider, but that is separate from the server categoriser. Local mode has no server-held TypeSafe key. Replacing Jev would require a separate design for its choice probabilities, confidence thresholds and safe application, not just more model names.

## iOS capture settings

In Add or an Assistant conversation, tap the **AI provider** (sparkles) toolbar button, or open **Settings → AI provider**. Choose a provider and model, enter a personal API key, and save. Saving settings does not make an inference request. Keys are device-only Keychain items scoped to the provider and normalised endpoint. An empty replacement field keeps a saved key; **Remove saved key → Save** deletes it. Choosing an external provider is enough to send capture text; there is no separate consent switch.

The default remains on-device Apple Intelligence. External providers do not require Apple Intelligence hardware or a PCC entitlement. A missing key or retired preset blocks that provider; HowMuch never silently switches to another service. Changes apply to the next request, including an explicit Retry.

For a model outside the bundled suggestions, turn on **Enter model ID**, enter the provider's exact ID and select its API. OpenRouter normally uses **Chat Completions**, including for Claude. The endpoint, provider privacy controls and saved key stay unchanged. Explicit IDs use JSON-object output (schema instructions on Messages) and provider-default reasoning, rather than inheriting another model's options. They must be non-empty, at most 160 UTF-8 bytes, with no whitespace or control characters. Saving checks syntax, not availability or capability. Invalid, unavailable or incompatible models fail the request without silently choosing a replacement. Existing removed presets still require an explicit choice, so upgrading never changes their wire settings silently.

## Shipped catalog

The source of truth for provider endpoints and suggested model presets is [`AIModels.json`](../apps/ios/HowMuch/Capture/AIModels.json), bundled as an app resource. Suggestions are rendered from it; it is not an allow-list for explicit model IDs.

| Provider | Model IDs | API |
| --- | --- | --- |
| OpenCode Go | `gpt-6-luna`, `gpt-5.6-luna`, `grok-4.7` | Responses |
| OpenCode Go | `claude-haiku-5-5` | Anthropic Messages |
| OpenCode Go | `deepseek-v4.1-flash`, `glm-5.3-flash` | Chat Completions |
| Claude | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | Anthropic Messages |
| OpenRouter | `openai/gpt-5.6-luna`, `deepseek/deepseek-v4-flash-vision-exp` | Chat Completions |
| OpenAI | `gpt-5.6-luna` | Responses |
| DeepSeek | `deepseek-v4-flash-vision-exp` | Chat Completions |

OpenCode Go no longer offers `deepseek-v4-flash-vision-exp`, so it was removed from that provider; an install that had chosen it is asked to choose another model rather than being moved silently. Go lists more models than the catalog carries. The catalog leaves out models whose data is used for training (Muse Spark and Gemini Argon, per [Go's privacy table](https://opencode.ai/docs/go/)), models without documented structured output, and Qwen, whose Messages-API options are unverified.

**Claude** uses `https://api.anthropic.com/v1` by default. Its endpoint can be replaced with a gateway that speaks the Anthropic Messages API (`"allowsCustomBaseURL": true`); the key is then stored for that endpoint only. Requests send `x-api-key` and `anthropic-version: 2023-06-01`. Every other Messages endpoint (OpenCode Go, a replaced Claude endpoint, a custom endpoint) also gets the key as a bearer token, since gateways differ in which header they read. Current Claude models think adaptively and reject a disabled-thinking setting, so the `anthropic` preset sends `output_config.effort: low` with `output_config.format` for structured output, and allows 8,192 output tokens because thinking shares that budget. Only text blocks form the answer; a stream completes only after `stop_reason: end_turn` and `message_stop`.

“DeepSeek V4 Flash Exp” is shown by its documented name, **DeepSeek V4 Flash Vision Exp**. This integration sends extracted receipt **text**, not images, even for vision-capable models. Vision upload is not part of BYOK.

OpenCode Go's [client policy](https://opencode.ai/docs/go/#where-can-i-use-it) expects coding-agent traffic. The preset is available, but users must confirm their subscription permits HowMuch. Requests identify as `HowMuch/1.0`, not a coding agent, and use a random conversation UUID for `x-opencode-session` (no account/user identifiers).

## Keeping model choices current

**Recommendation implemented: exact IDs plus bundled suggestions.** New models can be used immediately without a release, catalogue service, background downloads or a server in iPhone local mode. The small bundled list remains a set of documented request presets, not a promise to list every model. The web tools already accept exact IDs and link to OpenRouter's current list.

Alternatives:

- **Runtime provider lists:** OpenRouter's [models endpoint](https://openrouter.ai/docs/api/api-reference/models/get-models) includes modalities, supported parameters and API paths, making it a good future source of optional searchable suggestions. OpenAI's [models endpoint](https://platform.openai.com/api/reference/resources/models/methods/list) provides IDs and ownership but not the same capability information. A cross-provider implementation needs separate authentication, pagination, caching, offline/error handling and capability mapping. Fetching should be opt-in, directly from iOS and via the self-hosted server for web where required, never a central Halation service. Discovery must not block manual entry or change a saved model.
- **Generated bundled list:** removes some manual copying, works offline, and permits review of capability and privacy metadata, but still goes stale until the app or self-hosted installation updates. It cannot reliably infer API and reasoning options from IDs alone.

Runtime discovery can be added later for convenience, starting with OpenRouter. It is not needed to unblock Claude or future exact IDs. No live provider compatibility claim is made by accepting an ID.

## Updating suggestions (including agent updates)

1. Verify the provider's current official docs and exact API model ID. OpenRouter prefixes IDs with the model vendor; direct providers and Go do not. Do not invent aliases or assume OpenAI-compatible means every parameter is supported.
2. Add/edit an entry in `AIModels.json`:
   - `id`: exact API model ID; `name`: visible label.
   - `api`: `responses`, `chatCompletions` or `messages` (Anthropic Messages).
   - `format`: `jsonSchema` for verified structured-output support; otherwise `jsonObject` for a provider supporting JSON mode. Both require complete, validated capture JSON locally.
   - `reasoning`: `openAI` disables reasoning with `effort: none`; `openRouter` uses `reasoning.enabled: false`; `deepSeek` uses `thinking.type: disabled`; `lowEffort` sends `reasoning.effort: low` (Responses) or `reasoning_effort: low` (Chat Completions) for models with no off switch; `anthropic` sends `output_config.effort: low`; `providerDefault` adds no reasoning parameter. These presets prioritise short extraction latency, not deep reasoning.
3. Update the provider's `notice` and documentation link when its privacy or usage contract changes. Preserve provider IDs and endpoint scoping; changing an endpoint must not forward an existing key to it. No runtime catalog downloads or automatic model substitution.
4. Update catalog assertions in `CaptureAITests` if an explicitly supported model is retired. Run the catalog/request/stream/validation tests and representative Settings screenshots at default and accessibility text sizes. Use `scripts/ios-xcodebuild.sh` per the iOS guidance, with matching build/test products.
5. Live smoke tests need explicit authorization and a securely supplied key. Use synthetic text, never a personal ledger or uploaded financial image. Record latency, actual model ID, and result validation, without logging keys or raw private prompts. Mocked tests are not evidence of a live provider response.

Adding another model with an existing capability combination requires only catalog data and tests and docs, not transport or SwiftUI branching. A genuinely new wire protocol needs a separate transport implementation and contract tests. **Custom endpoint** supports an HTTPS base URL, exact model ID, and any of the three protocols, using JSON-object output (or, on the Messages API, the schema in the instructions); it does not infer undocumented model-specific options.

### Simulator Keychain validation

The real Keychain round-trip test (`CaptureAITests/testKeychainCanReplaceAndDeleteOnlyItsOwnCredential`) is separate from the in-memory settings tests. It needs a test host that carries an `application-identifier` entitlement; an entitlement-less host built with `CODE_SIGNING_ALLOWED=NO` fails every `SecItem*` call with `errSecMissingEntitlement` (`-34018`). That failure is an environment signal, not a code bug: do not skip the test or substitute insecure storage.

`scripts/ios-xcodebuild.sh` therefore signs simulator builds ad hoc by default:

```text
CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO
CODE_SIGN_STYLE=Manual PROVISIONING_PROFILE= PROVISIONING_PROFILE_SPECIFIER=
```

This is Xcode's normal simulator packaging/link/sign pipeline. It needs no Apple certificate, provisioning profile, network access, archive, or publication, and the product cannot run on a device. Xcode's generated `HowMuch.app-Simulated.xcent` (with `application-identifier` `PQ6U5ESLN2.com.tinkertanker.halation` and the tracked entitlements) is embedded in `__TEXT,__entitlements`; the native signature is `adhoc` with no team or authority. Keep the existing team, bundle IDs, and tracked entitlements. Do not attach iOS entitlements with `codesign --entitlements` directly: that passed static verification but failed runtime launch with AMFI's restricted-entitlement rejection.

`HOWMUCH_SIM_SIGNING=unsigned` restores `CODE_SIGNING_ALLOWED=NO` (for example, to reproduce an unsigned-only problem); the Keychain test is then expected to fail with `-34018`. Rebuild with `build-for-testing` whenever you switch modes, and pass the same mode to `test-without-building`. To check a build, `codesign -dv build/xcode/DerivedData-simulator/Build/Products/Debug-iphonesimulator/HowMuch.app` should report `flags=0x2(adhoc)`. An unsigned build also says `Signature=adhoc`, but its flags include `linker-signed` and the binary has no `__TEXT,__entitlements` section (`otool -l …/HowMuch.app/HowMuch | grep __entitlements`). There should be no `embedded.mobileprovision` either way. Never treat zero collected tests as success or clear simulator data to manufacture a pass.

## Shared documents (Share to Halation)

The same provider and key also read documents shared to Halation. The image or PDF is read into text on the device; only that text, the owner's notes for reading documents (up to 1,500 characters), any note typed on the share sheet, today's date, the budget currency and account/category names are sent, using an intake-specific prompt and schema (`IntakeRemoteReader`). The answer must be one `spends` list of at most 100 rows, each with every field and a numeric amount, or the read is rejected. A sign or thousands separators on an amount are tolerated (direction comes from `isInflow`), zero-amount rows are dropped, and an impossible date is ignored (the row takes today's date, for review). A category the document does not print is kept only as a suggestion: it never marks a saved transaction as different, and learned category rules still apply over it. Rows then go through the usual mapping, add-vs-fix matching, learned rules and review; nothing the provider finds is saved without approval. The output budget is 8,192 tokens (16,384 on the Anthropic Messages API).

The prompt tells the model today's date (so a day printed without a year resolves to the most recent one) and the budget currency (a row with only a foreign figure is left out rather than booked as a local amount).

If the provider can't be used or fails (no key saved, a retired model, authentication, network, rate limit, invalid answer, or text over the 64 KiB prompt limit), the file is read on this device with Apple Intelligence and then the line reader, and those rows say "Not read by your AI provider, so read on this device", so a broken key is not silent. Two cases wait instead: in the background, a request that failed (other than for length) and a key the locked phone won't release both leave the job queued until the app opens, then the provider is tried again. The same happens when iOS ends background time while a request is still running, so a document is not re-sent on every short background run. A provider answer of "no transactions" is final; the line reader does not second-guess it, and the batch says so and points to **On device**. With **On device** selected, nothing changes: Apple Intelligence, then the line reader. The share sheet says "Text is read by <provider>" instead of "Reads on this phone" when a provider is set up, and "Read after you sign in" when signed out.

## Privacy and recovery boundaries

- External requests contain the entered text, selected receipt transcripts, current unsaved drafts, bounded recent instructions/answers, and account/category names. They do not contain the full ledger, images, HowMuch login tokens, or provider keys inside the prompt. Prior answers can contain spending summaries.
- The model proposes drafts or a read-only query specification. Existing mapping, ambiguity resolution, account/transfer rules, and explicit Save remain authoritative. No model tool calls are executed.
- Responses requests set `store: false`. OpenRouter requests `provider.data_collection: deny` and `require_parameters: true`. These are not blanket zero-retention guarantees; gateway and upstream provider policies still apply.
- Each request uses an ephemeral URLSession with no cache, cookies, credential storage, or redirects. HTTP/provider failures use app-owned messages instead of echoing provider bodies.
- The UI shows real waiting/receiving/checking/fetching stages and elapsed time, not fabricated thoughts or unfinished financial fields. Output is applied only after a successful terminal event and full payload validation. There is a 120-second whole-turn watchdog, a 45-second transport inactivity limit, a 64 KiB prompt limit, a 1 MiB response limit, and a 4,096-token output budget (8,192 on the Anthropic Messages API, where thinking shares it). Truncated output fails without changing drafts.
- Stop and timeout invalidate the generation before a late result can apply. Input and drafts survive for Retry or Add manually; closing the conversation still preserves workspace-owned work.

## Official API references

- [OpenCode Go endpoints and privacy](https://opencode.ai/docs/go/)
- [OpenRouter models](https://openrouter.ai/api/v1/models) and [structured output](https://openrouter.ai/docs/guides/features/structured-outputs)
- [OpenAI GPT 5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) and [structured output](https://developers.openai.com/api/docs/guides/structured-outputs)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion)
- [Claude models](https://platform.claude.com/docs/en/about-claude/models/overview), [effort](https://platform.claude.com/docs/en/build-with-claude/effort) and [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

PCC is tracked separately in [#142](https://github.com/yjsoon/halation/issues/142); this implementation addresses [#143](https://github.com/yjsoon/halation/issues/143).
