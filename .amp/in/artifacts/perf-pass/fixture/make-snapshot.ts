#!/usr/bin/env bun
// Deterministic synthetic `howmuch-plan-snapshot` v1 for performance work.
//
//   bun .amp/in/artifacts/perf-pass/fixture/make-snapshot.ts [out.json]
//
// Writes perf-snapshot.json next to this script (or to the given path): the
// shape of a heavy, long-time user (~28 accounts, ~95 categories, ~700 payees,
// exactly 14,000 transactions from 2020-10-01 to 2026-10-14, ~30 schedules).
// Every name is obviously fake. A seeded PRNG and integer-only amount maths
// (no Math.exp/log/pow, whose last bit may differ between platforms) keep the
// output byte-identical across runs and machines.
//
// The file is the bare snapshot. POST it as `{"snapshot": <file>}` to
// /v1/plans/<plan>/import_snapshot (serve.sh and make-local-db.ts do).
// Before writing, the snapshot is checked with the API's own
// parsePlanSnapshot and against MAX_SNAPSHOT_BYTES for the wrapped body.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_SNAPSHOT_BYTES, SNAPSHOT_FORMAT, SNAPSHOT_VERSION, parsePlanSnapshot } from "../../../../../apps/api/src/plan-snapshot";
import { nextScheduledOccurrence } from "../../../../../apps/api/src/scheduled-transactions";

const SEED = 0x20261014;
const START = "2020-10-01";
const END = "2026-10-14"; // last transaction date ("today" is 2026-10-15)
const SCHEDULE_AFTER = "2026-10-15"; // every schedule's date_next is later than this
const TARGET_TRANSACTIONS = 14_000;
const TARGET_SPLIT_SHARE = 0.08;
const UNAPPROVED_COUNT = 40;
const UNAPPROVED_FROM = "2026-09-24"; // last three weeks
const MEMO_SHARE = 0.3;
const FLAG_SHARE = 0.05;
const out = process.argv[2] ?? join(import.meta.dir, "perf-snapshot.json");

// ---------------------------------------------------------------- PRNG ----
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}
function sfc32(seed: number): () => number {
  const init = splitmix32(seed);
  let a = init(), b = init(), c = init(), d = init();
  const next = () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 16; i++) next();
  return next;
}
const nextU32 = sfc32(SEED);
const rnd = () => nextU32() / 4294967296;
const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
/** Binomial draw with the given mean: no transcendental maths. */
function countAround(mean: number): number {
  if (mean <= 0) return 0;
  const trials = Math.ceil(mean * 2) + 4;
  const p = mean / trials;
  let n = 0;
  for (let i = 0; i < trials; i++) if (rnd() < p) n++;
  return n;
}
function uuid(): string {
  const hex = Array.from({ length: 4 }, () => nextU32().toString(16).padStart(8, "0")).join("");
  const variant = "89ab"[parseInt(hex[16]!, 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
class Picker<T> {
  private readonly cumulative: number[] = [];
  private readonly total: number;
  constructor(readonly items: readonly T[], weights: readonly number[]) {
    let sum = 0;
    for (const weight of weights) { sum += weight; this.cumulative.push(sum); }
    this.total = sum;
  }
  pick(): T {
    const x = rnd() * this.total;
    let lo = 0, hi = this.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid]! > x) hi = mid; else lo = mid + 1;
    }
    return this.items[lo]!;
  }
}

// ---------------------------------------------------------------- dates ---
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const isoDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
type Month = { y: number; m: number; first: string; last: string; days: number; index: number };
const MONTHS: Month[] = [];
for (let y = 2020, m = 10, index = 0; ymd(y, m, 1) <= END; index++) {
  MONTHS.push({ y, m, first: ymd(y, m, 1), last: ymd(y, m, daysIn(y, m)), days: daysIn(y, m), index });
  m++; if (m > 12) { m = 1; y++; }
}
/** The day-of-month date, clamped into the month, or null outside [from, to]. */
function onDay(month: Month, day: number, from = START, to = END): string | null {
  const date = ymd(month.y, month.m, Math.min(day, month.days));
  return date >= from && date <= to ? date : null;
}

// ---------------------------------------------------------------- money ---
const SKEW = [0.3, 0.45, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1.1, 1.2, 1.35, 1.5, 1.8, 2.2, 3];
/** Positive milliunits (whole cents) around a median in SGD. */
function money(medianSgd: number, factor = 1, spread = true): number {
  const x = spread ? medianSgd * factor * pick(SKEW) * (0.85 + 0.3 * rnd()) : medianSgd * factor;
  return Math.max(1, Math.round(x * 100)) * 10;
}
const between = (lowSgd: number, highSgd: number) => ri(Math.round(lowSgd * 100), Math.round(highSgd * 100)) * 10;
const sgd = (value: number) => Math.round(value * 100) * 10;

