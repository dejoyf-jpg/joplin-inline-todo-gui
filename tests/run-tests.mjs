// Logic test suite. Runs the REAL code, not a copy:
//   - the pure functions are sliced out of src/index.ts and imported under
//     node's type stripping (node 22+: node --experimental-strip-types, or
//     plain node 23+ where stripping is on by default);
//   - src/contentScript.js is required as-is and driven with a fake
//     CodeMirror 6 state.
// Run:  node --experimental-strip-types tests/run-tests.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const indexSrc = readFileSync(join(root, 'src', 'index.ts'), 'utf8');

// ---------- Extract the pure-function region of src/index.ts ----------
const start = indexSrc.indexOf('// Turn a free-form tag string');
const end = indexSrc.indexOf('function buildDialogHtml');
assert.ok(start > -1 && end > start, 'could not locate the pure-function region in src/index.ts');
let region = indexSrc.slice(start, end);
// getSettings() needs the joplin API; everything else in the region is pure.
region = region.replace(/async function getSettings[\s\S]*?\n}\n/, '');
const extracted = join(here, '.extracted.pure.mts');
writeFileSync(
	extracted,
	region +
		'\nexport { sanitizeTag, parseTagList, esc, pad2, localISO, defaultDueISO, normalizeToken, buildTodoContent, DEFAULT_DUE_OPTIONS };\n',
);
const pure = await import(extracted);

