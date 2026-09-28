// Test rig: Joplin 3.7.21's own TinyMCE build + its joplinLists plugin, in headless Chromium.
// Reproduces the plugin's Rich Text branch (old and candidate fixes) and checks the Markdown Joplin would save.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const H = path.dirname(new URL(import.meta.url).pathname);
// JOPLIN_APP: an extracted Joplin app.asar (npx @electron/asar extract resources/app.asar DIR).
const APP = process.env.JOPLIN_APP;
if (!APP) throw new Error('set JOPLIN_APP');
const METHOD = process.argv[2] || 'new';
const casesFile = process.argv[3] || path.join(H, 'cases.json');
const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('file://' + path.join(H, 'page.html'));
await page.addScriptTag({ path: path.join(APP, 'vendor/lib/tinymce/tinymce.js') });
await page.addScriptTag({ path: path.join(APP, 'gui/NoteEditor/NoteBody/TinyMCE/plugins/lists.js') });
await page.addScriptTag({ path: path.join(H, 'conv.bundle.js') });
await page.addScriptTag({ path: path.join(H, 'methods.js') });
await page.evaluate(async (TMCE) => {
	const eds = await tinymce.init({
		selector: '#ed', base_url: 'file://' + TMCE, suffix: '', plugins: 'joplinLists', valid_elements: '#p,*[*]', menubar: false, toolbar: false,
		skin: false, content_css: false, promotion: false, statusbar: false, branding: false, relative_urls: false,
	});
	window.ed = eds[0];
}, path.join(APP, 'vendor/lib/tinymce'));
// Load the shipped helper into the editor document exactly as Joplin loads plugin assets.
await page.evaluate(async (src) => {
	const s = ed.dom.create('script', { src: 'file://' + src, type: 'text/javascript' });
	await new Promise((res, rej) => { s.onload = res; s.onerror = rej; ed.getDoc().head.appendChild(s); });
	await new Promise((res) => { const t = setInterval(() => { if (ed.__inlineTodoGuiRegistered) { clearInterval(t); res(); } }, 20); });
}, process.env.HELPER || path.join(H, '..', '..', 'src', 'richTextConvert.js'));

let pass = 0, fail = 0;
for (const c of cases) {
	let r; try { r = await page.evaluate(({ c, METHOD }) => window.runCase(window.ed, c, METHOD), { c, METHOD }); } catch (e) { r = { problems: ["rig error: " + e.message.split("\n")[0]], md: "" }; }
	const ok = r.problems.length === 0;
	ok ? pass++ : fail++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
	if (!ok || process.env.VERBOSE) {
		for (const p of r.problems) console.log('      - ' + p);
		console.log('      markdown out:\n' + r.md.split('\n').map((l) => '        | ' + JSON.stringify(l)).join('\n'));
	}
}
console.log(`\n${METHOD}: ${pass} passed, ${fail} failed of ${cases.length}`);
await browser.close();
process.exit(fail ? 1 : 0);
