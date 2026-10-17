import { chromium } from 'playwright';
import fs from 'fs';
const WEB='http://127.0.0.1:45045';
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor:2, reducedMotion:'reduce' });
await p.request.post(WEB+'/api/auth/login',{data:{username:'verifier',password:'howmuch-verify-15'}});
const r = await p.request.post(WEB+'/api/import/rewards-tracker',{headers:{authorization:'Bearer howmuch-verify-bootstrap'},data:{plan_id:'local-plan',payload:JSON.parse(fs.readFileSync('.amp/in/artifacts/rewards-stacked/fixture-longflag.json','utf8'))}});
console.log('import', r.status());
const results=[];
for (const w of [721, 860, 999, 1000, 1280]) {
  await p.setViewportSize({width:w,height:900});
  await p.goto(WEB+'/rewards?to=2026-05-24'); await p.waitForSelector('.rw-card');
  await p.evaluate(()=>{const k='howmuch:rewards:local-plan';const v=JSON.parse(localStorage.getItem(k)||'{}');v.layout='stacked';localStorage.setItem(k,JSON.stringify(v));});
  await p.reload(); await p.waitForSelector('.rw-card'); await p.waitForTimeout(300);
  const card = p.locator('.rw-card', { hasText: 'Online shopping and streaming subscriptions' });
  const res = await card.evaluate(c=>{
    const box=e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom}};
    const sum=box(c.querySelector('.rw-more summary'));
    const texts=[...c.querySelectorAll('.rw-basis, .rw-exceptions li, .rw-headline')].map(e=>({cls:e.className||e.tagName,text:e.textContent,b:box(e)}));
    const over=texts.filter(t=>!(t.b.r<=sum.l||t.b.l>=sum.r||t.b.b<=sum.t||t.b.t>=sum.b)).map(t=>t.text);
    const range=document.createRange();
    // check text glyph extents, not just boxes, for the exception lines
    const glyph=[...c.querySelectorAll('.rw-exceptions li, .rw-basis')].map(e=>{range.selectNodeContents(e);return [...range.getClientRects()].some(r=>!(r.right<=sum.l||r.left>=sum.r||r.bottom<=sum.t||r.top>=sum.b))});
    const onBand = getComputedStyle(c.querySelector('.rw-more summary')).position==='absolute';
    return {onBand, overlapsBox:over, glyphOverlap:glyph.some(Boolean)};
  });
  results.push({width:w, ...res});
  await card.screenshot({path:`.amp/in/artifacts/rewards-stacked/longflag-${w}.png`});
}
console.log(JSON.stringify(results,null,1));
fs.writeFileSync('.amp/in/artifacts/rewards-stacked/longflag-overlap.json', JSON.stringify(results,null,1));
await b.close();