// ------------------------------------------------------------- accounts ---
type Kind = "checking" | "savings" | "cash" | "creditCard" | "lineOfCredit" | "mortgage" | "autoLoan" | "otherAsset";
type Account = {
  key: string; id: string; name: string; type: Kind; onBudget: boolean; closed: boolean;
  open: string; close: string; opening: number; rate: number; mix: string | null;
  reconciledThrough: string; bankLinked: boolean; floor: number | null; order: number;
  transferPayeeId: string;
};
const NEVER_RECONCILED = "1970-01-01";
const ACCOUNT_SPECS: Array<[key: string, name: string, type: Kind, open: string, close: string | null, openingSgd: number, rate: number, mix: string | null, reconciledThrough: string, bankLinked: boolean, floorSgd: number | null]> = [
  ["everyday", "Everyday Account", "checking", START, null, 3200, 50, "debit", "2026-08-31", true, 800],
  ["card-a", "Card A", "creditCard", START, null, 0, 40, "card", "2026-09-15", true, null],
  ["card-b", "Card B", "creditCard", START, null, 0, 30, "card", "2026-09-10", true, null],
  ["card-c", "Card C", "creditCard", "2022-03-01", null, 0, 15, "card", "2026-08-20", true, null],
  ["bills", "Bills Account", "checking", START, null, 4000, 0.5, "bills", "2026-08-31", true, 500],
  ["joint", "Joint Account", "checking", "2021-03-01", null, 1000, 4, "joint", "2026-07-31", false, 200],
  ["shared", "Shared Expenses Account", "checking", "2023-07-01", null, 300, 2, "joint", "2026-07-31", false, 100],
  ["digital", "Digital Wallet", "checking", "2022-01-10", null, 200, 4, "online", NEVER_RECONCILED, false, 0],
  ["cash", "Cash Wallet", "cash", START, null, 300, 7, "cash", "2026-06-30", false, 0],
  ["transit", "Prepaid Transit Card", "cash", "2021-02-01", null, 50, 2.5, "transit", NEVER_RECONCILED, false, 0],
  ["travel", "Travel Wallet", "cash", "2022-08-01", null, 400, 0.6, "travel", NEVER_RECONCILED, false, 0],
  ["card-d", "Card D", "creditCard", "2021-05-01", null, 0, 2, "card", "2026-06-30", false, null],
  ["card-e", "Card E", "creditCard", "2023-01-01", null, 0, 1.5, "card", "2026-06-30", false, null],
  ["card-f", "Card F", "creditCard", "2024-06-01", null, 0, 2, "card", "2026-06-30", false, null],
  ["loc", "Line of Credit A", "lineOfCredit", START, null, 0, 0.25, "card", "2026-06-30", false, null],
  ["pot-1", "Savings Pot 1", "savings", START, null, 5000, 0.3, "savings", "2026-06-30", false, 0],
  ["pot-2", "Savings Pot 2", "savings", START, null, 2000, 0, "savings", "2026-06-30", false, 0],
  ["emergency", "Emergency Fund", "savings", START, null, 15000, 0.1, "savings", "2026-06-30", false, 0],
  ["holiday", "Holiday Savings", "savings", START, null, 1500, 0.5, "holiday", "2026-06-30", false, 0],
  ["kids", "Kids Savings", "savings", "2021-01-01", null, 500, 0.4, "kids", "2026-06-30", false, 0],
  ["invest", "Investment Account A", "otherAsset", START, null, 20000, 0, null, "2026-06-30", false, null],
  ["retire", "Retirement Fund", "otherAsset", START, null, 35000, 0, null, "2026-06-30", false, null],
  ["home-loan", "Home Loan", "mortgage", START, null, -420000, 0, null, "2026-06-30", false, null],
  ["car-loan", "Car Loan", "autoLoan", "2022-01-15", null, -58000, 0, null, "2026-06-30", false, null],
  ["property", "Property Asset", "otherAsset", START, null, 650000, 0, null, "2026-06-30", false, null],
  ["old-card-g", "Old Card G", "creditCard", START, "2022-06-30", 0, 12, "card", "2022-06-30", false, null],
  ["old-savings", "Old Savings Account", "savings", START, "2023-03-31", 8000, 0.2, "savings", "2023-03-31", false, 0],
  ["old-wallet", "Old Wallet", "cash", START, "2021-12-31", 2000, 8, "cash", "2021-12-31", false, 0],
];
const ON_BUDGET: Record<Kind, boolean> = {
  checking: true, savings: true, cash: true, creditCard: true, lineOfCredit: true,
  mortgage: false, autoLoan: false, otherAsset: false,
};
const accounts: Account[] = ACCOUNT_SPECS.map(([key, name, type, open, close, openingSgd, rate, mix, reconciledThrough, bankLinked, floorSgd], order) => ({
  key, id: `acct-${key}`, name, type, onBudget: ON_BUDGET[type], closed: close !== null,
  open, close: close ?? END, opening: sgd(openingSgd), rate, mix, reconciledThrough, bankLinked,
  floor: floorSgd === null ? null : sgd(floorSgd), order, transferPayeeId: `payee-transfer-${key}`,
}));
const A = Object.fromEntries(accounts.map((account) => [account.key, account])) as Record<string, Account>;
if (new Set(accounts.map((a) => a.name)).size !== accounts.length) throw new Error("account names must be unique");

// ----------------------------------------------------------- categories ---
type Category = { key: string; id: string; name: string; groupId: string; median: number; hidden: boolean; deleted: boolean; internal: boolean };
type GroupSpec = [id: string, name: string, hidden: boolean, categories: Array<[key: string, name: string, medianSgd: number, flags?: { deleted?: boolean; hidden?: boolean }]>];
const GROUP_SPECS: GroupSpec[] = [
  ["grp-bills", "Bills", false, [["rent", "Rent / Mortgage", 2800], ["electricity", "Electricity", 120], ["water", "Water", 45], ["gas", "Gas", 30], ["mobile", "Mobile Phone", 45], ["internet", "Internet", 50], ["health-ins", "Health Insurance", 180], ["life-ins", "Life Insurance", 1450], ["conservancy", "Conservancy Fees", 88], ["property-tax", "Property Tax", 1560], ["streaming", "Streaming Services", 15.98], ["software", "Software Subscriptions", 12.99]]],
  ["grp-everyday", "Everyday", false, [["groceries", "Groceries", 85], ["dining", "Dining Out", 38], ["coffee", "Coffee & Snacks", 7.5], ["public-transport", "Public Transport", 2.4], ["taxi", "Taxi & Ride Hail", 18], ["household", "Household Supplies", 32], ["personal-care", "Personal Care", 28], ["laundry", "Laundry", 12], ["hawker", "Hawker Food", 6.5]]],
  ["grp-transport", "Car & Transport", false, [["fuel", "Fuel", 75], ["parking", "Parking", 4.5], ["tolls", "Tolls", 3], ["car-servicing", "Car Servicing", 380], ["car-insurance", "Car Insurance", 1350], ["road-tax", "Road Tax", 740], ["car-interest", "Car Loan Interest", 210], ["legacy-transport", "Legacy Transport Pass", 2.2, { deleted: true }]]],
  ["grp-health", "Health", false, [["doctor", "Doctor", 65], ["dental", "Dental", 140], ["pharmacy", "Pharmacy", 24], ["fitness", "Fitness", 35], ["optical", "Optical", 260], ["specialist", "Specialist Visits", 220]]],
  ["grp-home", "Home", false, [["furniture", "Furniture", 450], ["appliances", "Appliances", 380], ["repairs", "Repairs", 160], ["cleaning", "Cleaning Services", 90], ["garden", "Garden", 35], ["decor", "Home Decor", 60], ["kitchenware", "Kitchenware", 40]]],
  ["grp-family", "Family", false, [["childcare", "Childcare", 1100], ["school-fees", "School Fees", 1200], ["kids-activities", "Kids Activities", 95], ["pocket-money", "Pocket Money", 20], ["parents", "Parents Allowance", 500], ["pet-food", "Pet Food", 55], ["vet", "Vet", 150]]],
  ["grp-lifestyle", "Lifestyle", false, [["clothing", "Clothing", 75], ["shoes", "Shoes", 110], ["hobbies", "Hobbies", 60], ["books", "Books", 28], ["games", "Games", 45], ["music", "Music", 12], ["movies", "Movies", 25], ["events", "Events", 95], ["electronics", "Electronics", 320], ["online", "Online Shopping", 42], ["legacy-misc", "Legacy Misc", 30, { deleted: true }]]],
  ["grp-travel", "Travel", false, [["flights", "Flights", 680], ["hotels", "Hotels", 420], ["travel-ins", "Travel Insurance", 55], ["travel-spending", "Travel Spending", 60], ["visa", "Visa Fees", 80], ["airport", "Airport Transfers", 35]]],
  ["grp-giving", "Gifts & Giving", false, [["birthdays", "Birthdays", 70], ["festive", "Festive Gifts", 90], ["weddings", "Weddings", 250], ["charity", "Charity", 50], ["red-packets", "Red Packets", 120], ["thank-you", "Thank You Gifts", 45]]],
  ["grp-goals", "Savings Goals", false, [["goal-rainy", "Rainy Day Goal", 400], ["goal-holiday", "Holiday Fund", 600], ["goal-laptop", "New Laptop", 1800], ["goal-car", "Car Replacement", 2500], ["goal-home", "Home Upgrade", 900], ["goal-education", "Education Fund", 700]]],
  ["grp-work", "Work & Learning", false, [["courses", "Courses", 250], ["professional-fees", "Professional Fees", 300], ["work-equipment", "Work Equipment", 150], ["work-books", "Work Books", 35], ["conferences", "Conferences", 600]]],
  ["grp-financial", "Financial", false, [["bank-fees", "Bank Fees", 8], ["interest-charges", "Interest Charges", 25], ["taxes", "Taxes", 1800], ["investments", "Investments", 3000], ["accountant", "Accountant", 200], ["card-fees", "Annual Card Fees", 196.2], ["retirement", "Retirement Contributions", 650]]],
  ["grp-archived", "Archived", true, [["old-gym", "Old Gym Membership", 98, { hidden: true }], ["old-phone", "Old Phone Plan", 38, { hidden: true }], ["wedding-2021", "Wedding Planning 2021", 600, { hidden: true }]]],
];
const INTERNAL_GROUP = { id: "grp-internal", name: "Internal Master Category", hidden: false, internal: true, deleted: false };
const categories: Category[] = [
  { key: "inflow", id: "cat-inflow", name: "Inflow: Ready to Assign", groupId: INTERNAL_GROUP.id, median: 0, hidden: false, deleted: false, internal: true },
  { key: "uncategorized", id: "cat-uncategorized", name: "Uncategorized", groupId: INTERNAL_GROUP.id, median: 0, hidden: false, deleted: false, internal: true },
];
for (const [groupId, , groupHidden, specs] of GROUP_SPECS) {
  for (const [key, name, median, flags] of specs) {
    categories.push({ key, id: `cat-${key}`, name, groupId, median, hidden: groupHidden || !!flags?.hidden, deleted: !!flags?.deleted, internal: false });
  }
}
const C = Object.fromEntries(categories.map((category) => [category.key, category])) as Record<string, Category>;
const LEGACY_UNTIL = "2021-06-30"; // deleted categories only appear on rows up to here

