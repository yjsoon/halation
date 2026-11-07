// Creates or updates Halation's daily TestFlight through the App Store Connect
// API: the "Daily TestFlight" Xcode Cloud workflow, which archives the HowMuch
// scheme from main once a day as a TestFlight and App Store eligible build,
// the "Halation Public" external group with its public link, and the test
// information Beta App Review needs. "Halation Internal" has access to all
// builds; the workflow's TestFlight External Testing post-action, which the
// API cannot set, adds each build to "Halation Public" and submits it for
// Beta App Review. Nothing here submits for App Store review or release.
//
//   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=... \
//     [BETA_FEEDBACK_EMAIL=... BETA_PRIVACY_POLICY_URL=... \
//      BETA_CONTACT_FIRST_NAME=... BETA_CONTACT_LAST_NAME=... \
//      BETA_CONTACT_EMAIL=... BETA_CONTACT_PHONE=...] \
//     bun scripts/xcode-cloud-workflow.ts [--apply] [--submit]
//
// Without --apply it prints the current state and what it would change. The
// BETA_* values are the owner's and stay out of the repository; unset ones
// keep what App Store Connect already has. --submit adds the newest build to
// "Halation Public" and submits it for Beta App Review, for the first build or
// when the post-action is missing. Needs a Tinkertanker (PQ6U5ESLN2) key with
// Admin or App Manager access, and a Xcode Cloud product for the app, which
// only Xcode onboarding can create (docs/xcode-cloud.md).
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const APP_ID = "6829787957"; // Halation - Finance and Rewards, com.tinkertanker.halation
const REPO = { owner: "yjsoon", name: "halation" };
const WORKFLOW_NAME = "Daily TestFlight";
const XCODE = "Xcode 27.2"; // iPhoneOS SDK 27.1 or newer is required (docs/speedflight.md)
const SCHEDULE = { frequency: "DAILY", hour: 3, minute: 0, timezone: "Asia/Singapore" };
const EXTERNAL_GROUP = "Halation Public";
const LOCALE = "en-GB";
// Testers see this in TestFlight. Halation is self-hosted only: never offer
// hosting, accounts or data storage here (AGENTS.md, Hosting stance).
const BETA_DESCRIPTION = `Halation is a personal ledger built around credit card rewards. Record transactions, tag them with categories and flags, and see how each card is earning: progress to its minimum spend, headroom before its cap, and the miles or cashback earned this period. It also reports on spending, income and net worth.

Choose Start on this iPhone when the app first opens and your ledger stays on your device. If you run your own Halation server on your own Cloudflare account, you can connect the app to it instead. There is no hosted service and no sign-up.

This is a daily build from the main branch, so expect rough edges. Please send feedback and screenshots through TestFlight.`;
const REVIEW_NOTES = `No account, sign-in or server is needed. On first launch, choose "Start on this iPhone": the ledger is stored on the device and it needs no network connection. Add an account, record a few transactions (or use quick capture from text), then open the Rewards board to set up a card's reward rules and the Insights tab for reports. Connecting to a server is optional and only for people who run their own Halation server; there is no hosted service. Optional AI features use the tester's own AI provider key and are off until one is entered.`;
const apply = process.argv.includes("--apply");
const submit = process.argv.includes("--submit");
const optional = (name: string) => process.env[name] || undefined;
const localization = { feedbackEmail: optional("BETA_FEEDBACK_EMAIL"), privacyPolicyUrl: optional("BETA_PRIVACY_POLICY_URL") };
const reviewDetail = {
  contactFirstName: optional("BETA_CONTACT_FIRST_NAME"),
  contactLastName: optional("BETA_CONTACT_LAST_NAME"),
  contactEmail: optional("BETA_CONTACT_EMAIL"),
  contactPhone: optional("BETA_CONTACT_PHONE"),
};

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name}`);
  return value;
};
const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

function token(): string {
  const key = readFileSync(env("ASC_PRIVATE_KEY_PATH"), "utf8");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: env("ASC_KEY_ID"), typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: env("ASC_ISSUER_ID"), iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const sig = createSign("SHA256").update(`${head}.${body}`).sign({ key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

const auth = token();
async function asc(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = res.status === 204 ? {} : await res.json();
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  return res.status === 404 ? null : json;
}

const attributes = {
  name: WORKFLOW_NAME,
  description: "Archives main daily for TestFlight: Halation Internal at once, Halation Public after Beta App Review.",
  isEnabled: true,
  clean: true,
  containerFilePath: "apps/ios/HowMuch.xcodeproj",
  scheduledStartCondition: {
    source: { isAllMatch: false, patterns: [{ pattern: "main", isPrefix: false }] },
    schedule: SCHEDULE,
  },
  manualBranchStartCondition: {
    source: { isAllMatch: false, patterns: [{ pattern: "main", isPrefix: false }] },
  },
  actions: [{
    name: "Archive - iOS",
    actionType: "ARCHIVE",
    platform: "IOS",
    scheme: "HowMuch",
    destination: "ANY_IOS_DEVICE",
    buildDistributionAudience: "APP_STORE_ELIGIBLE",
    isRequiredToPass: true,
  }],
};

// True when every field in want has the same value in have; have may carry more.
function matches(want: any, have: any): boolean {
  if (Array.isArray(want)) return Array.isArray(have) && want.length === have.length && want.every((w, i) => matches(w, have[i]));
  if (want && typeof want === "object") return !!have && typeof have === "object" && Object.keys(want).every((k) => matches(want[k], have[k]));
  return want === have;
}
const defined = (o: Record<string, string | undefined>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
async function ensure(label: string, current: boolean, write: () => Promise<unknown>) {
  if (current) return console.log(`${label}: up to date`);
  console.log(`${label}: ${apply ? "writing" : "would write (pass --apply)"}`);
  if (apply) await write();
}
const app = { data: { type: "apps", id: APP_ID } };

const product = await asc("GET", `/v1/apps/${APP_ID}/ciProduct`);
const repos: any[] = (await asc("GET", "/v1/scmRepositories?limit=200")).data;
const repo = repos.find((r) => r.attributes.ownerName === REPO.owner && r.attributes.repositoryName === REPO.name);
const groups: any[] = (await asc("GET", `/v1/apps/${APP_ID}/betaGroups?limit=200`)).data;
const internal = groups.find((g) => g.attributes.isInternalGroup && g.attributes.hasAccessToAllBuilds);

console.log(`Xcode Cloud product: ${product ? product.data.id : "missing (onboard in Xcode)"}`);
console.log(`Repository ${REPO.owner}/${REPO.name}: ${repo ? repo.id : "not connected to Xcode Cloud"}`);
console.log(`Internal group with all builds: ${internal ? internal.attributes.name : "missing"}`);
if (!product || !repo || !internal) {
  console.error("blocked: complete the manual steps in docs/xcode-cloud.md first");
  process.exit(1);
}

// Test information for Beta App Review and testers.
const localizations: any[] = (await asc("GET", `/v1/apps/${APP_ID}/betaAppLocalizations`)).data;
const loc = localizations.find((l) => l.attributes.locale === LOCALE);
const locWant = { description: BETA_DESCRIPTION, ...defined(localization) };
await ensure(`Test information (${LOCALE})`, !!loc && matches(locWant, loc.attributes), () =>
  loc
    ? asc("PATCH", `/v1/betaAppLocalizations/${loc.id}`, { data: { type: "betaAppLocalizations", id: loc.id, attributes: locWant } })
    : asc("POST", "/v1/betaAppLocalizations", { data: { type: "betaAppLocalizations", attributes: { locale: LOCALE, ...locWant }, relationships: { app } } }));

const review = (await asc("GET", `/v1/apps/${APP_ID}/betaAppReviewDetail`)).data;
const reviewWant = { demoAccountRequired: false, notes: REVIEW_NOTES, ...defined(reviewDetail) };
const contactsMissing = (Object.keys(reviewDetail) as (keyof typeof reviewDetail)[]).filter((k) => !(reviewDetail[k] ?? review.attributes[k]));
// App Store Connect refuses review details without every contact field.
if (contactsMissing.length) console.log("Beta App Review details: waiting for the owner's contact details");
else await ensure("Beta App Review details", matches(reviewWant, review.attributes), () =>
  asc("PATCH", `/v1/betaAppReviewDetails/${review.id}`, { data: { type: "betaAppReviewDetails", id: review.id, attributes: reviewWant } }));

// External group with an unlimited public link.
let external = groups.find((g) => !g.attributes.isInternalGroup && g.attributes.name === EXTERNAL_GROUP);
const groupWant = { publicLinkEnabled: true, publicLinkLimitEnabled: false, feedbackEnabled: true };
await ensure(`External group ${EXTERNAL_GROUP}`, !!external && matches(groupWant, external.attributes), async () => {
  external = (external
    ? await asc("PATCH", `/v1/betaGroups/${external.id}`, { data: { type: "betaGroups", id: external.id, attributes: groupWant } })
    : await asc("POST", "/v1/betaGroups", { data: { type: "betaGroups", attributes: { name: EXTERNAL_GROUP, ...groupWant }, relationships: { app } } })).data;
});
console.log(`Public link: ${external?.attributes.publicLink ?? "none yet"}`);

// Workflow. The API does not expose post-actions, so only write when a field
// differs, and never rewrite a workflow whose fields already match.
const xcodes: any[] = (await asc("GET", "/v1/ciXcodeVersions?limit=50")).data;
const xcode = xcodes.find((x) => x.attributes.name === XCODE);
if (!xcode) throw new Error(`${XCODE} is not offered by Xcode Cloud`);
const macs: any[] = (await asc("GET", `/v1/ciXcodeVersions/${xcode.id}/macOsVersions`)).data;
const mac = macs.find((m) => m.attributes.name === "Latest Release") ?? macs[0];
const workflows: any[] = (await asc("GET", `/v1/ciProducts/${product.data.id}/workflows?limit=200`)).data;
const existing = workflows.find((w) => w.attributes.name === WORKFLOW_NAME);
const relationships = {
  xcodeVersion: { data: { type: "ciXcodeVersions", id: xcode.id } },
  macOsVersion: { data: { type: "ciMacOsVersions", id: mac.id } },
};
const linked = existing && (await asc("GET", `/v1/ciWorkflows/${existing.id}?include=xcodeVersion,macOsVersion&fields[ciWorkflows]=xcodeVersion,macOsVersion`)).data;
const current = existing && matches(attributes, existing.attributes) && matches(relationships, linked.relationships);
await ensure(`Workflow ${WORKFLOW_NAME} on ${XCODE} / macOS ${mac.attributes.name}`, !!current, async () => {
  const result = existing
    ? await asc("PATCH", `/v1/ciWorkflows/${existing.id}`, { data: { type: "ciWorkflows", id: existing.id, attributes, relationships } })
    : await asc("POST", "/v1/ciWorkflows", {
        data: {
          type: "ciWorkflows",
          attributes,
          relationships: {
            ...relationships,
            product: { data: { type: "ciProducts", id: product.data.id } },
            repository: { data: { type: "scmRepositories", id: repo.id } },
          },
        },
      });
  console.log(`workflow ${result.data.id}: enabled=${result.data.attributes.isEnabled} audience=${result.data.attributes.actions[0].buildDistributionAudience}`);
});

const missing = [...(localization.feedbackEmail ?? loc?.attributes.feedbackEmail ? [] : ["feedbackEmail"]), ...contactsMissing]
  .map((k) => `BETA_${k.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`);
if (missing.length) console.log(`Beta App Review still needs from the owner: ${missing.join(", ")}`);

// Newest build and, with --submit, its Beta App Review submission.
const newest = await asc("GET", `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=1&include=buildBetaDetail`);
const build = newest.data[0];
const state = newest.included?.find((i: any) => i.type === "buildBetaDetails")?.attributes.externalBuildState;
console.log(`Newest build ${build?.attributes.version}: ${build?.attributes.processingState}, external ${state}`);
if (submit) {
  if (state !== "READY_FOR_BETA_SUBMISSION") console.log("submit: newest build is not ready for Beta App Review submission; nothing to do");
  else if (missing.length || !external) console.error("blocked: fill in the test information and external group above first");
  else {
    await asc("POST", `/v1/betaGroups/${external.id}/relationships/builds`, { data: [{ type: "builds", id: build.id }] });
    const sub = await asc("POST", "/v1/betaAppReviewSubmissions", { data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: build.id } } } } });
    console.log(`submitted build ${build.attributes.version} to ${EXTERNAL_GROUP}: ${sub.data.attributes.betaReviewState}`);
  }
}
