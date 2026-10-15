#!/usr/bin/env python3
"""Compare medians of the key metrics across results.json files.

Usage: compare.py base.json other.json [...]
The first file is the baseline; each later column shows its median and the
change against the baseline. Medians of the per-iteration values.
"""
import json
import statistics
import sys

KEYS = [
    ("test01_ColdLaunch", "Duration (ApplicationFirstFramePresentationResponsive)", "launch to responsive"),
    ("test02_LaunchToAccountsContent", "Clock Monotonic Time", "launch to Accounts, clock"),
    ("test02_LaunchToAccountsContent", "CPU Time (howmuch)", "launch to Accounts, CPU"),
    ("test02_LaunchToAccountsContent", "Memory Peak Physical (howmuch)", "launch to Accounts, peak memory"),
    ("test03_OpenAllRegister", "Clock Monotonic Time", "open All, clock"),
    ("test03_OpenAllRegister", "CPU Time (howmuch)", "open All, CPU"),
    ("test04_OpenBusyAccountRegister", "Clock Monotonic Time", "open busy account, clock"),
    ("test04_OpenBusyAccountRegister", "CPU Time (howmuch)", "open busy account, CPU"),
    ("test05_OpenQuietAccountRegister", "Clock Monotonic Time", "open quiet account, clock"),
    ("test05_OpenQuietAccountRegister", "CPU Time (howmuch)", "open quiet account, CPU"),
    ("test06_FirstRegisterOpenAfterLaunch", "Clock Monotonic Time", "launch then open account, clock"),
    ("test06_FirstRegisterOpenAfterLaunch", "CPU Time (howmuch)", "launch then open account, CPU"),
    ("test07_ScrollAllRegister", "CPU Time (howmuch)", "three flings, CPU"),
    ("test08_ReachSixMonthsBack", "Clock Monotonic Time", "All: reach 6 months back, clock"),
    ("test08_ReachSixMonthsBack", "CPU Time (howmuch)", "All: reach 6 months back, CPU"),
    ("test08b_QuietAccountReachSixMonthsBack", "Clock Monotonic Time", "quiet: reach 6 months back, clock"),
    ("test08b_QuietAccountReachSixMonthsBack", "CPU Time (howmuch)", "quiet: reach 6 months back, CPU"),
    ("test09_LoadOlderPage", "Clock Monotonic Time", "one older page, clock"),
    ("test09_LoadOlderPage", "CPU Time (howmuch)", "one older page, CPU"),
    ("test09_LoadOlderPage", "Memory Peak Physical (howmuch)", "one older page, peak memory"),
    ("test10_OpenReflectTab", "Clock Monotonic Time", "open Reflect, clock"),
    ("test10_OpenReflectTab", "CPU Time (howmuch)", "open Reflect, CPU"),
    ("test11_OpenSpendingBreakdown", "Clock Monotonic Time", "open Spending Breakdown, clock"),
    ("test11_OpenSpendingBreakdown", "CPU Time (howmuch)", "open Spending Breakdown, CPU"),
]


def value(data, test, metric):
    entry = data["metrics"].get(test, {}).get(metric)
    if not entry or not entry.get("values"):
        return None, None
    values = entry["values"]
    median = statistics.median(values)
    if entry.get("unit") == "kB":
        median /= 1024
    return median, entry.get("unit")


def fmt(median, unit):
    if median is None:
        return "–"
    return f"{median:.0f} MB" if unit == "kB" else f"{median:.2f} s"


def main(paths):
    runs = [(p.rsplit("/", 1)[-1].removesuffix(".json"), json.load(open(p))) for p in paths]
    print("| Measure | " + " | ".join(name for name, _ in runs) + " |")
    print("|---|" + "---|" * len(runs))
    for test, metric, label in KEYS:
        base, unit = value(runs[0][1], test, metric)
        cells = []
        for index, (_, data) in enumerate(runs):
            median, unit_here = value(data, test, metric)
            cell = fmt(median, unit_here or unit)
            if index and base and median is not None:
                cell += f" ({(median - base) / base * 100:+.0f}%)"
            cells.append(cell)
        if all(c == "–" for c in cells):
            continue
        print(f"| {label} | " + " | ".join(cells) + " |")


if __name__ == "__main__":
    main(sys.argv[1:])