// Discretionary category mixes per account style (relative weights).
const MIXES: Record<string, Record<string, number>> = {
  debit: { groceries: 18, dining: 12, coffee: 8, hawker: 10, taxi: 5, "public-transport": 3, household: 6, "personal-care": 3, laundry: 2, pharmacy: 3, doctor: 1, "pet-food": 1.5, "pocket-money": 2, "red-packets": 0.5, charity: 0.6, "bank-fees": 0.8, "kids-activities": 1.5, parking: 2, fuel: 2, repairs: 0.8, cleaning: 1.2, online: 2, clothing: 1, books: 0.5, movies: 0.7, parents: 0.4, "legacy-misc": 0.3 },
  card: { dining: 16, groceries: 10, online: 8, clothing: 4, shoes: 1.5, taxi: 6, fuel: 4, parking: 1.5, electronics: 1, hobbies: 3, books: 1.5, games: 1.5, music: 1, movies: 1.5, events: 1, flights: 0.6, hotels: 0.5, "travel-spending": 1.5, "travel-ins": 0.3, visa: 0.1, airport: 0.4, birthdays: 1.2, festive: 1, weddings: 0.3, "thank-you": 0.5, doctor: 1, dental: 0.5, pharmacy: 1.5, fitness: 1, optical: 0.2, specialist: 0.4, furniture: 0.4, appliances: 0.4, decor: 1, kitchenware: 1, garden: 0.4, courses: 0.3, "professional-fees": 0.1, "work-equipment": 0.4, "work-books": 0.4, conferences: 0.1, vet: 0.4, "pet-food": 1, "kids-activities": 1, coffee: 3, hawker: 1, household: 3, "personal-care": 2, "interest-charges": 0.3, "car-servicing": 0.2, tolls: 0.8, "legacy-misc": 0.4 },
  cash: { hawker: 30, coffee: 18, dining: 8, groceries: 10, laundry: 4, parking: 5, "red-packets": 2, "pocket-money": 4, charity: 1, "public-transport": 3, taxi: 3 },
  transit: { "public-transport": 100, "legacy-transport": 3 },
  bills: { repairs: 1, accountant: 0.5, "professional-fees": 0.5, "bank-fees": 1, parents: 1 },
  joint: { groceries: 30, household: 15, dining: 10, furniture: 3, appliances: 2, repairs: 3, cleaning: 5, "kids-activities": 5, decor: 3, kitchenware: 3, garden: 2 },
  online: { online: 30, music: 3, games: 5, books: 4, taxi: 10, dining: 10, electronics: 2, hobbies: 4 },
  travel: { "travel-spending": 40, dining: 20, taxi: 10, airport: 5, hotels: 5, coffee: 8 },
  savings: { "goal-rainy": 1, "goal-laptop": 1, "goal-car": 1, "goal-home": 3, "goal-education": 2 },
  holiday: { "goal-holiday": 3, flights: 2, hotels: 2, "travel-spending": 1 },
  kids: { "goal-education": 1, "kids-activities": 1 },
};
// Rough rows per mix over the whole range, used only to size payee pools.
const MIX_VOLUME: Record<string, number> = { debit: 3700, card: 7200, cash: 700, transit: 170, bills: 40, joint: 400, online: 220, travel: 30, savings: 60, holiday: 30, kids: 20 };
const mixPickers: Record<string, Picker<string>> = Object.fromEntries(Object.entries(MIXES).map(([name, weights]) => [name, new Picker(Object.keys(weights), Object.values(weights))]));

// ---------------------------------------------------------------- payees --
type Payee = { id: string; name: string; transferAccountId: string | null; deleted: boolean; factor: number };
const payeeName = (n: number) => `Synthetic Payee ${String(n).padStart(3, "0")}`;
const payees: Payee[] = [];
const newPayee = (n: number, deleted = false): Payee => {
  const payee = { id: `payee-${String(n).padStart(3, "0")}`, name: payeeName(n), transferAccountId: null, deleted, factor: pick([0.6, 0.75, 0.85, 1, 1, 1, 1.15, 1.3, 1.6]) };
  payees.push(payee);
  return payee;
};
// 001-026 have fixed roles (salary, utilities, interest, ...).
const ROLE = {
  employer: 1, bank: 2, power: 3, tenant: 4, water: 5, partner: 6, mortgageBank: 7, sharedContributions: 8, investPlatform: 9,
  mobile: 10, internet: 11, healthInsurer: 12, townCouncil: 13, streaming: 14, software: 15, taxAuthority: 16, carFinancier: 17,
  valuer: 18, childcare: 19, school: 20, lifeInsurer: 21, gym: 22, cardIssuer: 23, sideIncome: 24, cashback: 25, giftGiver: 26,
} as const;
const rolePayee: Record<number, Payee> = {};
for (let n = 1; n <= 26; n++) rolePayee[n] = newPayee(n);
const R = (role: keyof typeof ROLE) => rolePayee[ROLE[role]]!;

