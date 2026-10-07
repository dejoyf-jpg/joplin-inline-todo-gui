// Regression driver for the ISOLATED Joplin (port 41185, CDP 9337). Same UI gestures as
// tests/richtext/e2e-joplin.mjs, plus: multi-target cases, a RELOAD check (leave the note,
// come back, read which list items show as checkboxes) and a RESAVE check (type Z, Backspace,
// compare the second save with the first).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const API = 'http://127.0.0.1:41185';
const TOKEN = readFileSync(process.env.TOKFILE, 'utf8').trim();
const api = async (method, p, body) => {
	const r = await fetch(`${API}${p}${p.includes('?') ? '&' : '?'}token=${TOKEN}`, { method, body: body ? JSON.stringify(body) : undefined });
	if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${await r.text()}`);
	return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date(); today.setDate(today.getDate() + 1);
const pad = (n) => String(n).padStart(2, '0');
const T = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const cb = (t) => `- [ ] @TODO ${t} //${T}`;
const G = '&nbsp;';
const it = (n) => Array.from({ length: n }, (_, i) => `item ${pad(i + 1)}`);
const report = '**Notes**\n\n- Program Overview\n    \n- BEAD Engineering\n    \n- BEAD Construction\n    \n- ReConnect status\n    \n- Permits\n    \n- Make-ready\n    \n- Splicing\n    \n- Turn-up\n    \n- Staffing\n    \n- Other?\n    \n- A-FD check if multiple BEAD Subgrantee Agreements';
const rep = ['Program Overview', 'BEAD Engineering', 'BEAD Construction', 'ReConnect status', 'Permits', 'Make-ready', 'Splicing', 'Turn-up', 'Staffing', 'Other?', 'A-FD check if multiple BEAD Subgrantee Agreements'];
const ten = it(10);
const ALL = [
	{ title: 'R01 bullet list of 1', body: '- only', target: 'only', gesture: 'drag', want: [cb('only')] },
	{ title: 'R02 bullet 2 first', body: '- one\n- two', target: 'one', gesture: 'drag', want: [cb('one'), G, '- two'] },
	{ title: 'R03 bullet 2 last', body: '- one\n- two', target: 'two', gesture: 'drag', want: ['- one', G, cb('two')] },
	{ title: 'R04 bullet 10 first', body: ten.map((s) => `- ${s}`).join('\n'), target: 'item 01', gesture: 'drag', want: [cb('item 01'), G, ...ten.slice(1).map((s) => `- ${s}`)] },
	{ title: 'R05 bullet 10 middle', body: ten.map((s) => `- ${s}`).join('\n'), target: 'item 05', gesture: 'drag', want: [...ten.slice(0, 4).map((s) => `- ${s}`), G, cb('item 05'), G, ...ten.slice(5).map((s) => `- ${s}`)] },
	{ title: 'R06 bullet 10 last', body: ten.map((s) => `- ${s}`).join('\n'), target: 'item 10', gesture: 'drag', want: [...ten.slice(0, 9).map((s) => `- ${s}`), G, cb('item 10')] },
	{ title: 'R07 numbered 3 first', body: '1.  one\n2.  two\n3.  three', target: 'one', gesture: 'triple', want: [cb('one'), G, '2.  two', '3.  three'] },
	{ title: 'R08 numbered 3 middle', body: '1.  one\n2.  two\n3.  three', target: 'two', gesture: 'drag', want: ['1.  one', G, cb('two'), G, '3.  three'] },
	{ title: 'R09 numbered 3 last', body: '1.  one\n2.  two\n3.  three', target: 'three', gesture: 'drag', want: ['1.  one', '2.  two', G, cb('three')] },
	{ title: 'R10 numbered start 5 middle', body: '5.  five\n6.  six\n7.  seven', target: 'six', gesture: 'drag', want: ['5.  five', G, cb('six'), G, '7.  seven'] },
	{ title: 'R11 numbered start 5 last', body: '5.  five\n6.  six\n7.  seven', target: 'seven', gesture: 'drag', want: ['5.  five', '6.  six', G, cb('seven')] },
	{ title: 'R12 existing checklist middle', body: '- [ ] one\n- [ ] two\n- [ ] three', target: 'two', gesture: 'drag', want: ['- [ ] one', cb('two'), '- [ ] three'] },
	{ title: 'R13 heading then bullets first', body: '# Head\n\n- one\n- two\n- three', target: 'one', gesture: 'drag', want: ['# Head', cb('one'), G, '- two', '- three'] },
	{ title: 'R14 bullets then paragraph last', body: '- one\n- two\n- three\n\nAfter para', target: 'three', gesture: 'drag', want: ['- one', '- two', G, cb('three'), 'After para'] },
	{ title: 'R15 bullets then numbered, first numbered', body: '- a\n- b\n\n1.  c\n2.  d', target: 'c', gesture: 'drag', want: ['- a', '- b', G, cb('c'), G, '2.  d'] },
	{ title: 'R16 numbered then bullets, last numbered', body: '1.  a\n2.  b\n\n- c\n- d', target: 'b', gesture: 'drag', want: ['1.  a', G, cb('b'), G, '- c', '- d'] },
	{ title: 'R17 bold item', body: '- one\n- Call **Bob** today\n- three', target: 'Call', gesture: 'triple', want: ['- one', G, cb('Call Bob today'), G, '- three'] },
	{ title: 'R18 link item', body: '- one\n- see [Joplin](https://joplinapp.org) now\n- three', target: 'see', gesture: 'triple', want: ['- one', G, cb('see Joplin now'), G, '- three'] },
	{ title: 'R19 code item', body: '- one\n- run `ls -la` now\n- three', target: 'run', gesture: 'triple', want: ['- one', G, cb('run ls -la now'), G, '- three'] },
	{ title: 'R20 amp and lt item', body: '- one\n- Pay A&B &lt;vendor&gt; now\n- three', target: 'Pay A&B <vendor> now', gesture: 'drag', want: ['- one', G, `- [ ] @TODO Pay A&B &lt;vendor> now //${T}`, G, '- three'], resaveMayDiffer: 'Joplin itself writes &lt;vendor> on the first save and &lt;vendor&gt; on the next; the editor shows <vendor> both times (R41 is the no-list control)' },
	{ title: 'R21 emoji item', body: '- one\n- Café 日本語 🚀 go\n- three', target: 'Café 日本語 🚀 go', gesture: 'drag', want: ['- one', G, cb('Café 日本語 🚀 go'), G, '- three'] },
	{ title: 'R22 triple first of 3', body: '- one\n- two\n- three', target: 'one', gesture: 'triple', want: [cb('one'), G, '- two', '- three'] },
	{ title: 'R23 triple middle of 3', body: '- one\n- two\n- three', target: 'two', gesture: 'triple', want: ['- one', G, cb('two'), G, '- three'] },
	{ title: 'R24 triple last of 3', body: '- one\n- two\n- three', target: 'three', gesture: 'triple', want: ['- one', '- two', G, cb('three')] },
	{ title: 'R25 partial selection in item', body: '- one\n- call Bob about the invoice\n- three', target: 'call Bob', gesture: 'drag', want: ['- one', G, `- [ ] @TODO call Bob //${T} about the invoice`, G, '- three'] },
	{ title: 'R26 two items 2 then 4 of 5', body: it(5).map((s) => `- ${s}`).join('\n'), targets: [{ text: 'item 02', gesture: 'drag' }, { text: 'item 04', gesture: 'drag' }], want: ['- item 01', G, cb('item 02'), G, '- item 03', G, cb('item 04'), G, '- item 05'] },
	{ title: 'R27 adjacent items 2 then 3 of 4', body: it(4).map((s) => `- ${s}`).join('\n'), targets: [{ text: 'item 02', gesture: 'drag' }, { text: 'item 03', gesture: 'drag' }], want: ['- item 01', G, cb('item 02'), G, cb('item 03'), G, '- item 04'] },
	{ title: 'R28 convert the task again', body: '- one\n- two\n- three', targets: [{ text: 'two', gesture: 'drag' }, { text: `@TODO two //${T}`, gesture: 'drag' }], want: ['- one', G, `- [ ] @TODO two //${T}`, G, '- three'] },
	{ title: 'R29 undo bullet middle', body: '- one\n- two\n- three', target: 'two', gesture: 'drag', undo: true, want: ['- one', '- two', '- three'] },
	{ title: 'R30 undo bullet last', body: '- one\n- two\n- three', target: 'three', gesture: 'triple', undo: true, want: ['- one', '- two', '- three'] },
	{ title: 'R31 undo numbered middle', body: '1.  one\n2.  two\n3.  three', target: 'two', gesture: 'drag', undo: true, want: ['1.  one', '2.  two', '3.  three'] },
	{ title: 'R32 nested parent (drag)', body: '- parent\n    - child\n- sibling', target: 'parent', gesture: 'drag', want: [cb('parent'), '    - [ ] child', G, '- sibling'] },
	{ title: 'R33 nested child', body: '- parent\n    - child\n- sibling', target: 'child', gesture: 'drag', want: ['- parent', `    - [ ] @TODO child //${T}`, '- sibling'] },
	{ title: 'R34 nested middle child of 3', body: '- parent\n    - c1\n    - c2\n    - c3\n- sibling', target: 'c2', gesture: 'drag', want: ['- parent', '    - c1', '    &nbsp;', `    - [ ] @TODO c2 //${T}`, '    &nbsp;', '    - c3', '- sibling'] },
	{ title: 'R35 REPORT loose 11 last', body: report, target: 'A-FD check if multiple BEAD Subgrantee Agreements', gesture: 'drag', want: ['**Notes**', ...rep.slice(0, 10).map((s) => `- ${s}`), G, cb(rep[10])] },
	{ title: 'R36 REPORT loose 11 first', body: report, target: 'Program Overview', gesture: 'drag', want: ['**Notes**', cb(rep[0]), G, ...rep.slice(1).map((s) => `- ${s}`)] },
	{ title: 'R37 REPORT loose 11 middle', body: report, target: 'Make-ready', gesture: 'drag', want: ['**Notes**', ...rep.slice(0, 5).map((s) => `- ${s}`), G, cb('Make-ready'), G, ...rep.slice(6).map((s) => `- ${s}`)] },
	{ title: 'R38 REPORT loose 11 last triple', body: report, target: 'A-FD', gesture: 'triple', want: ['**Notes**', ...rep.slice(0, 10).map((s) => `- ${s}`), G, cb(rep[10])] },
	{ title: 'R39 loose 3 last', body: '- one\n    \n- two\n    \n- three', target: 'three', gesture: 'drag', want: ['- one', '- two', G, cb('three')] },
	{ title: 'R41 amp and lt in a paragraph (control for R20)', body: 'Alpha line\nPay A&B &lt;vendor&gt; now\nCharlie line', target: 'Pay A&B <vendor> now', gesture: 'drag', want: ['Alpha line', `- [ ] @TODO Pay A&B &lt;vendor> now //${T}`, 'Charlie line'], resaveMayDiffer: 'see R20' },
	{ title: 'R42 hard line break in item, convert first line', body: '- one\n- first line  \n  second line\n- three', target: 'first line', gesture: 'drag', want: ['- one', G, cb('first line'), G, '- second line', '- three'] },
	{ title: 'R43 checklist, gap, bullets: convert first bullet', body: '- [ ] finished task\n\n&nbsp;\n\n- alpha\n- beta', target: 'alpha', gesture: 'drag', want: ['- [ ] finished task', G, cb('alpha'), G, '- beta'] },
	{ title: 'R44 checklist then numbered: convert first numbered', body: '- [ ] finished task\n\n1.  alpha\n2.  beta', target: 'alpha', gesture: 'drag', want: ['- [ ] finished task', cb('alpha'), G, '2.  beta'] },
	{ title: 'R45 loose numbered convert #2', body: '1.  one\n    \n2.  two\n    \n3.  three', target: 'two', gesture: 'drag', want: ['1.  one', G, cb('two'), G, '3.  three'] },
	{ title: 'R40 loose 3 undo', body: '- one\n    \n- two\n    \n- three', target: 'three', gesture: 'drag', undo: true, want: ['- one', '- two', '- three'] },
];
const CASES = process.env.ONLY ? ALL.filter((c) => c.title.includes(process.env.ONLY)) : ALL;
const norm = (body) => body.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l);

