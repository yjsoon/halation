#!/usr/bin/env python3
"""Collect XCTest `measure` results from xcodebuild logs.

Usage:
  python3 parse-measure.py <label> <xcodebuild.log>... > results.json
  python3 parse-measure.py --table results-a.json results-b.json ...

The first form prints one JSON document: {label, metrics: {test: {metric:
{unit, values, median, mean, min, stdev}}}, failed_tests, failed_metrics}.
A test that failed keeps its samples under failed_metrics only, so no
comparison reads them as results. The second form prints a Markdown table
comparing medians across result files (first file is the baseline).
"""
import json
import re
import statistics
import sys

LINE = re.compile(
    r"Test Case '-\[(?P<cls>[\w.]+) (?P<test>\w+)\]' measured \[(?P<metric>[^\]]+)\] "
    r"average: (?P<avg>[-\d.]+), relative standard deviation: (?P<rsd>[-\d.]+)%, "
    r"values: \[(?P<values>[^\]]*)\]"
)
OUTCOME = re.compile(r"Test Case '-\[(?P<cls>[\w.]+) (?P<test>\w+)\]' (?P<outcome>passed|failed)")


def collect(label, paths):
    metrics = {}
    failed = set()
    for path in paths:
        with open(path, errors="replace") as handle:
            for line in handle:
                outcome = OUTCOME.search(line)
                if outcome and outcome.group("outcome") == "failed":
                    failed.add(outcome.group("test"))
                m = LINE.search(line)
                if not m:
                    continue
                values = [float(v) for v in m.group("values").split(",") if v.strip()]
                name = m.group("metric")
                unit = name.rsplit(",", 1)[1].strip() if "," in name else ""
                metric = name.rsplit(",", 1)[0].strip() if "," in name else name
                entry = metrics.setdefault(m.group("test"), {}).setdefault(metric, {"unit": unit, "values": []})
                entry["values"].extend(values)
    for test in metrics.values():
        for entry in test.values():
            v = entry["values"]
            entry["median"] = statistics.median(v)
            entry["mean"] = statistics.fmean(v)
            entry["min"] = min(v)
            entry["stdev"] = statistics.stdev(v) if len(v) > 1 else 0.0
    failed_metrics = {test: metrics.pop(test) for test in sorted(failed) if test in metrics}
    return {"label": label, "metrics": metrics, "failed_tests": sorted(failed), "failed_metrics": failed_metrics}


KEY_METRICS = [
    "Duration (AppLaunch)",
    "Clock Monotonic Time",
    "CPU Time",
    "Memory Peak Physical",
    "Hitch Time Ratio (Scroll_DecelerationAnimation)",
    "Hitch Time Ratio (Scroll_DraggingAnimation)",
    "Frame Rate (Scroll_DecelerationAnimation)",
]


def table(paths):
    docs = [json.load(open(p)) for p in paths]
    base = docs[0]
    header = "| Test | Metric | " + " | ".join(d["label"] for d in docs) + " | Change |"
    print(header)
    print("|" + "---|" * (len(docs) + 3))
    for test in sorted(base["metrics"]):
        for metric in KEY_METRICS:
            if metric not in base["metrics"][test]:
                continue
            cells = []
            for d in docs:
                e = d["metrics"].get(test, {}).get(metric)
                cells.append(f"{e['median']:.3f} {e['unit']} (±{e['stdev']:.3f})" if e else "–")
            first = base["metrics"][test][metric]["median"]
            last = docs[-1]["metrics"].get(test, {}).get(metric, {}).get("median")
            change = f"{(last - first) / first * 100:+.0f}%" if last is not None and first else "–"
            print(f"| {test} | {metric} | " + " | ".join(cells) + f" | {change} |")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--table":
        table(sys.argv[2:])
    else:
        json.dump(collect(sys.argv[1], sys.argv[2:]), sys.stdout, indent=1)