// 027-690 serve discretionary rows; pools sized by expected category volume.
const DISCRETIONARY_PAYEES = 690 - 26;
const categoryVolume = new Map<string, number>();
for (const [mix, weights] of Object.entries(MIXES)) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  for (const [key, weight] of Object.entries(weights)) categoryVolume.set(key, (categoryVolume.get(key) ?? 0) + (weight / total) * MIX_VOLUME[mix]!);
}
const volumeKeys = [...categoryVolume.keys()];
const volumeTotal = volumeKeys.reduce((sum, key) => sum + categoryVolume.get(key)!, 0);
const allocation = new Map<string, number>(volumeKeys.map((key) => [key, 1]));
let remaining = DISCRETIONARY_PAYEES - volumeKeys.length;
const exact = volumeKeys.map((key) => ({ key, share: (categoryVolume.get(key)! / volumeTotal) * remaining }));
for (const { key, share } of exact) allocation.set(key, allocation.get(key)! + Math.floor(share));
remaining = DISCRETIONARY_PAYEES - [...allocation.values()].reduce((sum, n) => sum + n, 0);
for (const { key } of [...exact].sort((a, b) => (b.share - Math.floor(b.share)) - (a.share - Math.floor(a.share)) || (a.key < b.key ? -1 : 1)).slice(0, remaining)) {
  allocation.set(key, allocation.get(key)! + 1);
}
const numbers = shuffle(Array.from({ length: DISCRETIONARY_PAYEES }, (_, i) => 27 + i));
const payeePools = new Map<string, Picker<Payee>>();
{
  let cursor = 0;
  for (const key of volumeKeys) {
    const pool = numbers.slice(cursor, cursor + allocation.get(key)!).sort((a, b) => a - b).map((n) => newPayee(n));
    cursor += pool.length;
    // Zipf-like popularity: one dominant merchant, a long tail.
    payeePools.set(key, new Picker(pool, pool.map((_, rank) => 1 / (rank + 1))));
  }
}
for (let n = 691; n <= 700; n++) newPayee(n, true); // tombstoned, unused
for (const account of accounts) {
  payees.push({ id: account.transferPayeeId, name: `Transfer : ${account.name}`, transferAccountId: account.id, deleted: false, factor: 1 });
}
payees.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// ---------------------------------------------------------------- rows ----
type Line = {
  id?: string; amount: number; memo: string | null; payee: Payee | null; category: Category | null;
  transferAccount: Account | null; counterpart: Row | null;
};
type Row = {
  id?: string; seq: number; account: Account; date: string; amount: number; payee: Payee | null; category: Category | null;
  memo: string | null; cleared: string; approved: boolean; flagColor: string | null; flagName: string | null;
  transferAccount: Account | null; counterpart: Row | Line | null;
  importId: string | null; importPayeeName: string | null; importPayeeNameOriginal: string | null;
  lines: Line[]; kind: "structural" | "discretionary" | "transfer" | "closure"; mix: string | null; refund: boolean;
};
const rows: Row[] = [];
let seq = 0;
function addRow(account: Account, date: string, amount: number, payee: Payee | null, category: Category | null, kind: Row["kind"], mix: string | null = null, refund = false): Row {
  if (date < account.open || date > account.close) throw new Error(`${account.name}: ${date} outside ${account.open}..${account.close}`);
  const row: Row = {
    seq: seq++, account, date, amount, payee, category, memo: null, cleared: "uncleared", approved: true, flagColor: null, flagName: null,
    transferAccount: null, counterpart: null, importId: null, importPayeeName: null, importPayeeNameOriginal: null, lines: [], kind, mix, refund,
  };
  rows.push(row);
  return row;
}
/** Both sides of a transfer. `category` goes on the source side only (on-budget to tracking). */
function addTransfer(from: Account, to: Account, date: string, amount: number, category: Category | null = null, kind: Row["kind"] = "transfer"): [Row, Row] {
  if (amount <= 0) throw new Error("transfer amounts are positive");
  const out = addRow(from, date, -amount, payeeById(to.transferPayeeId), category, kind);
  const into = addRow(to, date, amount, payeeById(from.transferPayeeId), null, kind);
  out.transferAccount = to; into.transferAccount = from;
  out.counterpart = into; into.counterpart = out;
  return [out, into];
}
const payeeIndex = new Map(payees.map((payee) => [payee.id, payee]));
function payeeById(id: string): Payee { const payee = payeeIndex.get(id); if (!payee) throw new Error(`no payee ${id}`); return payee; }
const activeIn = (account: Account, month: Month) => month.last >= account.open && month.first <= account.close;

// --- structural, non-transfer rows ---------------------------------------
let salary = 9600;
for (const month of MONTHS) {
  if (month.m === 1 && month.y > 2020) salary = Math.round(salary * 1.04 * 100) / 100;
  const payday = onDay(month, 25);
  if (payday) {
    const net = sgd(salary);
    const row = addRow(A.everyday, payday, net, R("employer"), C.inflow, "structural");
    if ([1, 4, 7, 10].includes(month.m)) {
      // Quarterly retirement top-up taken from the salary: a split whose second line is a transfer.
      const contribution = sgd(650);
      row.category = null;
      row.lines = [
        { amount: net + contribution, memo: null, payee: R("employer"), category: C.inflow, transferAccount: null, counterpart: null },
        { amount: -contribution, memo: null, payee: payeeById(A.retire.transferPayeeId), category: C.retirement, transferAccount: A.retire, counterpart: null },
      ];
      const into = addRow(A.retire, payday, contribution, payeeById(A.everyday.transferPayeeId), null, "transfer");
      into.transferAccount = A.everyday;
      into.counterpart = row.lines[1]!;
      row.lines[1]!.counterpart = into;
    }
  }
  if (month.m === 2 && month.y > 2020) addRow(A.everyday, onDay(month, 20)!, sgd(salary * 1.5), R("employer"), C.inflow, "structural");
  if (chance(0.3)) { const date = onDay(month, ri(1, month.days)); if (date) addRow(A.everyday, date, between(150, 900), R("sideIncome"), C.inflow, "structural"); }

  const interest: Array<[Account, number, number]> = [[A["pot-1"], 3, 10], [A["pot-2"], 1, 6], [A.emergency, 15, 40], [A.holiday, 0.5, 3], [A.kids, 0.2, 1.5], [A["old-savings"], 5, 12]];
  for (const [account, lo, hi] of interest) {
    const date = onDay(month, 31, account.open, account.close === END ? END : account.close);
    if (date && activeIn(account, month)) addRow(account, date, between(lo, hi), R("bank"), C.inflow, "structural");
  }

  const bill = (day: number, payee: Payee, category: Category, amount: number, from = START, to = END) => {
    const date = onDay(month, day, from, to);
    if (date) addRow(A.bills, date, -amount, payee, category, "structural");
  };
  const rental = onDay(month, 2); if (rental) addRow(A.bills, rental, sgd(2400), R("tenant"), C.inflow, "structural");
  bill(8, R("power"), C.electricity, between(90, 180));
  bill(8, R("power"), C.gas, between(20, 45));
  bill(10, R("water"), C.water, between(30, 60));
  bill(12, R("mobile"), month.first < "2022-01-01" ? C["old-phone"]! : C.mobile!, between(38, 58));
  bill(14, R("internet"), C.internet, sgd(49.9));
  bill(1, R("healthInsurer"), C["health-ins"]!, sgd(170 + 6 * (month.y - 2020)));
  bill(15, R("townCouncil"), C.conservancy, sgd(88));
  if (month.m === 1) bill(31, R("taxAuthority"), C["property-tax"]!, sgd(1560));
  if (month.m === 3) bill(1, R("lifeInsurer"), C["life-ins"]!, sgd(1450));
  if (month.m === 5) bill(15, R("taxAuthority"), C.taxes, between(3000, 6000));
  bill(3, R("childcare"), C.childcare, sgd(1100), "2021-01-01", "2024-12-31");
  if ([1, 5, 9].includes(month.m)) bill(6, R("school"), C["school-fees"]!, sgd(1200), "2025-01-01");

  const onCard = (account: Account, day: number, payee: Payee, category: Category, amount: number, from = account.open, to = account.close) => {
    const date = onDay(month, day, from, to);
    if (date) addRow(account, date, -amount, payee, category, "structural");
  };
  onCard(A["card-a"], 18, R("streaming"), C.streaming, sgd(month.first < "2023-01-01" ? 15.98 : 17.98));
  onCard(A["card-b"], 22, R("software"), C.software, sgd(12.99));
  onCard(A["card-b"], 1, R("gym"), C["old-gym"]!, sgd(98), START, "2023-06-30");
  if (month.m === 3) onCard(A["card-c"], 2, R("cardIssuer"), C["card-fees"]!, sgd(196.2));
  if (month.y === 2021 && month.m <= 8) onCard(A["card-a"], ri(1, 28), payeePools.get("weddings")!.pick(), C["wedding-2021"]!, money(600));

  const tracked = (account: Account, day: number, payee: Payee, amount: number) => {
    const date = onDay(month, day, account.open, account.close);
    if (date) addRow(account, date, amount, payee, null, "structural");
  };
  tracked(A["home-loan"], 28, R("mortgageBank"), -between(950, 1100));
  tracked(A["car-loan"], 16, R("carFinancier"), sgd(900));
  tracked(A.invest, 30, R("investPlatform"), between(-600, 900));
  if (month.m === 12) tracked(A.retire, 31, R("investPlatform"), between(1500, 4000));
  if (month.m === 6 && month.y > 2020) tracked(A.property, 30, R("valuer"), between(5000, 20000));

  const income = (account: Account, day: number, payee: Payee, amount: number) => {
    const date = onDay(month, day, account.open, account.close);
    if (date) addRow(account, date, amount, payee, C.inflow, "structural");
  };
  income(A.joint, 1, R("partner"), sgd(450));
  income(A.shared, 1, R("sharedContributions"), sgd(150));
  income(A.digital, 28, R("cashback"), between(2, 15));
}

