// Real mouse selections in the editor iframe, then the shipped command.
import { chromium } from 'playwright'; import path from 'path';
const H = path.dirname(new URL(import.meta.url).pathname); const APP = process.env.JOPLIN_APP; if (!APP) throw new Error('set JOPLIN_APP');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
await p.goto('file://'+path.join(H,'page.html'));
for (const f of [path.join(APP,'vendor/lib/tinymce/tinymce.js'), path.join(APP,'gui/NoteEditor/NoteBody/TinyMCE/plugins/lists.js'), path.join(H,'conv.bundle.js')]) await p.addScriptTag({path:f});
await p.evaluate(async (T)=>{ const e=await tinymce.init({selector:'#ed',base_url:'file://'+T,suffix:'',plugins:'joplinLists',valid_elements:'#p,*[*]',menubar:false,toolbar:false,content_css:false,height:700}); window.ed=e[0];}, path.join(APP,'vendor/lib/tinymce'));
await p.evaluate(async (src)=>{ const s=ed.dom.create('script',{src:'file://'+src}); await new Promise(r=>{s.onload=r; ed.getDoc().head.appendChild(s);}); await new Promise(r=>{const t=setInterval(()=>{if(ed.__inlineTodoGuiRegistered){clearInterval(t);r();}},20);}); }, process.env.HELPER || path.join(H,'..','..','src','richTextConvert.js'));
const md = 'Alpha line\nBravo line\nCharlie line\n';
const want = { 'Alpha line': ['- [ ] @TODO Alpha line //2026-09-29','Bravo line','Charlie line'], 'Bravo line': ['Alpha line','- [ ] @TODO Bravo line //2026-09-29','Charlie line'], 'Charlie line': ['Alpha line','Bravo line','- [ ] @TODO Charlie line //2026-09-29'] };
let fail = 0;
for (const how of ['triple-click', 'drag', 'double-click then shift+end', 'click then shift+down']) for (const t of Object.keys(want)) {
  await p.evaluate((md)=>{ ed.setContent(mdToHtml(md)); ed.focus(); }, md);
  const box = await p.evaluate((t)=>{ const f=document.querySelector('#ed_ifr').getBoundingClientRect(); const doc=ed.getDoc(); const w=doc.createTreeWalker(ed.getBody(),4); let n; while((n=w.nextNode())) if(n.data.includes(t)) break; const r=doc.createRange(); const i=n.data.indexOf(t); r.setStart(n,i); r.setEnd(n,i+t.length); const b=r.getBoundingClientRect(); return {x0:f.left+b.left+1,x1:f.left+b.right-1,y:f.top+b.top+b.height/2}; }, t);
  if (how === 'triple-click') await p.mouse.click(box.x0 + 5, box.y, { clickCount: 3 });
  else if (how === 'drag') { await p.mouse.move(box.x0, box.y); await p.mouse.down(); await p.mouse.move(box.x1, box.y, { steps: 5 }); await p.mouse.up(); }
  else if (how.startsWith('double')) { await p.mouse.click(box.x0 + 1, box.y); await p.keyboard.press('Home'); await p.keyboard.press('Shift+End'); }
  else { await p.mouse.click(box.x0 + 1, box.y); await p.keyboard.press('Home'); await p.keyboard.press('Shift+ArrowDown'); }
  const r = await p.evaluate(()=>{ const sel = ed.selection.getContent({format:'text'}).trim(); const content='@TODO '+sel+' //2026-09-29'; ed.execCommand('mceInsertInlineTodoLine', false, content); return { sel, md: htmlToMd(ed.getContent()) }; });
  const got = r.md.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l);
  // shift+down selects into the next line; only the first line's text is the task in that gesture
  const expectLines = how.startsWith('click then') ? null : want[t];
  const ok = r.sel !== '' && (expectLines ? JSON.stringify(got) === JSON.stringify(expectLines) : got.filter(l=>l.startsWith('- [ ]')).length === 1 && got.length === 3);
  if (!ok) fail++;
  console.log(`${ok?'PASS':'FAIL'}  ${how.padEnd(28)} ${t.padEnd(13)} selected=${JSON.stringify(r.sel)} -> ${JSON.stringify(got)}`);
}
console.log(fail ? `${fail} failed` : 'all passed'); await b.close(); process.exit(fail?1:0);
