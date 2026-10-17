import { memberSpan, readRepoFile } from "./lib/source-span";

const failures: string[] = [];

const appModel = readRepoFile("apps/ios/HowMuch/AppModel.swift");
const refresh = memberSpan(appModel, "func refreshLedger(quiet: Bool = false)", "AppModel.swift");

if (
  /serverTransactions = sortedUniqueTransactions\(\s*(?:page\.transactions|fetchedFirstPage)\s*\)/.test(refresh)
  && !refresh.includes("fetchedFirstPage + serverTransactions")
) {
  failures.push(
    "refreshLedger still replaces serverTransactions with the first page. A quiet refresh after approve or save then drops already-loaded rows, the List shrinks, and iOS clamps scroll to the top.",
  );
}

if (!refresh.includes("fetchedFirstPage + serverTransactions")) {
  failures.push(
    "Quiet refreshLedger must merge the first page into serverTransactions so a focused account's already-loaded rows stay on screen.",
  );
}

const hasMoreReset = refresh.indexOf("hasMoreTransactions = false");
const quietPhase = refresh.indexOf("if !quiet");
if (hasMoreReset >= 0 && (quietPhase < 0 || hasMoreReset < quietPhase)) {
  failures.push(
    "refreshLedger still clears hasMoreTransactions before the quiet/non-quiet split, so a mutation refresh hides Load older and resets the cursor while the first page is in flight.",
  );
}

const rootView = readRepoFile("apps/ios/HowMuch/HowMuchApp.swift");
if (
  /\.overlay\(alignment: \.bottom\) \{[\s\S]*?\n    \}\n    \.animation\(\.snappy, value: model\.lastSaveMessage/.test(rootView)
) {
  failures.push(
    "RootView still attaches .animation(.snappy, value: lastSaveMessage) to the TabView after the toast overlay. Approve and save set the toast in the same turn as the register mutation, so that animation rebuilds the List and looks like a scroll jump.",
  );
}

const components = readRepoFile("apps/ios/HowMuch/Views/Components.swift");
const toastOverlay = memberSpan(components, "struct RootSaveToastOverlay: View {", "Components.swift");
if (!toastOverlay.includes(".animation(Theme.Motion.arrive, value: model.lastSaveMessage?.id)")) {
  failures.push("RootSaveToastOverlay still needs .animation(Theme.Motion.arrive, value: model.lastSaveMessage?.id) on the overlay content, not the TabView.");
}

const register = readRepoFile("apps/ios/HowMuch/Views/RegisterView.swift");
if (register.includes('displayMode: .automatic), prompt: "Search transactions or amounts"')) {
  failures.push(
    "RegisterView searchable still uses displayMode: .automatic. Dismissing the editor sheet restores the search drawer and jumps the List to the top. Other HowMuch lists already use .always.",
  );
}
if (!register.includes('displayMode: .always), prompt: "Search transactions or amounts"')) {
  failures.push("RegisterView searchable must use displayMode: .always so sheet dismiss cannot retarget the search drawer.");
}

if (failures.length) {
  console.error("iOS register scroll after approve/save is blocked:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log("iOS register scroll: quiet ledger merge, scoped toast animation, stable search drawer.");