// --- fixed-amount transfers -----------------------------------------------
const pot2TransferMonths = new Set<number>();
for (const month of MONTHS) {
  if (chance(0.5)) {
    const date = onDay(month, 26);
    if (date) { addTransfer(A.everyday, A["pot-2"], date, sgd(50 * ri(4, 20))); pot2TransferMonths.add(month.index); }
  }
  if ([3, 6, 9, 12].includes(month.m)) { const date = onDay(month, 20); if (date) addTransfer(A.everyday, A["home-loan"], date, sgd(6000), C.rent); }
  if ([6, 12].includes(month.m)) { const date = onDay(month, 15); if (date) addTransfer(A.everyday, A.invest, date, sgd(3000), C.investments); }
}
for (const index of shuffle(MONTHS.map((m) => m.index)).slice(0, 4)) addTransfer(A.everyday, A["pot-1"], onDay(MONTHS[index]!, 27)!, sgd(500 * ri(2, 6)));
for (const index of shuffle(MONTHS.map((m) => m.index)).slice(0, 3)) addTransfer(A.everyday, A.emergency, onDay(MONTHS[index]!, 27)!, sgd(1000 * ri(2, 5)));

// --- discretionary rows ---------------------------------------------------
function discretionary(account: Account, date: string, mixName: string): Row {
  let category = C[mixPickers[mixName]!.pick()]!;
  while (category.deleted && date > LEGACY_UNTIL) category = C[mixPickers[mixName]!.pick()]!;
  const payee = payeePools.get(category.key)!.pick();
  if (chance(0.05)) { // the same merchant, booked to another category now and then
    const other = C[mixPickers[mixName]!.pick()]!;
    if (!other.deleted) category = other;
  }
  if (mixName === "savings" || mixName === "kids" || (mixName === "holiday" && chance(0.2))) {
    if (chance(mixName === "kids" ? 0.7 : 0.45)) {
      return addRow(account, date, between(20, mixName === "kids" ? 300 : 1500), mixName === "kids" ? R("giftGiver") : R("sideIncome"), C.inflow, "discretionary", mixName);
    }
  }
  const refund = (mixName === "card" || mixName === "debit" || mixName === "online") && chance(0.015);
  const amount = refund ? Math.max(10, Math.round(money(category.median, payee.factor) / 30) * 10) : money(category.median, payee.factor);
  return addRow(account, date, refund ? amount : -amount, payee, category, "discretionary", mixName, refund);
}
function randomDate(account: Account, month: Month): string | null {
  const from = Math.max(dayNumber(month.first), dayNumber(account.open));
  const to = Math.min(dayNumber(month.last), dayNumber(account.close));
  return from > to ? null : isoDay(from + ri(0, to - from));
}
for (const account of accounts) {
  if (!account.mix || account.key === "pot-2") continue;
  for (const month of MONTHS) {
    if (!activeIn(account, month)) continue;
    const from = Math.max(dayNumber(month.first), dayNumber(account.open));
    const to = Math.min(dayNumber(month.last), dayNumber(account.close));
    let mean = account.rate * ((to - from + 1) / month.days);
    if (account.key === "travel") mean = chance(0.15) ? 3 : 0.1; // bursty: trips
    const n = countAround(mean);
    for (let i = 0; i < n; i++) discretionary(account, randomDate(account, month)!, account.mix);
  }
}
// "Savings Pot 2" is deliberately quiet: 2-4 rows in every month.
for (const month of MONTHS) {
  const present = rows.filter((row) => row.account === A["pot-2"] && row.date >= month.first && row.date <= month.last).length;
  const wanted = ri(2, 4);
  for (let i = present; i < wanted; i++) discretionary(A["pot-2"], randomDate(A["pot-2"], month)!, "savings");
}

// --- balance-dependent transfers -------------------------------------------
const sumBefore = (account: Account, date: string, inclusive = false) => rows.reduce(
  (sum, row) => (row.account === account && (inclusive ? row.date <= date : row.date < date) ? sum + row.amount : sum), account.opening);