const browser = await chromium.connectOverCDP('http://127.0.0.1:9337');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('/index.html'));
if (!page) throw new Error('main window not found');
await page.bringToFront();
// The note list is virtualized (29 of 41 rows rendered at 1600x1000), so cases are
// grouped into folders of 7 notes (plus one scratch note each).
const stamp = Date.now();
const groups = [];
for (let i = 0; i < CASES.length; i += 7) groups.push(CASES.slice(i, i + 7));
for (const [gi, g] of groups.entries()) {
	const folder = await api('POST', '/folders', { title: `REG${gi} ${stamp}` });
	await api('POST', '/notes', { title: `R00 scratch ${gi}`, body: 'scratch note', parent_id: folder.id });
	for (const c of g) { c.folder = folder; c.scratch = `R00 scratch ${gi}`; c.note = await api('POST', '/notes', { title: c.title, body: c.body, parent_id: folder.id }); }
}
await sleep(1500);
const openNote = async (folder, title, waitText) => {
	await page.getByText(folder.title, { exact: true }).first().click(); await sleep(400);
	await page.getByText(title, { exact: true }).first().click();
	await page.waitForFunction((t) => { const ed = window.tinymce && window.tinymce.activeEditor; return ed && ed.getBody && ed.getBody().textContent.includes(t) && ed.__inlineTodoGuiRegistered === true; }, waitText, { timeout: 15000 });
	await sleep(500);
};
await openNote(CASES[0].folder, CASES[0].title, CASES[0].targets ? CASES[0].targets[0].text : CASES[0].target);
for (let k = 0; k < 3 && !(await page.locator('[title^="Convert to Inline TODO"]').count()); k++) {
	await page.locator('[title="Toggle editors"]').first().click(); await sleep(1500);
	await page.locator('[title="Toggle editors"]').first().click(); await sleep(1500);
}
if (!(await page.locator('[title^="Convert to Inline TODO"]').count())) throw new Error('plugin toolbar button never appeared');
const liState = () => page.evaluate(() => [...window.tinymce.activeEditor.getBody().querySelectorAll('li')].map((l) => (l.closest('ul.joplin-checklist') ? '[cb] ' : '[..] ') + [...l.childNodes].filter((n) => n.nodeName !== 'UL' && n.nodeName !== 'OL').map((n) => n.textContent).join('').trim().slice(0, 40)));
const selectAndConvert = async (t) => {
	let selected = '';
	for (let attempt = 0; attempt < 4 && !selected; attempt++) {
		await sleep(500);
		const box = await page.evaluate((t) => {
			const ed = window.tinymce.activeEditor; const doc = ed.getDoc();
			const f = ed.iframeElement.getBoundingClientRect();
			const w = doc.createTreeWalker(ed.getBody(), 4); let n;
			while ((n = w.nextNode())) if (n.data.includes(t)) break;
			if (!n) return null;
			const r = doc.createRange(); const i = n.data.indexOf(t); r.setStart(n, i); r.setEnd(n, i + t.length);
			const b = r.getBoundingClientRect();
			return { x0: f.left + b.left + 1, x1: f.left + b.right - 1, y: f.top + b.top + b.height / 2 };
		}, t.text);
		if (!box) throw new Error('target text node not found: ' + t.text);
		if (t.gesture === 'triple') await page.mouse.click(box.x0 + 4, box.y, { clickCount: 3 });
		else { await page.mouse.move(box.x0, box.y); await page.mouse.down(); await page.mouse.move(box.x1, box.y, { steps: 6 }); await page.mouse.up(); }
		await sleep(200);
		selected = await page.evaluate(() => window.tinymce.activeEditor.selection.getContent({ format: 'text' }).trim());
	}
	if (!selected) throw new Error('mouse selection did not take');
	await page.locator('[title^="Convert to Inline TODO"]').first().click();
	let clicked = false;
	for (let k = 0; k < 40 && !clicked; k++) {
		const btn = page.getByRole('button', { name: 'Convert', exact: true });
		if (await btn.count()) { await btn.first().click(); clicked = true; } else await sleep(250);
	}
	if (!clicked) throw new Error('Convert button never appeared');
	await sleep(700);
	return selected;
};
let fail = 0; const t0 = Date.now();
for (const c of CASES) {
	const line = [];
	try {
		const targets = c.targets || [{ text: c.target, gesture: c.gesture }];
		await openNote(c.folder, c.title, targets[0].text);
		const sels = [];
		for (const t of targets) sels.push(await selectAndConvert(t));
		if (c.undo) { await page.evaluate(() => window.tinymce.activeEditor.focus()); await page.keyboard.press('Control+Z'); }
		const want = JSON.stringify(c.want);
		let body = '';
		for (let k = 0; k < 20; k++) { await sleep(500); body = (await api('GET', `/notes/${c.note.id}?fields=body`)).body; if (JSON.stringify(norm(body)) === want) break; }
		const first = body;
		const savedOk = JSON.stringify(norm(first)) === want;
		const stateAfter = await liState();
		// RELOAD: leave the note and come back, so the editor is rebuilt from the saved Markdown.
		await openNote(c.folder, c.scratch, 'scratch note');
		const probeText = targets[0].text.split(' ').slice(0, 2).join(' ');
		await openNote(c.folder, c.title, c.undo ? probeText : '@TODO');
		const stateReload = await liState();
		const savedBoxes = norm(first).filter((l) => /^\s*- \[[ xX]\] /.test(l)).length;
		const shownBoxes = stateReload.filter((s) => s.startsWith('[cb]')).length;
		const reloadOk = savedBoxes === shownBoxes;
		// RESAVE: type Z at the end, wait for that save, Backspace, wait for the save without it.
		await page.evaluate(() => { const ed = window.tinymce.activeEditor; ed.focus(); ed.selection.select(ed.getBody(), true); ed.selection.collapse(false); });
		await page.keyboard.type('Z');
		let b2 = '';
		for (let k = 0; k < 20; k++) { await sleep(500); b2 = (await api('GET', `/notes/${c.note.id}?fields=body`)).body; if (b2.includes('Z')) break; }
		await page.keyboard.press('Backspace');
		for (let k = 0; k < 20; k++) { await sleep(500); b2 = (await api('GET', `/notes/${c.note.id}?fields=body`)).body; if (!b2.includes('Z')) break; }
		const stableLines = JSON.stringify(norm(b2)) === JSON.stringify(norm(first));
		const stableRaw = b2 === first;
		const ok = savedOk && reloadOk && (stableLines || !!c.resaveMayDiffer);
		if (!ok) fail++;
		line.push(`${ok ? 'PASS' : 'FAIL'}  ${c.title}  [saved ${savedOk ? 'ok' : 'DIFF'} | reload ${reloadOk ? 'ok' : 'CHECKBOX MISMATCH'} (${savedBoxes} saved, ${shownBoxes} shown) | resave ${stableLines ? (stableRaw ? 'identical' : 'same lines, whitespace differs') : 'CHANGED'}]`);
		if (!ok || process.env.VERBOSE) {
			line.push(`      selected: ${JSON.stringify(sels)}`);
			line.push(`      want    : ${want}`);
			line.push(`      saved 1 : ${JSON.stringify(first)}`);
			line.push(`      editor after convert: ${JSON.stringify(stateAfter)}`);
			line.push(`      editor after reload : ${JSON.stringify(stateReload)}`);
			line.push(`      saved 2 : ${JSON.stringify(b2)}`);
		}
	} catch (e) {
		fail++;
		line.push(`FAIL  ${c.title}: ${e.message.split('\n')[0]}`);
		await page.screenshot({ path: `/tmp/claude-1000/-home-frank-dejoy-homelab/2dc82a61-2797-441f-b6a6-ab719cc5830f/scratchpad/qa/fail-${c.title.slice(0, 3)}.png` }).catch(() => {});
		await page.keyboard.press('Escape').catch(() => {});
	}
	console.log(line.join('\n'));
}
console.log(`\nREG E2E: ${CASES.length - fail} passed, ${fail} failed of ${CASES.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
