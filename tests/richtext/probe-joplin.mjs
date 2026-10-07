// Measures how the REAL isolated Joplin renders and re-saves list Markdown in the Rich Text editor.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const API = 'http://127.0.0.1:41185';
const TOKEN = readFileSync(process.env.TOKFILE, 'utf8').trim();
const api = async (m, p, b) => { const r = await fetch(`${API}${p}${p.includes('?') ? '&' : '?'}token=${TOKEN}`, { method: m, body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(`${m} ${p}: ${r.status}`); return r.json(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CASES = JSON.parse(readFileSync(process.env.CASES, 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9337');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('/index.html'));
await page.bringToFront();
const folder = await api('POST', '/folders', { title: 'PROBE ' + Date.now() });
for (const c of CASES) c.note = await api('POST', '/notes', { title: c.title, body: c.body, parent_id: folder.id });
await sleep(1500);
for (const c of CASES) {
	await page.getByText(folder.title, { exact: true }).first().click(); await sleep(400);
	await page.getByText(c.title, { exact: true }).first().click();
	await page.waitForFunction((t) => { const ed = window.tinymce && window.tinymce.activeEditor; return ed && ed.getBody && ed.getBody().textContent.includes(t); }, c.probe, { timeout: 15000 });
	await sleep(500);
	const view = await page.evaluate(() => {
		const b = window.tinymce.activeEditor.getBody();
		const li = [...b.querySelectorAll('li')].map((l) => (l.closest('ul.joplin-checklist') ? '[cb] ' : '[..] ') + l.textContent.trim().slice(0, 30));
		return { li, html: b.innerHTML.slice(0, 600) };
	});
	// Force a save round trip: type a marker at the very end of the note.
	await page.evaluate(() => { const ed = window.tinymce.activeEditor; ed.focus(); ed.selection.select(ed.getBody(), true); ed.selection.collapse(false); });
	await page.keyboard.type('Z');
	let body = '';
	for (let k = 0; k < 20; k++) { await sleep(500); body = (await api('GET', `/notes/${c.note.id}?fields=body`)).body; if (body.includes('Z')) break; }
	console.log(`=== ${c.title}\n  body in : ${JSON.stringify(c.body)}\n  editor  : ${JSON.stringify(view.li)}\n  resaved : ${JSON.stringify(body)}`);
	if (process.env.HTML) console.log('  html    : ' + view.html);
}
await browser.close().catch(() => {});