function raiseOpeningToFloor(account: Account): void {
  if (account.floor === null) return;
  const own = rows.filter((row) => row.account === account).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
  let balance = account.opening, low = balance;
  for (const row of own) { balance += row.amount; low = Math.min(low, balance); }
  if (low < account.floor) account.opening += Math.ceil((account.floor - low) / 100_000) * 100_000; // whole S$100
}
function payCard(card: Account, months: number[], day: number, firstPayment: string): void {
  for (const month of MONTHS) {
    if (!months.includes(month.m)) continue;
    const date = onDay(month, day, firstPayment, card.close);
    if (!date) continue;
    const owed = sumBefore(card, month.first);
    if (owed < 0) addTransfer(A.everyday, card, date, -owed);
  }
}
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
payCard(A["card-a"], EVERY_MONTH, 5, "2020-11-01");
payCard(A["card-b"], EVERY_MONTH, 7, "2020-11-01");
payCard(A["card-c"], [3, 6, 9, 12], 9, "2022-06-01");
payCard(A["old-card-g"], EVERY_MONTH, 6, "2020-11-01");
for (const key of ["card-d", "card-e", "card-f"]) payCard(A[key]!, [12], 11, A[key]!.open); // low-use cards: paid off once a year
{ // Close Old Card G at zero.
  const owed = sumBefore(A["old-card-g"], A["old-card-g"].close, true);
  if (owed < 0) addTransfer(A.everyday, A["old-card-g"], A["old-card-g"].close, -owed, null, "closure");
}
for (const month of MONTHS) { // Cash Wallet top-ups, quarterly, back up to about S$450.
  if (![1, 4, 7, 10].includes(month.m)) continue;
  const date = onDay(month, 3, "2021-01-01");
  if (!date) continue;
  const short = sgd(450) - sumBefore(A.cash, date);
  if (short > 0) addTransfer(A.everyday, A.cash, date, Math.ceil(short / 50_000) * 50_000);
}
for (const [closed, into] of [[A["old-wallet"], A.everyday], [A["old-savings"], A["pot-1"]]] as const) {
  raiseOpeningToFloor(closed);
  const left = sumBefore(closed, closed.close, true);
  if (left > 0) addTransfer(closed, into, closed.close, left, null, "closure");
}

// --- exactly TARGET_TRANSACTIONS rows: grow or trim Everyday Account --------
{
  let diff = TARGET_TRANSACTIONS - rows.length;
  while (diff > 0) {
    const month = pick(MONTHS);
    discretionary(A.everyday, randomDate(A.everyday, month)!, "debit");
    diff--;
  }
  if (diff < 0) {
    const removable = shuffle(rows.filter((row) => row.account === A.everyday && row.kind === "discretionary")).slice(0, -diff);
    const drop = new Set(removable);
    for (let i = rows.length - 1; i >= 0; i--) if (drop.has(rows[i]!)) rows.splice(i, 1);
  }
}
for (const account of accounts) if (account !== A.everyday && !account.closed) raiseOpeningToFloor(account);
raiseOpeningToFloor(A.everyday);

// --- splits (~8%) -----------------------------------------------------------
{
  const already = rows.filter((row) => row.lines.length > 0).length;
  const wanted = Math.round(TARGET_TRANSACTIONS * TARGET_SPLIT_SHARE) - already;
  const eligible = shuffle(rows.filter((row) => row.kind === "discretionary" && !row.refund && row.amount <= -sgd(15)
    && ["debit", "card", "joint", "online", "cash"].includes(row.mix ?? "") && !row.category?.deleted));
  for (const row of eligible.slice(0, wanted)) {
    const count = chance(0.3) ? 3 : 2;
    const used = new Set<string>([row.category!.key]);
    const lineCategories = [row.category!];
    while (lineCategories.length < count) {
      const candidate = C[mixPickers[row.mix!]!.pick()]!;
      if (!used.has(candidate.key) && !candidate.deleted) { used.add(candidate.key); lineCategories.push(candidate); }
    }
    const total = -row.amount; // positive milliunits
    const cents = total / 10;
    const amounts: number[] = [];
    let left = cents;
    for (let i = 0; i < count - 1; i++) {
      const share = Math.max(1, Math.min(left - (count - 1 - i), Math.round(left * (0.25 + 0.5 * rnd()))));
      amounts.push(share); left -= share;
    }
    amounts.push(left);
    row.lines = lineCategories.map((category, i) => ({
      amount: -amounts[i]! * 10, memo: null, payee: chance(0.2) ? row.payee : null, category, transferAccount: null, counterpart: null,
    }));
    row.category = null;
  }
}

// --- memos, flags, approval, cleared state, import ids -----------------------
const MEMOS: Array<() => string> = [
  () => `Synthetic memo ${ri(100, 999)}`, () => "Weekly shop", () => "Shared with household", () => `Receipt ${ri(1000, 9999)}`,
  () => `Order ${ri(100000, 999999)}`, () => "Reimbursable", () => "Family dinner", () => "Monthly", () => "Gift",
  () => "Shared ride", () => "Refund expected", () => "Annual renewal", () => "Booked online", () => "Promo applied",
  () => `Trip ${ri(1, 9)}`, () => `Ref ${ri(10000, 99999)}`, () => "Bulk buy", () => "Split later", () => "Paid in advance",
  () => "Check statement",
];
const LONG_MEMO = () => `Synthetic note ${ri(10, 99)}: a longer memo that wraps across lines in the register row and the transaction detail view, kept to exercise layout.`;
const memo = () => (chance(0.06) ? LONG_MEMO() : pick(MEMOS)());
const FLAGS = new Picker(["red", "orange", "yellow", "green", "blue", "purple"], [3, 2, 2, 2, 2, 1]);
const FLAG_NAMES: Record<string, string> = { red: "Check", orange: "Follow up", yellow: "Reimburse", green: "Tax", blue: "Shared", purple: "Review" };
const end = dayNumber(END);
rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.account.order - b.account.order || a.seq - b.seq));
const importOccurrence = new Map<string, number>();
for (const row of rows) {
  if (chance(MEMO_SHARE)) row.memo = memo();
  if (chance(FLAG_SHARE)) { row.flagColor = FLAGS.pick(); if (chance(0.3)) row.flagName = FLAG_NAMES[row.flagColor]!; }
  for (const line of row.lines) if (chance(0.4)) line.memo = memo();
  if (row.date <= row.account.reconciledThrough) row.cleared = "reconciled";
  else {
    const age = end - dayNumber(row.date);
    row.cleared = chance(age <= 3 ? 0.7 : age <= 10 ? 0.3 : 0.05) ? "uncleared" : "cleared";
  }
  if (row.account.bankLinked && row.date >= "2021-03-01" && row.kind !== "transfer" && row.kind !== "closure" && row.payee && chance(0.8)) {
    const key = `${row.account.id}:${row.amount}:${row.date}`;
    const occurrence = (importOccurrence.get(key) ?? 0) + 1;
    importOccurrence.set(key, occurrence);
    row.importId = `YNAB:${row.amount}:${row.date}:${occurrence}`;
    row.importPayeeName = row.payee.name;
    row.importPayeeNameOriginal = `${row.payee.name} SG ${ri(1000, 9999)}`;
  }
}
for (const row of shuffle(rows.filter((row) => row.date >= UNAPPROVED_FROM && row.kind === "discretionary"
  && ["everyday", "card-a", "card-b", "card-c"].includes(row.account.key))).slice(0, UNAPPROVED_COUNT)) {
  row.approved = false;
  if (row.cleared === "reconciled") row.cleared = "cleared";
}

// --- ids ----------------------------------------------------------------------
for (const row of rows) {
  row.id = uuid();
  for (const line of row.lines) line.id = uuid();
}