let passed = 0;
function ok(cond, label) {
	assert.ok(cond, label);
	passed++;
}
function eq(a, b, label) {
	assert.deepEqual(a, b, `${label}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
	passed++;
}

// ---------- Guard: date handling must stay local-calendar-based ----------
// Comments are allowed to NAME the banned constructions (they explain the ban),
// so strip comments before scanning for actual uses.
const codeOnly = indexSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
ok(!codeOnly.includes('toISOString'), 'src/index.ts never calls toISOString');
ok(!/\b86400000\b|\b864e5\b/.test(codeOnly), 'src/index.ts never does millisecond day arithmetic');

// ---------- normalizeToken (the load-bearing @ guard) ----------
eq(pure.normalizeToken(''), '@TODO', 'empty keyword falls back to @TODO');
eq(pure.normalizeToken('   '), '@TODO', 'whitespace keyword falls back to @TODO');
eq(pure.normalizeToken('TODO'), '@TODO', 'bare keyword gains @');
eq(pure.normalizeToken('@Work'), '@Work', 'already-prefixed keyword unchanged');
eq(pure.normalizeToken(' fo o '), '@foo', 'inner whitespace collapsed');
eq(pure.normalizeToken(undefined), '@TODO', 'undefined keyword falls back to @TODO');

// ---------- localISO ----------
{
	const d = new Date(2026, 0, 5); // 2026-01-05 local
	eq(pure.localISO(d), '2026-01-05', 'localISO formats local calendar fields');
	const evening = new Date(2026, 11, 31, 23, 30); // 11:30 PM local, New Year's Eve
	eq(pure.localISO(evening), '2026-12-31', 'localISO late evening stays on the local date');
}

// ---------- defaultDueISO: every option ----------
{
	const todayExp = pure.localISO(new Date());
	eq(pure.defaultDueISO('none'), '', "'none' gives empty string");
	eq(pure.defaultDueISO('today'), todayExp, "'today' is the local today");
	const t = new Date(); t.setDate(t.getDate() + 1);
	eq(pure.defaultDueISO('tomorrow'), pure.localISO(t), "'tomorrow' via setDate");
	const w = new Date(); w.setDate(w.getDate() + 7);
	eq(pure.defaultDueISO('plus7'), pure.localISO(w), "'plus7' via setDate");
	const nm = pure.defaultDueISO('nextMonday');
	const parts = nm.split('-').map(Number);
	const nmDate = new Date(parts[0], parts[1] - 1, parts[2]);
	eq(nmDate.getDay(), 1, "'nextMonday' lands on a Monday");
	const diffDays = Math.round((nmDate.getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86400000);
	ok(diffDays >= 1 && diffDays <= 7, "'nextMonday' is strictly in the future, at most 7 days out");
	eq(pure.defaultDueISO('garbage'), pure.localISO(t), 'unknown option behaves like tomorrow');
}

// ---------- buildTodoContent ordering ----------
eq(
	pure.buildTodoContent({ token: '@TODO', text: 'call Scott', due: '2026-08-24', tags: ['BOB'], dateFirst: true }),
	'@TODO call Scott //2026-08-24 +BOB',
	'dateFirst puts //date before +tags',
);
eq(
	pure.buildTodoContent({ token: '@TODO', text: 'call Scott', due: '2026-08-24', tags: ['BOB'], dateFirst: false }),
	'@TODO call Scott +BOB //2026-08-24',
	'dateFirst=false puts +tags before //date',
);
eq(
	pure.buildTodoContent({ token: '@TODO', text: 'call Scott', due: '', tags: [], dateFirst: true }),
	'@TODO call Scott',
	'blank date and no tags emit only keyword and text',
);

// ---------- End-to-end: every emittable line matches calebjohn's scanner ----------
// The actual regex from plugin.calebjohn.todo v2.1.1.
const scanner = /(^\s*- \[[ Xx]\]\s.*(?<=\s)(?:(@[^\s]+)|(\/\/[^\s]+)|(\+[^\s]+))(?:[^\n]*)?$)/m;
const dates = ['', '2026-08-24'];
const tagSets = [[], ['BOB'], ['BOB', 'DealFlow']];
const keywords = ['', 'TODO', '@TODO', 'Work', '@Follow-up'];
const texts = ['call Scott about Brookfield', 'review NDA (v2)', 'task with trailing space '];
for (const kw of keywords) {
	for (const due of dates) {
		for (const tags of tagSets) {
			for (const dateFirst of [true, false]) {
				for (const text of texts) {
					const token = pure.normalizeToken(kw);
					const content = pure.buildTodoContent({ token, text, due, tags, dateFirst });
					const line = '- [ ] ' + content;
					ok(scanner.test(line), `scanner sees: ${line}`);
					// Indented (mobile whole-line grab preserves indentation).
					ok(scanner.test('  ' + line), `scanner sees indented: ${line}`);
				}
			}
		}
	}
}
// Negative control proving the @ guard is load-bearing: an UN-normalized bare
// keyword with no date and no tags produces a line the scanner cannot see.
ok(
	!scanner.test('- [ ] TODO call Scott'),
	'without normalizeToken, a dateless tagless task is invisible to the scanner',
);

// ---------- contentScript.js: grab logic, desktop and mobile ----------
const require2 = createRequire(import.meta.url);
const csModule = require2(join(root, 'src', 'contentScript.js'));
function makeEditor(docText, sel) {
	// Minimal CodeMirror 6 state fake: doc.lineAt, sliceDoc, selection.main.
	const lines = docText.split('\n');
	function lineAt(pos) {
		let off = 0;
		for (const l of lines) {
			if (pos <= off + l.length) return { from: off, to: off + l.length };
			off += l.length + 1;
		}
		const last = lines[lines.length - 1];
		return { from: off - last.length - 1, to: off - 1 };
	}
	const commands = {};
	const editorControl = {
		cm6: true,
		editor: {
			state: {
				doc: { lineAt },
				sliceDoc: (a, b) => docText.slice(a, b),
				selection: { main: sel },
			},
			dispatch() {},
			focus() {},
		},
		registerCommand(name, fn) { commands[name] = fn; },
	};
	csModule.default({}).plugin(editorControl);
	return commands;
}

// Desktop, no selection: cursor to end of line (unchanged 1.3.0 behavior).
{
	const doc = 'first line\n- call Scott about Brookfield\nlast';
	const cursor = doc.indexOf('Scott');
	const cmds = makeEditor(doc, { empty: true, head: cursor, from: cursor, to: cursor });
	const g = cmds.inlineTodoGuiGrab(false);
	eq(g.text, 'Scott about Brookfield', 'desktop grab: cursor to end of line');
	eq(g.from, cursor, 'desktop grab: from is the cursor');
	eq(doc.slice(g.from, g.to), g.text, 'desktop grab: text equals the exact range');
}
// Desktop, selection wins, wholeLine flag irrelevant.
{
	const doc = 'alpha beta gamma';
	const cmds = makeEditor(doc, { empty: false, head: 6, from: 6, to: 10 });
	eq(cmds.inlineTodoGuiGrab(true).text, 'beta', 'selection wins in whole-line mode too');
}
// Mobile whole-line: bullet stripped from text, included in the range.
{
	const doc = 'intro\n  - [ ] call Scott\noutro';
	const cursor = doc.indexOf('Scott') + 2; // anywhere in the line
	const cmds = makeEditor(doc, { empty: true, head: cursor, from: cursor, to: cursor });
	const g = cmds.inlineTodoGuiGrab(true);
	eq(g.text, 'call Scott', 'mobile grab strips existing checkbox marker');
	eq(doc.slice(g.from, g.to), '- [ ] call Scott', 'range covers the marker so it is replaced');
	// Compose the replacement the way the main plugin does and re-scan it.
	const content = pure.buildTodoContent({ token: pure.normalizeToken('TODO'), text: g.text, due: '', tags: [], dateFirst: true });
	const newDoc = doc.slice(0, g.from) + '- [ ] ' + content + doc.slice(g.to);
	const newLine = newDoc.split('\n')[1];
	eq(newLine, '  - [ ] @TODO call Scott', 'end-to-end mobile replacement, indentation preserved');
	ok(scanner.test(newLine), 'the replaced mobile line is visible to the scanner');
}
// Mobile whole-line: plain bullets and numbered lists.
{
	for (const [line, want] of [
		['- buy milk', 'buy milk'],
		['* buy milk', 'buy milk'],
		['+ buy milk', 'buy milk'],
		['3. buy milk', 'buy milk'],
		['3) buy milk', 'buy milk'],
		['buy milk', 'buy milk'],
		['- [x] done thing', 'done thing'],
	]) {
		const cursor = line.length - 1;
		const cmds = makeEditor(line, { empty: true, head: cursor, from: cursor, to: cursor });
		eq(cmds.inlineTodoGuiGrab(true).text, want, `mobile grab of ${JSON.stringify(line)}`);
	}
}
// Mobile whole-line: empty line yields empty text (the plugin then shows the hint toast).
{
	const cmds = makeEditor('', { empty: true, head: 0, from: 0, to: 0 });
	eq(cmds.inlineTodoGuiGrab(true).text, '', 'empty line grabs empty text');
}

console.log(`OK: ${passed} assertions passed.`);
