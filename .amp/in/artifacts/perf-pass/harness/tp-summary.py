#!/usr/bin/env python3
"""Summarise an `xctrace export` of a Time Profiler table.

Usage:
  xcrun xctrace export --input X.trace \
    --xpath '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]' > tp.xml
  python3 tp-summary.py tp.xml [--process HowMuch] [--top 40]

Prints, for the chosen process: total sampled CPU, main-thread CPU, CPU by
binary, the hottest leaf frames (self time), and the hottest app frames by
inclusive time (each frame counted once per sample).
"""
import argparse
import collections
import re
import sys
import xml.etree.ElementTree as ET


def parse(path, process_filter):
    ids = {}  # id -> parsed value
    totals = collections.Counter()
    main_total = collections.Counter()
    by_binary_self = collections.Counter()
    by_binary_incl = collections.Counter()
    leaf_self = collections.Counter()
    leaf_self_main = collections.Counter()
    app_incl = collections.Counter()
    app_incl_main = collections.Counter()
    any_incl_main = collections.Counter()
    processes = collections.Counter()

    def resolve(el):
        ref = el.get("ref")
        if ref is not None:
            return ids.get(ref)
        return None

    def frame_value(el):
        found = resolve(el)
        if found is not None:
            return found
        binary = None
        for child in el:
            if child.tag == "binary":
                b = resolve(child)
                if b is None:
                    b = child.get("name") or "?"
                    if child.get("id"):
                        ids[child.get("id")] = b
                binary = b
        value = (el.get("name") or el.get("addr") or "?", binary or "?")
        if el.get("id"):
            ids[el.get("id")] = value
        return value

    def backtrace_value(el):
        found = resolve(el)
        if found is not None:
            return found
        frames = tuple(frame_value(child) for child in el if child.tag == "frame")
        if el.get("id"):
            ids[el.get("id")] = frames
        return frames

    def simple_value(el):
        found = resolve(el)
        if found is not None:
            return found
        value = (el.get("fmt") or el.text or "", el.text or "")
        if el.get("id"):
            ids[el.get("id")] = value
        # Children (e.g. process inside thread) may define ids too.
        for child in el:
            if child.get("id") and child.get("id") not in ids:
                ids[child.get("id")] = (child.get("fmt") or child.text or "", child.text or "")
        return value

    context = ET.iterparse(path, events=("end",))
    for event, el in context:
        if el.tag != "row":
            continue
        thread = process = weight = None
        frames = ()
        for child in el:
            tag = child.tag
            if tag == "thread":
                thread = simple_value(child)
                for sub in child:
                    if sub.tag == "process":
                        process = simple_value(sub)
            elif tag == "process":
                process = simple_value(child)
            elif tag == "weight":
                weight = simple_value(child)
            elif tag in ("backtrace", "tagged-backtrace"):
                bt = child
                if tag == "tagged-backtrace":
                    for sub in child:
                        if sub.tag == "backtrace":
                            bt = sub
                frames = backtrace_value(bt)
        el.clear()
        thread_fmt = thread[0] if thread else ""
        process_fmt = process[0] if process else thread_fmt
        m = re.search(r"\(([^,()]+), pid", thread_fmt)
        processes[m.group(1) if m else process_fmt.split(" (")[0]] += 1
        if process_filter and process_filter not in process_fmt and process_filter not in thread_fmt:
            continue
        ms = 1.0
        if weight:
            m = re.match(r"([\d.]+)\s*(ms|µs|us|s)", weight[0])
            if m:
                ms = float(m.group(1)) * {"ms": 1.0, "µs": 0.001, "us": 0.001, "s": 1000.0}[m.group(2)]
            else:
                try:
                    ms = int(weight[1]) / 1e6
                except ValueError:
                    pass
        is_main = "Main Thread" in thread_fmt
        totals["all"] += ms
        if is_main:
            main_total["main"] += ms
        if frames:
            leaf = frames[0]
            leaf_self[leaf] += ms
            by_binary_self[leaf[1]] += ms
            if is_main:
                leaf_self_main[leaf] += ms
            seen_bin = set()
            seen_app = set()
            seen_main_any = set()
            for name, binary in frames:
                if binary not in seen_bin:
                    seen_bin.add(binary)
                    by_binary_incl[binary] += ms
                if binary == "HowMuch" and name not in seen_app:
                    seen_app.add(name)
                    app_incl[name] += ms
                    if is_main:
                        app_incl_main[name] += ms
                if is_main and name not in seen_main_any:
                    seen_main_any.add(name)
                    any_incl_main[name] += ms
    return dict(
        totals=totals, main_total=main_total, by_binary_self=by_binary_self,
        by_binary_incl=by_binary_incl, leaf_self=leaf_self, leaf_self_main=leaf_self_main,
        app_incl=app_incl, app_incl_main=app_incl_main, any_incl_main=any_incl_main,
        processes=processes,
    )


def short(name, width=150):
    name = re.sub(r"\s+", " ", name)
    return name if len(name) <= width else name[: width - 1] + "…"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xml")
    ap.add_argument("--process", default="HowMuch")
    ap.add_argument("--top", type=int, default=40)
    args = ap.parse_args()
    r = parse(args.xml, args.process)
    total = r["totals"]["all"]
    main_ms = r["main_total"]["main"]
    print(f"process filter: {args.process!r}")
    print(f"samples by process (all, top 8): {r['processes'].most_common(8)}")
    print(f"total CPU sampled: {total:.0f} ms; main thread: {main_ms:.0f} ms")
    print("\n== CPU by binary (self) ==")
    for (b, ms) in r["by_binary_self"].most_common(15):
        print(f"{ms:9.0f} ms  {ms / max(total, 1) * 100:5.1f}%  {b}")
    print("\n== CPU by binary (inclusive) ==")
    for (b, ms) in r["by_binary_incl"].most_common(15):
        print(f"{ms:9.0f} ms  {ms / max(total, 1) * 100:5.1f}%  {b}")
    print(f"\n== Hottest leaf frames, all threads (top {args.top}) ==")
    for ((name, b), ms) in r["leaf_self"].most_common(args.top):
        print(f"{ms:9.0f} ms  [{b}] {short(name)}")
    print(f"\n== Hottest leaf frames, main thread (top {args.top}) ==")
    for ((name, b), ms) in r["leaf_self_main"].most_common(args.top):
        print(f"{ms:9.0f} ms  [{b}] {short(name)}")
    print(f"\n== App (HowMuch binary) frames by inclusive time, all threads (top {args.top * 2}) ==")
    for (name, ms) in r["app_incl"].most_common(args.top * 2):
        print(f"{ms:9.0f} ms  {short(name)}")
    print(f"\n== App frames by inclusive time, main thread (top {args.top * 2}) ==")
    for (name, ms) in r["app_incl_main"].most_common(args.top * 2):
        print(f"{ms:9.0f} ms  {short(name)}")
    print(f"\n== Any frame by inclusive time, main thread (top {args.top * 2}) ==")
    for (name, ms) in r["any_incl_main"].most_common(args.top * 2):
        print(f"{ms:9.0f} ms  {short(name)}")


if __name__ == "__main__":
    sys.exit(main())