// --- scheduled transactions ------------------------------------------------------
type ScheduleSpec = { account: Account; first: string; frequency: string; amount: number; payee: Payee; category?: Category; transferTo?: Account; memo?: string; flag?: string; lines?: Array<{ amount: number; category: Category; memo?: string }> };
const poolPayee = (key: string) => payeePools.get(key)!.items[0]!; // the category's most popular merchant
const SCHEDULES: ScheduleSpec[] = [
  { account: A.everyday, first: "2020-10-25", frequency: "monthly", amount: sgd(salary), payee: R("employer"), category: C.inflow, memo: "Salary" },
  { account: A.everyday, first: "2020-11-05", frequency: "monthly", amount: -sgd(2400), payee: payeeById(A["card-a"].transferPayeeId), transferTo: A["card-a"], memo: "Card A payment" },
  { account: A.everyday, first: "2020-11-07", frequency: "monthly", amount: -sgd(1800), payee: payeeById(A["card-b"].transferPayeeId), transferTo: A["card-b"], memo: "Card B payment" },
  { account: A.everyday, first: "2022-06-09", frequency: "every3Months", amount: -sgd(2100), payee: payeeById(A["card-c"].transferPayeeId), transferTo: A["card-c"] },
  { account: A.everyday, first: "2020-10-26", frequency: "monthly", amount: -sgd(500), payee: payeeById(A["pot-2"].transferPayeeId), transferTo: A["pot-2"] },
  { account: A.everyday, first: "2020-12-20", frequency: "every3Months", amount: -sgd(6000), payee: payeeById(A["home-loan"].transferPayeeId), transferTo: A["home-loan"], category: C.rent },
  { account: A.everyday, first: "2021-01-03", frequency: "every3Months", amount: -sgd(300), payee: payeeById(A.cash.transferPayeeId), transferTo: A.cash },
  { account: A.everyday, first: "2020-12-15", frequency: "twiceAYear", amount: -sgd(3000), payee: payeeById(A.invest.transferPayeeId), transferTo: A.invest, category: C.investments },
  { account: A.bills, first: "2020-10-02", frequency: "monthly", amount: sgd(2400), payee: R("tenant"), category: C.inflow },
  { account: A.bills, first: "2020-10-08", frequency: "monthly", amount: -sgd(125), payee: R("power"), category: C.electricity },
  { account: A.bills, first: "2020-10-10", frequency: "monthly", amount: -sgd(45), payee: R("water"), category: C.water },
  { account: A.bills, first: "2022-01-12", frequency: "monthly", amount: -sgd(45), payee: R("mobile"), category: C.mobile },
  { account: A.bills, first: "2020-10-14", frequency: "monthly", amount: -sgd(49.9), payee: R("internet"), category: C.internet },
  { account: A.bills, first: "2020-10-01", frequency: "monthly", amount: -sgd(206), payee: R("healthInsurer"), category: C["health-ins"]! },
  { account: A.bills, first: "2021-03-01", frequency: "yearly", amount: -sgd(1450), payee: R("lifeInsurer"), category: C["life-ins"]! },
  { account: A.bills, first: "2020-10-15", frequency: "monthly", amount: -sgd(88), payee: R("townCouncil"), category: C.conservancy },
  { account: A.bills, first: "2021-01-31", frequency: "yearly", amount: -sgd(1560), payee: R("taxAuthority"), category: C["property-tax"]!, flag: "red" },
  { account: A.bills, first: "2025-01-06", frequency: "every4Months", amount: -sgd(1200), payee: R("school"), category: C["school-fees"]! },
  { account: A["card-a"], first: "2023-01-18", frequency: "monthly", amount: -sgd(17.98), payee: R("streaming"), category: C.streaming },
  { account: A["card-b"], first: "2020-10-22", frequency: "monthly", amount: -sgd(12.99), payee: R("software"), category: C.software },
  { account: A["card-c"], first: "2023-03-02", frequency: "yearly", amount: -sgd(196.2), payee: R("cardIssuer"), category: C["card-fees"]! },
  { account: A["card-a"], first: "2024-02-03", frequency: "everyOtherWeek", amount: -sgd(35), payee: poolPayee("fitness"), category: C.fitness },
  { account: A["card-b"], first: "2025-05-03", frequency: "weekly", amount: -sgd(120), payee: poolPayee("groceries"), category: C.groceries, memo: "Delivery slot" },
  { account: A["card-a"], first: "2026-12-01", frequency: "never", amount: -sgd(85), payee: poolPayee("travel-ins"), category: C["travel-ins"]!, memo: "Renewal" },
  { account: A.joint, first: "2021-03-01", frequency: "monthly", amount: sgd(450), payee: R("partner"), category: C.inflow },
  { account: A.shared, first: "2023-07-01", frequency: "monthly", amount: sgd(150), payee: R("sharedContributions"), category: C.inflow },
  { account: A["pot-1"], first: "2020-10-31", frequency: "monthly", amount: sgd(6.5), payee: R("bank"), category: C.inflow },
  { account: A["pot-2"], first: "2020-10-31", frequency: "monthly", amount: sgd(3.1), payee: R("bank"), category: C.inflow },
  { account: A.emergency, first: "2020-10-31", frequency: "monthly", amount: sgd(27), payee: R("bank"), category: C.inflow },
  { account: A.joint, first: "2021-03-04", frequency: "monthly", amount: -sgd(350), payee: poolPayee("groceries"), memo: "Groceries and supplies",
    lines: [{ amount: -sgd(250), category: C.groceries }, { amount: -sgd(100), category: C.household }] },
  { account: A.everyday, first: "2022-01-01", frequency: "twiceAMonth", amount: -sgd(150), payee: poolPayee("kids-activities"),
    lines: [{ amount: -sgd(80), category: C["kids-activities"]!, memo: "Lessons" }, { amount: -sgd(40), category: C["pocket-money"]! }, { amount: -sgd(30), category: C.books }] },
  { account: A["card-c"], first: "2022-04-10", frequency: "every4Weeks", amount: -sgd(42), payee: poolPayee("online"), category: C.online, flag: "blue" },
];
function firstOccurrenceAfter(first: string, frequency: string, after: string): string {
  let next: string | null = first;
  while (next !== null && next <= after) next = nextScheduledOccurrence(first, next, frequency);
  if (next === null) throw new Error(`schedule from ${first} (${frequency}) never recurs after ${after}`);
  return next;
}
const scheduled = SCHEDULES.map((spec, index) => {
  const id = `sched-${String(index + 1).padStart(2, "0")}`;
  return {
    id,
    account_id: spec.account.id,
    date_first: spec.first,
    date_next: spec.frequency === "never" ? spec.first : firstOccurrenceAfter(spec.first, spec.frequency, SCHEDULE_AFTER),
    frequency: spec.frequency,
    amount: spec.amount,
    memo: spec.memo ?? null,
    flag_color: spec.flag ?? null,
    payee_id: spec.payee.id,
    category_id: spec.lines ? null : spec.category?.id ?? null,
    transfer_account_id: spec.transferTo?.id ?? null,
    subtransactions: (spec.lines ?? []).map((line, lineIndex) => ({
      id: `${id}-line-${lineIndex + 1}`, amount: line.amount, memo: line.memo ?? null, payee_id: null, category_id: line.category.id, transfer_account_id: null,
    })),
  };
});
for (const schedule of scheduled) {
  const total = schedule.subtransactions.reduce((sum, line) => sum + line.amount, 0);
  if (schedule.subtransactions.length && total !== schedule.amount) throw new Error(`${schedule.id}: lines total ${total}, schedule is ${schedule.amount}`);
}

