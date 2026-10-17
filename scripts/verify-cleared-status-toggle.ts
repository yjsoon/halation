import { memberSpan, readRepoFile } from "./lib/source-span";

const failures: string[] = [];

const iosRow = readRepoFile("apps/ios/HowMuch/Views/RegisterView.swift");
const rowStart = iosRow.indexOf("struct TransactionRow: View {");
if (rowStart < 0) {
  failures.push("Could not find TransactionRow.");
} else {
  const row = iosRow.slice(rowStart);
  if (row.includes("Button(action: onChangeStatus)")) {
    failures.push("TransactionRow statusControl must stay an onTapGesture so trailing swipe-to-delete still works.");
  }
}

const webPage = readRepoFile("apps/web/src/pages/Transactions.tsx");
const webToggle = memberSpan(
  webPage,
  "const toggleCleared = async (transaction: Transaction, options: { refresh?: boolean } = {}): Promise<boolean> =>",
  "Transactions.tsx",
);
const webAwait = webToggle.indexOf("await api.updateTransactionCleared");
if (webAwait < 0) {
  failures.push("Web toggleCleared must still PATCH via api.updateTransactionCleared.");
} else {
  const overlay = webToggle.indexOf("setClearedOverlays");
  const replacements = webToggle.indexOf("setReplacements");
  if (overlay < 0 || overlay > webAwait) {
    failures.push(
      "Web toggleCleared must record the flipped cleared overlay before awaiting the PATCH.",
    );
  }
  if (replacements < 0 || replacements > webAwait) {
    failures.push(
      "Web toggleCleared must overlay the flipped cleared state with setReplacements before awaiting the PATCH.",
    );
  }
}
if (!webPage.includes("applyClearedOverlays(")) {
  failures.push("Web must apply cleared overlays when rendering register rows so a list refetch cannot snap the icon back.");
}
if (!webPage.includes("retainInFlightPatches(")) {
  failures.push("Web must keep in-flight cleared replacements when refreshGeneration wipes other patches.");
}
if (webPage.includes("setReplacements(new Map())")) {
  failures.push("Web must not wipe every register replacement on refresh while a cleared PATCH is in flight.");
}

if (failures.length) {
  console.error("Cleared status toggle is still waiting on the network:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log("Cleared status toggle: the iOS status control stays a tap gesture, and web overlays the flipped icon before the PATCH.");
