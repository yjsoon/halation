// Synthetic audit ledger on top of the verify demo fixture. All values fake.
// Usage: API=http://127.0.0.1:PORT TOKEN=<api token> bun .amp/in/artifacts/ios-ui-hillclimb/kit/seed-audit.ts
const api = Bun.env.API!;
const token = Bun.env.TOKEN!;
const plan = "local-plan";
const today = new Date("2026-11-18T12:00:00+08:00");

async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(api + path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: api, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const day = (offset: number) => {
  const d = new Date(today.getTime() + offset * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
};

const status = await call("GET", "/api/auth/status");
if (status.data.setup_required) {
  await call("POST", "/api/auth/setup", { username: "verifier", password: Bun.env.PASSWORD });
  console.log("owner created");
}

const existing = (await call("GET", `/v1/plans/${plan}/accounts`)).data.accounts as { id: string; name: string }[];
const byName = new Map(existing.map((a) => [a.name, a.id]));
async function account(name: string, type: string, balance: number, icon?: string) {
  if (byName.has(name)) return byName.get(name)!;
  const res = await call("POST", `/v1/plans/${plan}/accounts`, { account: { name, type, balance, ...(icon ? { icon } : {}) } });
  const id = res.data.account.id as string;
  byName.set(name, id);
  return id;
}
const everyday = byName.get("Everyday Account")!;
const saver = byName.get("Rainy Day Saver")!;
const travel = byName.get("Travel Card")!;
const joint = await account("Joint Household Expenses Account", "checking", 3_215_470);
const wallet = await account("Wallet", "cash", 86_500);
const cashback = await account("Platinum Cashback Card", "creditCard", -1_204_660);
const brokerage = await account("Brokerage", "otherAsset", 148_302_110);
const loan = await account("Home Loan", "mortgage", -412_650_000);
const old = await account("Old Student Account", "savings", 0);
await call("PATCH", `/v1/plans/${plan}/accounts/${old}`, { account: { closed: true } });

const cats = (await call("GET", `/v1/plans/${plan}/categories`)).data.category_groups.flatMap((g: any) => g.categories) as { id: string; name: string }[];
const cat = (name: string) => cats.find((c) => c.name === name)!.id;

type Row = [number, string, number, string, string | null, string?, string?, Record<string, unknown>?];
// [day offset, account, amount milli, payee, category, memo, flag, extra]
const rows: Row[] = [
  [-48, everyday, 4_850_000, "Tinkermind Payroll", "Salary", "October salary"],
  [-46, everyday, -1_850_000, "Straits View Residences", "Utilities", "Rent and service charge"],
  [-45, joint, -212_480, "FairPrice Finest", "Groceries", "Weekly shop"],
  [-44, travel, -68_900, "Candlenut", "Dining Out", "Dinner with the Tans", "red"],
  [-41, cashback, -24_300, "Grab", "Transport"],
  [-39, cashback, -412_000, "Scoot", "Holiday", "Flights to Penang for the December long weekend", "blue"],
  [-36, wallet, -6_500, "Tiong Bahru Market", "Dining Out", "Chwee kueh"],
  [-33, everyday, -98_200, "SP Group", "Utilities", "Electricity and water"],
  [-30, joint, -187_150, "FairPrice Finest", "Groceries"],
  [-27, travel, -129_000, "MUJI", "Shopping", "Storage boxes", "purple"],
  [-24, everyday, -45_000, "Raffles Medical", "Health", "GP visit"],
  [-21, cashback, -18_600, "Grab", "Transport"],
  [-19, everyday, 620_000, "Lumen Studio", "Freelance", "Invoice 2026-041"],
  [-17, everyday, 4_850_000, "Tinkermind Payroll", "Salary", "November salary"],
  [-16, everyday, -1_850_000, "Straits View Residences", "Utilities", "Rent and service charge"],
  [-15, joint, -231_940, "FairPrice Finest", "Groceries", "Weekly shop"],
  [-14, travel, -1_284_500, "Singapore Airlines", "Holiday", "Return flights, two adults", "blue"],
  [-12, cashback, -32_400, "The Providore at Downtown Gallery", "Dining Out", "Brunch"],
  [-10, wallet, -4_200, "Kopitiam", "Dining Out"],
  [-9, everyday, -500_000, "Vanguard", "Investing", "Monthly index fund"],
  [-8, cashback, -15_900, "Grab", "Transport"],
  [-7, joint, -164_720, "Cold Storage", "Groceries"],
  [-6, travel, -86_000, "Uniqlo", "Shopping", undefined, "green"],
  [-5, everyday, -72_350, "SP Group", "Utilities", "Electricity and water"],
  [-4, cashback, -58_800, "Burnt Ends", "Dining Out", "Anniversary", "red"],
  [-3, wallet, -3_800, "Ya Kun Kaya Toast", "Dining Out"],
  [-2, cashback, -21_450, "Guardian", "Health", undefined, undefined, { cleared: "uncleared" }],
  [-2, joint, -9_900, "Netflix", null, "No category yet"],
  [-1, cashback, -47_300, "Shopee", "Shopping", "Desk lamp", undefined, { approved: false, cleared: "uncleared" }],
  [-1, everyday, -12_000, "Bus and MRT top-up", "Transport", undefined, undefined, { approved: false }],
  [0, cashback, -7_600, "Toast Box", "Dining Out", undefined, undefined, { cleared: "uncleared" }],
  [0, joint, -128_640, "FairPrice Finest", "Groceries", "Weekly shop", "yellow", { cleared: "uncleared" }],
  [6, cashback, 900_000, "Card payment", null, "Scheduled ahead", undefined, { cleared: "uncleared" }],
];

const flagSeen = new Set<string>();
for (const [i, row] of rows.entries()) {
  const [off, acct, amount, payee, category, memo, flag, extra] = row;
  flagSeen.add(flag ?? "");
  await call("POST", `/v1/plans/${plan}/transactions`, {
    transaction: {
      account_id: acct,
      date: day(off),
      amount,
      payee_name: payee,
      category_id: category ? cat(category) : null,
      memo: memo ?? null,
      flag_color: flag ?? null,
      approved: true,
      cleared: "cleared",
      import_id: `audit:${i}`,
      ...(extra ?? {}),
    },
  });
}

// A split and a transfer.
await call("POST", `/v1/plans/${plan}/transactions`, {
  transaction: {
    account_id: cashback,
    date: day(-11),
    amount: -146_500,
    payee_name: "Don Don Donki",
    category_id: null,
    memo: "Groceries and a gift",
    approved: true,
    cleared: "cleared",
    import_id: "audit:split",
    subtransactions: [
      { amount: -96_500, category_id: cat("Groceries"), memo: "Snacks" },
      { amount: -50_000, category_id: cat("Shopping"), memo: "Gift" },
    ],
  },
});
await call("POST", `/v1/plans/${plan}/transactions`, {
  transaction: {
    account_id: everyday,
    date: day(-13),
    amount: -1_000_000,
    transfer_account_id: saver,
    memo: "Monthly saving",
    approved: true,
    cleared: "cleared",
    import_id: "audit:transfer",
  },
});

const schedules = [
  { account_id: everyday, date_first: day(14), frequency: "monthly", amount: -1_850_000, payee_name: "Straits View Residences", category_id: cat("Utilities"), memo: "Rent and service charge" },
  { account_id: cashback, date_first: day(3), frequency: "monthly", amount: -19_980, payee_name: "Netflix", category_id: cat("Shopping") },
  { account_id: everyday, date_first: day(9), frequency: "monthly", amount: -1_000_000, transfer_account_id: saver, memo: "Monthly saving" },
  { account_id: everyday, date_first: day(40), frequency: "yearly", amount: -386_400, payee_name: "Great Eastern Life Assurance", category_id: cat("Health"), memo: "Annual premium for the family hospital plan" },
];
for (const [i, s] of schedules.entries()) {
  const { payee_name, ...rest } = s as any;
  let payee_id: string | undefined;
  if (payee_name) {
    const payees = (await call("GET", `/v1/plans/${plan}/payees`)).data.payees as { id: string; name: string }[];
    payee_id = payees.find((p) => p.name === payee_name)?.id;
  }
  await call("POST", `/v1/plans/${plan}/scheduled_transactions`, { scheduled_transaction: { ...rest, ...(payee_id ? { payee_id } : {}) } }, { "Idempotency-Key": `audit-schedule-${i}` });
}

const rewards = await Bun.file("fixtures/rewards-tracker-export.json").json();
await call("POST", `/api/import/rewards-tracker?plan_id=${plan}`, rewards);
console.log("seeded", rows.length + 2, "transactions,", schedules.length, "schedules");