// --- snapshot ----------------------------------------------------------------
function buildSnapshot(memoLimit: number) {
  const cut = (text: string | null) => (text === null ? null : text.length > memoLimit ? text.slice(0, memoLimit).trimEnd() : text);
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    exported_at: "2026-10-15T00:00:00.000Z",
    category_groups: [INTERNAL_GROUP, ...GROUP_SPECS.map(([id, name, hidden]) => ({ id, name, hidden, internal: false, deleted: false }))],
    categories: categories.map((category) => ({
      id: category.id, category_group_id: category.groupId, name: category.name, hidden: category.hidden, internal: category.internal, deleted: category.deleted,
    })),
    payees: payees.map((payee) => ({ id: payee.id, name: payee.name, transfer_account_id: payee.transferAccountId, deleted: payee.deleted })),
    accounts: accounts.map((account) => ({
      id: account.id, name: account.name, icon: null, type: account.type, on_budget: account.onBudget, closed: account.closed,
      opening_balance: account.opening, transfer_payee_id: account.transferPayeeId,
    })),
    transactions: rows.map((row) => ({
      id: row.id!,
      account_id: row.account.id,
      date: row.date,
      amount: row.amount,
      memo: cut(row.memo),
      cleared: row.cleared,
      approved: row.approved,
      flag_color: row.flagColor,
      flag_name: row.flagName,
      payee_id: row.payee?.id ?? null,
      payee_name: null,
      category_id: row.category?.id ?? null,
      transfer_account_id: row.transferAccount?.id ?? null,
      transfer_transaction_id: row.counterpart?.id ?? null,
      matched_transaction_id: null,
      import_id: row.importId,
      import_payee_name: row.importPayeeName,
      import_payee_name_original: row.importPayeeNameOriginal,
      subtransactions: row.lines.map((line) => ({
        id: line.id!,
        amount: line.amount,
        memo: cut(line.memo),
        payee_id: line.payee?.id ?? null,
        payee_name: null,
        category_id: line.category?.id ?? null,
        transfer_account_id: line.transferAccount?.id ?? null,
        transfer_transaction_id: line.counterpart?.id ?? null,
      })),
    })),
    scheduled_transactions: scheduled,
  };
}

const WRAPPER_BYTES = Buffer.byteLength('{"snapshot":}');
let memoLimit = 200;
let text = "";
for (;;) {
  text = JSON.stringify(buildSnapshot(memoLimit));
  if (Buffer.byteLength(text) + WRAPPER_BYTES <= MAX_SNAPSHOT_BYTES) break;
  if (memoLimit <= 8) throw new Error(`snapshot is ${Buffer.byteLength(text)} bytes even with ${memoLimit}-character memos`);
  memoLimit -= 8;
}
const snapshot = JSON.parse(text);
const parsed = parsePlanSnapshot(snapshot, "plan_perfbench0000"); // throws on any schema or graph violation
writeFileSync(out, text);

// --- report -------------------------------------------------------------------
const txs = snapshot.transactions as any[];
const pct = (n: number) => `${((100 * n) / txs.length).toFixed(1)}%`;
const count = (predicate: (tx: any) => boolean) => txs.filter(predicate).length;
const transferRows = count((tx) => tx.transfer_account_id !== null);
const splitLineTransfers = txs.reduce((n, tx) => n + tx.subtransactions.filter((s: any) => s.transfer_account_id).length, 0);
const lines: string[] = [];
lines.push(`wrote ${out}`);
lines.push(`bytes ${Buffer.byteLength(text)} (wrapped import body ${Buffer.byteLength(text) + WRAPPER_BYTES} of ${MAX_SNAPSHOT_BYTES} max; memo limit ${memoLimit} chars)`);
lines.push(`parsePlanSnapshot counts ${JSON.stringify(parsed.counts)}`);
lines.push(`category groups ${snapshot.category_groups.length} (1 internal, 1 hidden), categories ${snapshot.categories.length} (2 internal, ${categories.filter((c) => c.hidden).length} hidden, ${categories.filter((c) => c.deleted).length} deleted)`);
lines.push(`payees ${snapshot.payees.length}: ${payees.filter((p) => !p.transferAccountId && !p.deleted).length} live named, ${payees.filter((p) => p.deleted).length} deleted, ${payees.filter((p) => p.transferAccountId).length} transfer; payees used by transactions ${new Set(txs.map((tx) => tx.payee_id).filter((id) => id && !id.startsWith("payee-transfer-"))).size}`);
lines.push(`transactions ${txs.length} from ${txs[0].date} to ${txs[txs.length - 1].date}`);
lines.push(`  splits ${count((tx) => tx.subtransactions.length > 0)} (${pct(count((tx) => tx.subtransactions.length > 0))}; ${count((tx) => tx.subtransactions.length === 2)} two-line, ${count((tx) => tx.subtransactions.length === 3)} three-line; ${parsed.counts.subtransactions} lines, ${splitLineTransfers} of them transfers)`);
lines.push(`  transfer rows ${transferRows} (${pct(transferRows)}; ${transferRows + splitLineTransfers} transfer sides incl. split lines = ${(transferRows + splitLineTransfers) / 2} pairs)`);
lines.push(`  memos ${count((tx) => tx.memo !== null)} (${pct(count((tx) => tx.memo !== null))}), flags ${count((tx) => tx.flag_color !== null)} (${pct(count((tx) => tx.flag_color !== null))}), import ids ${count((tx) => tx.import_id !== null)}`);
lines.push(`  unapproved ${count((tx) => !tx.approved)} (dates ${txs.filter((tx) => !tx.approved).map((tx) => tx.date).sort()[0]}..${txs.filter((tx) => !tx.approved).map((tx) => tx.date).sort().at(-1)})`);
lines.push(`  cleared: reconciled ${count((tx) => tx.cleared === "reconciled")}, cleared ${count((tx) => tx.cleared === "cleared")}, uncleared ${count((tx) => tx.cleared === "uncleared")}`);
lines.push(`scheduled ${scheduled.length} (date_next ${scheduled.map((s) => s.date_next).sort()[0]}..${scheduled.map((s) => s.date_next).sort().at(-1)}; ${scheduled.filter((s) => s.subtransactions.length).length} split, ${scheduled.filter((s) => s.transfer_account_id).length} transfer)`);
lines.push("accounts (name | type | on budget | closed | transactions | balance SGD):");
for (const account of accounts) {
  const own = txs.filter((tx) => tx.account_id === account.id);
  const balance = own.reduce((sum, tx) => sum + tx.amount, account.opening);
  lines.push(`  ${account.name} | ${account.type} | ${account.onBudget ? "yes" : "no"} | ${account.closed ? "yes" : "no"} | ${own.length} | ${(balance / 1000).toFixed(2)}`);
}
const pot2Months = MONTHS.map((month) => txs.filter((tx) => tx.account_id === A["pot-2"].id && tx.date >= month.first && tx.date <= month.last).length);
lines.push(`Savings Pot 2 rows per month: min ${Math.min(...pot2Months)}, max ${Math.max(...pot2Months)} over ${MONTHS.length} months`);
console.log(lines.join("\n"));
