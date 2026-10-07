// End-to-end in an ISOLATED Joplin 3.7.21 (own HOME, own profile, port 41185, virtual display).
// Creates notes over the test instance's API, drives the real UI (mouse selection, Ctrl+Alt+T,
// the plugin dialog's Convert button), then reads back the SAVED Markdown.
import { chromium } from 'playwright';

const API = 'http://127.0.0.1:41185';
const TOKEN = 'e2etesttoken0123456789abcdef';
const api = async (method, p, body) => {
	const r = await fetch(`${API}${p}${p.includes('?') ? '&' : '?'}token=${TOKEN}`, { method, body: body ? JSON.stringify(body) : undefined });
	if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${await r.text()}`);
	return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date(); today.setDate(today.getDate() + 1);
const pad = (n) => String(n).padStart(2, '0');
const TOMORROW = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const CASES = [
	{ title: 'E2E middle of three', body: 'Alpha line\nBravo line\nCharlie line', target: 'Bravo line', gesture: 'triple', want: ['Alpha line', `- [ ] @TODO Bravo line //${TOMORROW}`, 'Charlie line'] },
	{ title: 'E2E top of three', body: 'Alpha line\nBravo line\nCharlie line', target: 'Alpha line', gesture: 'drag', want: [`- [ ] @TODO Alpha line //${TOMORROW}`, 'Bravo line', 'Charlie line'] },
	{ title: 'E2E bottom of three', body: 'Alpha line\nBravo line\nCharlie line', target: 'Charlie line', gesture: 'triple', want: ['Alpha line', 'Bravo line', `- [ ] @TODO Charlie line //${TOMORROW}`] },
	{ title: 'E2E isolated line regression', body: 'Alpha line\n\nBravo line\n\nCharlie line', target: 'Bravo line', gesture: 'drag', want: ['Alpha line', `- [ ] @TODO Bravo line //${TOMORROW}`, 'Charlie line'] },
	{ title: 'E2E special characters', body: 'Alpha line\nPay A&B 5\\*3 now\nCharlie line', target: 'Pay A&B 5*3 now', gesture: 'drag', want: ['Alpha line', `- [ ] @TODO Pay A&B 5\\*3 now //${TOMORROW}`, 'Charlie line'] },
	{ title: 'E2E bullet list middle', body: '- one\n- two\n- three', target: 'two', gesture: 'drag', want: ['- one', '&nbsp;', `- [ ] @TODO two //${TOMORROW}`, '&nbsp;', '- three'] },
	{ title: 'E2E bullet list last (2026-10-07 report)', body: '- one\n- two\n- three', target: 'three', gesture: 'drag', want: ['- one', '- two', '&nbsp;', `- [ ] @TODO three //${TOMORROW}`] },
	{ title: 'E2E undo restores', body: 'Alpha line\nBravo line\nCharlie line', target: 'Bravo line', gesture: 'triple', undo: true, want: ['Alpha line', 'Bravo line', 'Charlie line'] },
];

const browser = await chromium.connectOverCDP('http://127.0.0.1:9337');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('/index.html'));
if (!page) throw new Error('main window not found');
await page.bringToFront();

const folder = await api('POST', '/folders', { title: 'E2E ' + Date.now() });
for (const c of CASES) c.note = await api('POST', '/notes', { title: c.title, body: c.body, parent_id: folder.id });
await sleep(1500);

