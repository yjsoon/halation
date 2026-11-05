// Creates or updates the Halation "Daily TestFlight" Xcode Cloud workflow
// through the App Store Connect API: archive the HowMuch scheme from main
// once a day and upload it for internal TestFlight. The "Halation Internal"
// group has access to all builds, so every processed build reaches it with
// no post-action. Never App Store eligible.
//
//   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=... \
//     bun scripts/xcode-cloud-workflow.ts [--apply]
//
// Without --apply it prints the current state and the intended workflow.
// Needs a Tinkertanker (PQ6U5ESLN2) key with Admin or App Manager access, and
// a Xcode Cloud product for the app, which only Xcode onboarding can create
// (docs/xcode-cloud.md).
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const APP_ID = "6829787957"; // Halation - Finance and Rewards, com.tinkertanker.halation
const REPO = { owner: "yjsoon", name: "howmuch" };
const WORKFLOW_NAME = "Daily TestFlight";
const XCODE = "Xcode 27.2"; // iPhoneOS SDK 27.1 or newer is required (docs/speedflight.md)
const SCHEDULE = { frequency: "DAILY", hour: 3, minute: 0, timezone: "Asia/Singapore" };
const apply = process.argv.includes("--apply");

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
  description: "Archives main daily and uploads it for internal TestFlight (Halation Internal).",
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
    buildDistributionAudience: "INTERNAL_ONLY",
    isRequiredToPass: true,
  }],
};

const product = await asc("GET", `/v1/apps/${APP_ID}/ciProduct`);
const repos: any[] = (await asc("GET", "/v1/scmRepositories?limit=200")).data;
const repo = repos.find((r) => r.attributes.ownerName === REPO.owner && r.attributes.repositoryName === REPO.name);
const groups: any[] = (await asc("GET", `/v1/apps/${APP_ID}/betaGroups`)).data;
const internal = groups.find((g) => g.attributes.isInternalGroup && g.attributes.hasAccessToAllBuilds);

console.log(`Xcode Cloud product: ${product ? product.data.id : "missing (onboard in Xcode)"}`);
console.log(`Repository ${REPO.owner}/${REPO.name}: ${repo ? repo.id : "not connected to Xcode Cloud"}`);
console.log(`Internal group with all builds: ${internal ? internal.attributes.name : "missing"}`);
console.log(`Intended workflow:\n${JSON.stringify(attributes, null, 2)}`);
if (!product || !repo || !internal) {
  console.error("blocked: complete the manual steps in docs/xcode-cloud.md first");
  process.exit(1);
}

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
console.log(`${existing ? "update" : "create"} ${WORKFLOW_NAME} on ${XCODE} / macOS ${mac.attributes.name}`);
if (!apply) { console.log("dry run: pass --apply to write"); process.exit(0); }

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
console.log(`workflow ${result.data.id}: enabled=${result.data.attributes.isEnabled} schedule=${JSON.stringify(result.data.attributes.scheduledStartCondition?.schedule)}`);
