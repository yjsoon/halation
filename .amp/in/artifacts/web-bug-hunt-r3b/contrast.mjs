// Scans every visible text node's colour against its composited background in
// each look and mode. Prints elements under WCAG AA (4.5, or 3 for large text).
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
const looks = (process.env.LOOKS ?? "dusk-ridge,ridge-charcoal,overexposed").split(",");
const modes = (process.env.MODES ?? "light,dark").split(",");
const paths = (process.env.PATHS ?? "/transactions?range=all&accounts=all,/spending,/income,/net-worth,/age-of-money,/rewards,/scheduled,/settings,/api-tokens,/import/rewards").split(",");
for (const look of looks) for (const mode of modes) {
  await page.evaluate(([look, mode]) => localStorage.setItem("howmuch.theme.v1", JSON.stringify({ look, mode })), [look, mode]);
  for (const path of paths) {
    await page.goto(WEB + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
    const bad = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
      const bgOf = (el) => { const layers = []; let hasImage = false; for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("repeating-linear") && !cs.backgroundImage.startsWith("url(\"data:image/svg")) hasImage = true; const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let out = { r: 255, g: 255, b: 255, a: 1 }; for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out); return { bg: out, hasImage }; };
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("").trim();
        if (!text) continue;
        const rect = el.getBoundingClientRect(); if (!rect.width || !rect.height) continue;
        const cs = getComputedStyle(el); if (cs.visibility === "hidden") continue;
        if (el.closest(".sr-only")) continue;
        let opacity = 1; for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
        if (opacity === 0) continue;
        const fg = parse(cs.color); const { bg, hasImage } = bgOf(el);
        const f = blend({ ...fg, a: fg.a * opacity }, bg);
        const l1 = lum(f), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        const disabled = el.closest(":disabled, [aria-disabled=true]") !== null;
        if (ratio < (large ? 3 : 4.5)) out.push({ text: text.slice(0, 40), cls: el.className?.toString().slice(0, 60), tag: el.tagName, ratio: +ratio.toFixed(2), color: cs.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`, hasImage, opacity: +opacity.toFixed(2), disabled });
      }
      return out;
    });
    for (const b of bad) console.log(look, mode, path, JSON.stringify(b));
  }
}
await browser.close();
