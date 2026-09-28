// In-page helpers. Methods mirror the plugin's Rich Text branch.
(function () {
	const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	window.escHtml = esc;

	// Find `text` (occurrence n) across the editor body's text nodes and return a DOM Range.
	function findRange(ed, text, occurrence) {
		const body = ed.getBody();
		const w = ed.getDoc().createTreeWalker(body, NodeFilter.SHOW_TEXT);
		const nodes = []; let flat = '';
		for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push({ n, at: flat.length }); flat += n.data; }
		let idx = -1;
		for (let k = 0; k <= (occurrence || 0); k++) idx = flat.indexOf(text, idx + 1);
		if (idx < 0) throw new Error('target not found: ' + text);
		const pos = (p, isEnd) => {
			for (let i = 0; i < nodes.length; i++) {
				const { n, at } = nodes[i];
				if (p >= at && (p < at + n.data.length || (isEnd && p === at + n.data.length))) return [n, p - at];
			}
			const last = nodes[nodes.length - 1]; return [last.n, last.n.data.length];
		};
		const r = ed.getDoc().createRange();
		const [sn, so] = pos(idx, false); const [en, eo] = pos(idx + text.length, true);
		r.setStart(sn, so); r.setEnd(en, eo);
		return r;
	}

	function select(ed, t) {
		const r = findRange(ed, t.text, t.occurrence);
		if (t.mode === 'withBr') {
			// What a triple-click / shift+down selection does: runs through the line break.
			let n = r.endContainer;
			while (n && !n.nextSibling && n.parentNode !== ed.getBody()) n = n.parentNode;
			if (n && n.nextSibling && n.nextSibling.nodeName === 'BR') r.setEndAfter(n.nextSibling);
		}
		if (t.mode === 'fromLineStart') {
			// Selection anchored before the line's first inline (e.g. before a <strong>).
			let n = r.startContainer;
			while (n.parentNode && !ed.dom.isBlock(n.parentNode) && n.parentNode !== ed.getBody()) n = n.parentNode;
			r.setStartBefore(n);
		}
		ed.selection.setRng(r);
	}

	const METHODS = {
		// Shipped 1.4.2: replaceSelection(content) then InsertJoplinChecklist.
		old(ed, content) {
			ed.selection.setContent(content);
			ed.execCommand('InsertJoplinChecklist', false, null, {});
		},
		// Shipped 1.4.3: the command registered by src/richTextConvert.js inside the editor.
		shipped(ed, content) {
			ed.execCommand('mceInsertInlineTodoLine', false, content);
		},
	};
	window.METHODS = METHODS;

	const lines = (md) => md.split('\n');
	const norm = (l) => l.replace(/\s+$/, '');

	window.runCase = function (ed, c, method) {
		const problems = [];
		ed.setContent(window.mdToHtml(c.md));
		ed.undoManager.clear(); ed.undoManager.add();
		const baselineMd = window.htmlToMd(ed.getContent());
		const baseline = lines(baselineMd).map(norm).filter((l) => l !== '');
		let expected = baseline.slice();
		const targets = c.targets || [{ text: c.target, mode: c.mode || 'exact', occurrence: c.occurrence || 0 }];
		const contents = [];
		for (const t of targets) {
			const escLine = norm(window.htmlToMd('<p>' + esc(t.text) + '</p>').trim());
			select(ed, t);
			const text = ed.selection.getContent({ format: 'text' }).trim();
			const content = '@TODO ' + text + ' //2026-09-29';
			contents.push(content);
			try { (window.METHODS[method])(ed, content); } catch (e) { problems.push('threw: ' + e.message); }
			const cb = norm(window.htmlToMd('<ul class="joplin-checklist"><li>' + esc(content) + '</li></ul>').trim());
			const i = expected.findIndex((l) => l === escLine || l === '- ' + escLine || l === '- [ ] ' + escLine);
			if (i >= 0) expected[i] = cb; else if (!c.expect) problems.push('rig: could not place expectation for ' + JSON.stringify(t.text));
		}
		if (c.expect) expected = c.expect;
		const md = window.htmlToMd(ed.getContent());
		const got = lines(md).map(norm).filter((l) => l !== '');
		if (JSON.stringify(got) !== JSON.stringify(expected)) {
			problems.push('content lines differ\n        expected: ' + JSON.stringify(expected) + '\n        got:      ' + JSON.stringify(got));
		}
		const raw = lines(md);
		raw.forEach((l, k) => {
			if (/^[\s ]+$/.test(l) || /&nbsp;/.test(l) || /^\s*-\s*\[ \]\s*$/.test(l)) problems.push('stray blank/empty item at line ' + (k + 1) + ': ' + JSON.stringify(l));
			const next = raw[k + 1];
			if (/  $/.test(l) && (next === undefined || next.trim() === '')) problems.push('dangling hard break (trailing <br>) at line ' + (k + 1) + ': ' + JSON.stringify(l));
		});
		if (/<\/?(ul|li|p|br|script|img)\b/i.test(md)) problems.push('raw HTML leaked into markdown');
		if (c.checkUndo) {
			for (let k = 0; k < targets.length; k++) ed.undoManager.undo();
			const back = window.htmlToMd(ed.getContent());
			if (back !== baselineMd) problems.push('undo did not restore original\n        baseline: ' + JSON.stringify(baselineMd) + '\n        after undo: ' + JSON.stringify(back));
		}
		return { problems, md };
	};
})();
