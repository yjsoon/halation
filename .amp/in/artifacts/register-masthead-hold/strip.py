"""Usage: python3 -I strip.py <capture-dir> <out.jpg> <mode: open|nav> <title> <ms after first header...>
Picks the last screencast frame at or before each time, crops the header region and labels it with the header state the probe logged."""
import json, subprocess, sys
d, out, mode, title, *times = sys.argv[1:]
frames = json.load(open(f"{d}/frames.json"))
log = json.load(open(f"{d}/log.json"))
nav0 = log["navT0"] if mode == "nav" else 0
events = [(e["t"] - nav0, e["st"]) for e in log["log"]]
first = next(t for t, st in events if st != "none" and not st.startswith("plain:Everyday")) if mode == "open" else 0
tiles = []
for rel in map(int, times):
    at = first + rel
    frame = max((f for f in frames if f["t"] <= at), key=lambda f: f["t"], default=frames[0])
    state = [st for t, st in events if t <= at]
    label = f"{'+' if rel >= 0 else ''}{rel} ms  {(state[-1] if state else 'none').replace('plain:', 'plain ')}"
    tile = f"/tmp/flash/tile-{len(tiles)}.png"
    subprocess.run(["magick", f"{d}/f{frame['i']:04d}.jpg", "-crop", "1280x470+0+0", "+repage", "-resize", "50%",
                    "-gravity", "north", "-background", "#222", "-splice", "0x26", "-fill", "white", "-pointsize", "15",
                    "-annotate", "+0+4", label, tile], check=True)
    tiles.append(tile)
subprocess.run(["magick", *tiles, "+append", "-gravity", "northwest", "-background", "#111", "-splice", "0x30",
                "-fill", "white", "-pointsize", "20", "-annotate", "+10+5", title, out], check=True)
