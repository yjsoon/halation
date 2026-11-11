// Usage: node capture.mjs <cdp-browser-ws> <out-dir> <scenario: open|nav|navback> <url> [latencyMs]
// Records every animation frame's header state and screencast frames under a throttled network.
import fs from "node:fs";
const [ws, out, scenario, url, latency = "562"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const sock = new WebSocket(ws);
let id = 0; const pending = new Map(); const listeners = [];
sock.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
  else listeners.forEach((l) => l(msg));
};
await new Promise((r) => (sock.onopen = r));
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); sock.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetInfos } = await send("Target.getTargets");
const page = targetInfos.find((t) => t.type === "page" && t.url.startsWith("http"));
const { sessionId: s } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const S = (m, p) => send(m, p, s);
await S("Page.enable"); await S("Network.enable"); await S("Runtime.enable");
const probe = `(() => { if (window.__hlog) return; window.__hlog = []; let last = "";
  const tick = () => { const m = document.querySelector('.register-masthead'); const p = document.querySelector('.report-header.register-header');
    const st = m ? (m.hasAttribute('data-pending') ? 'held' : 'masthead') : p ? 'plain:' + (p.querySelector('h1')?.textContent ?? '') : 'none';
    const h = document.querySelector('.filter-stack, .filter-rail')?.getBoundingClientRect().top ?? 0; const k = st + '|' + Math.round(h);
    if (k !== last) { last = k; window.__hlog.push({ t: Math.round(performance.now()), st, h: Math.round(h), title: (m||p)?.querySelector('h1')?.getBoundingClientRect().top|0, rows: document.querySelectorAll('tbody tr').length, g: m ? ['.register-masthead-sky','.register-masthead-ground','.rw-headline','.rw-basis','.rw-amount','.rw-action'].map(q => { const r = m.querySelector(q)?.getBoundingClientRect(); return r ? Math.round(r.top*100)/100 + '+' + Math.round(r.height*100)/100 : '-'; }).join(' ') : '' }); }
    requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`;
await S("Page.addScriptToEvaluateOnNewDocument", { source: probe });
const lat = Number(latency);
const frames = [];
listeners.push((msg) => { if (msg.method === "Page.screencastFrame" && msg.sessionId === s) {
  frames.push({ ts: msg.params.metadata.timestamp, data: msg.params.data });
  S("Page.screencastFrameAck", { sessionId: msg.params.sessionId }).catch(() => {}); } });
if (scenario === "open") {
  await S("Page.navigate", { url: "about:blank" }); await new Promise((r) => setTimeout(r, 500));
}
await S("Network.emulateNetworkConditions", { offline: false, latency: lat, downloadThroughput: lat ? 1500 * 1024 : -1, uploadThroughput: lat ? 750 * 1024 : -1 });
await S("Network.setCacheDisabled", { cacheDisabled: false });
await S("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1, maxWidth: 1280, maxHeight: 900 });
const t0 = Date.now() / 1000;
if (scenario === "open") await S("Page.navigate", { url });
else {
  await S("Runtime.evaluate", { expression: probe });
  await S("Runtime.evaluate", { expression: `window.__hlog.length = 0; window.__t0 = performance.now(); document.querySelector('a[href*="${url}"]').click()` });
}
await new Promise((r) => setTimeout(r, Number(process.env.WAIT ?? 9000)));
await S("Page.stopScreencast");
const { result } = await S("Runtime.evaluate", { expression: `JSON.stringify({ t0: window.__t0 ?? 0, log: window.__hlog })`, returnByValue: true });
await S("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const { t0: navT0, log } = JSON.parse(result.value);
frames.forEach((f, i) => fs.writeFileSync(`${out}/f${String(i).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64")));
fs.writeFileSync(`${out}/frames.json`, JSON.stringify(frames.map((f, i) => ({ i, t: Math.round((f.ts - t0) * 1000) }))));
fs.writeFileSync(`${out}/log.json`, JSON.stringify({ navT0, log }, null, 1));
console.log(JSON.stringify({ frames: frames.length, navT0, log }));
sock.close(); process.exit(0);