// A freshly started instance can show the editor toolbar without plugin buttons
// (see README); toggling the editor twice redraws it with the Convert button.
await page.getByText(folder.title, { exact: true }).first().click(); await sleep(400);
await page.getByText(CASES[0].title, { exact: true }).first().click(); await sleep(800);
for (let k = 0; k < 3 && !(await page.locator('[title^="Convert to Inline TODO"]').count()); k++) {
	await page.locator('[title="Toggle editors"]').first().click(); await sleep(1500);
	await page.locator('[title="Toggle editors"]').first().click(); await sleep(1500);
}
if (!(await page.locator('[title^="Convert to Inline TODO"]').count())) throw new Error('plugin toolbar button never appeared');
let fail = 0;
const results = [];
for (const c of CASES) {
	if (process.env.ONLY && !c.title.includes(process.env.ONLY)) continue;
	try {
		await page.getByText(folder.title, { exact: true }).first().click();
		await sleep(400);
		await page.getByText(c.title, { exact: true }).first().click();
		// Wait for the Rich Text editor to show this note and the plugin helper to register in it.
		await page.waitForFunction((t) => {
			const ed = window.tinymce && window.tinymce.activeEditor;
			return ed && ed.getBody && ed.getBody().textContent.includes(t) && ed.__inlineTodoGuiRegistered === true;
		}, c.target, { timeout: 15000 });

		let selected = '';
		for (let attempt = 0; attempt < 4 && !selected; attempt++) {
			await sleep(500);
			const box = await page.evaluate((t) => {
			const ed = window.tinymce.activeEditor; const doc = ed.getDoc();
			const f = ed.iframeElement.getBoundingClientRect();
			const w = doc.createTreeWalker(ed.getBody(), 4); let n;
			while ((n = w.nextNode())) if (n.data.includes(t)) break;
			const r = doc.createRange(); const i = n.data.indexOf(t); r.setStart(n, i); r.setEnd(n, i + t.length);
			const b = r.getBoundingClientRect();
			return { x0: f.left + b.left + 1, x1: f.left + b.right - 1, y: f.top + b.top + b.height / 2 };
		}, c.target);
			if (c.gesture === 'triple') await page.mouse.click(box.x0 + 4, box.y, { clickCount: 3 });
			else { await page.mouse.move(box.x0, box.y); await page.mouse.down(); await page.mouse.move(box.x1, box.y, { steps: 6 }); await page.mouse.up(); }
			await sleep(200);
			selected = await page.evaluate(() => window.tinymce.activeEditor.selection.getContent({ format: 'text' }).trim());
		}
		if (!selected) throw new Error('mouse selection did not take');
		await page.locator('[title^="Convert to Inline TODO"]').first().click();
		// The plugin dialog is a webview frame in the main window.
		let clicked = false;
		for (let k = 0; k < 40 && !clicked; k++) {
			const btn = page.getByRole('button', { name: 'Convert', exact: true });
			if (await btn.count()) { await btn.first().click(); clicked = true; } else await sleep(250);
		}
		if (!clicked) throw new Error('Convert button never appeared');
		await sleep(600);
		if (c.undo) {
			await page.evaluate(() => window.tinymce.activeEditor.focus());
			await page.keyboard.press('Control+Z');
		}
		// Joplin saves after a short debounce; poll the SAVED note.
		let body = '';
		const want = JSON.stringify(c.want);
		for (let k = 0; k < 20; k++) {
			await sleep(500);
			body = (await api('GET', `/notes/${c.note.id}?fields=body`)).body;
			if (JSON.stringify(body.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l)) === want) break;
		}
		const got = body.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l);
		const ok = JSON.stringify(got) === want && !/(^|\n)[ \t]+(\n|$)/.test(body);
		if (!ok) fail++;
		results.push(`${ok ? 'PASS' : 'FAIL'}  ${c.title}${ok ? '' : `\n      want ${want}\n      got  ${JSON.stringify(body)}`}`);
	} catch (e) {
		fail++;
		results.push(`FAIL  ${c.title}: ${e.message.split('\n')[0]}`);
		await page.screenshot({ path: `/tmp/e2e-fail-${CASES.indexOf(c)}.png` });
		await page.keyboard.press('Escape').catch(() => {});
	}
	console.log(results[results.length - 1]);
}
console.log(fail ? `\nE2E: ${fail} failed of ${CASES.length}` : `\nE2E: all ${CASES.length} passed`);
await browser.close().catch(() => {});
process.exit(fail ? 1 : 0);
