// Phone viewport (390x844): for every page, and with the schedule editor,
// reconcile editor and compose row open, report horizontal page scroll and
// the widest elements that poke past the viewport.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
await login(page);
const report = async (label) => {
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      // Ignore content inside an element that scrolls horizontally itself.
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} right=${Math.round(r.right)}`);
    }
    return { vw, sw, out: out.slice(0, 6) };
  });
  console.log(`${label}: viewport ${result.vw} scrollWidth ${result.sw}${result.out.length ? " overflow: " + result.out.join(" | ") : ""}`);
};
for (const path of ["/transactions?range=all&accounts=acct-everyday", "/scheduled", "/spending?range=all", "/income", "/net-worth", "/age-of-money", "/rewards", "/rewards/new", "/settings", "/api-tokens", "/import/rewards", "/tools/reward-terms", "/tools/statement-formatter", "/add", "/docs"]) {
  await page.goto(WEB + path);
  await page.waitForLoadState("networkidle");
  await report(path);
}
await page.goto(WEB + "/scheduled");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Add schedule" }).click();
await report("/scheduled + editor");
await page.locator(".schedule-editor").getByRole("checkbox", { name: /Split this schedule/ }).check();
await report("/scheduled + split editor");
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Reconcile" }).click();
await report("/transactions + reconcile");
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "+ Add transaction" }).click();
await report("/transactions + compose");
await page.screenshot({ path: new URL("./phone-compose.png", import.meta.url).pathname });
await browser.close();
