// Rich Text editor helper. Joplin loads this file into the Rich Text (TinyMCE)
// editor's document as an asset of the richTextBridge.js content script.
//
// Why it exists: in the Rich Text editor, lines with no blank line between them
// are ONE paragraph separated by <br>. Joplin's own checklist command
// (InsertJoplinChecklist) always converts the whole paragraph, so converting one
// task turned every neighboring line into a checkbox too. The editor commands a
// plugin can reach cannot split just one line cleanly, so this script registers
// a TinyMCE command that edits the selected line directly:
//   mceInsertInlineTodoLine(content)
// The name starts with "mceInsert" on purpose: Joplin saves the note after any
// command with that prefix.
//
// The task becomes its own one-item checklist, and an empty paragraph goes
// between it and any bullet or numbered list it touches. See separateFromLists
// in convertLine: without that gap the saved Markdown is one list and Joplin
// renders every item of it as a checkbox on the next load.
//
// The same file is also loaded into the note viewer, where there is no editor;
// it then does nothing.
(function () {
	'use strict';

	var COMMAND = 'mceInsertInlineTodoLine';
	var CONTENT_SCRIPT_ID = 'inlineTodoGuiRichText';

	function escHtml(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function isBr(n) {
		return !!n && n.nodeName === 'BR';
	}

	function isList(n) {
		return !!n && (n.nodeName === 'UL' || n.nodeName === 'OL');
	}

	// Remove <br> and whitespace-only text at the edges of el. Removes el
	// itself when nothing is left, so a split never leaves an empty line.
	function trimEdges(el) {
		function edge(n) {
			return n && (isBr(n) || (n.nodeType === 3 && !n.data.replace(/[\s​ ]/g, '')));
		}
		while (edge(el.firstChild)) el.removeChild(el.firstChild);
		while (edge(el.lastChild)) el.removeChild(el.lastChild);
		if (!el.firstChild && el.parentNode) el.parentNode.removeChild(el);
	}

	// Turn only the selected line into a one-item checklist. Returns false,
	// changing nothing, when the selection is somewhere this does not handle
	// (heading, table cell, across several blocks); the caller then uses
	// Joplin's own checklist command, which is correct there because those
	// blocks are a single line.
	function convertLine(ed, content) {
		var dom = ed.dom;
		var doc = ed.getDoc();
		var body = ed.getBody();
		var rng = ed.selection.getRng().cloneRange();
		function blockOf(node) {
			return dom.getParent(node, function (n) { return n.nodeType === 1 && dom.isBlock(n); }, body) || body;
		}
		var block = blockOf(rng.startContainer);
		var endBlock = blockOf(rng.endContainer);

		// A triple-click selection often ends at the very start of the NEXT
		// block. Nothing of that block is selected, so pull the end back.
		if (endBlock !== block && !block.contains(endBlock)) {
			var probe = doc.createRange();
			probe.setStart(endBlock, 0);
			probe.setEnd(rng.endContainer, rng.endOffset);
			if (probe.toString() === '') {
				rng.setEnd(block, block.childNodes.length);
				endBlock = block;
			}
		}
		if (endBlock !== block) return false;
		// A list with blank lines between its items is "loose": Joplin renders
		// each item as <li><p>text</p></li>. The item, not its paragraph, is the
		// block to split, or the checklist lands inside the item and Joplin
		// saves "- - [ ] ..." (found 2026-10-07 by the regression run).
		if (block.nodeName === 'P' && block.parentNode && block.parentNode.nodeName === 'LI') block = block.parentNode;
		var tag = block.nodeName;
		if (block === body || !/^(P|DIV|LI)$/.test(tag)) return false;

		ed.undoManager.transact(function () {
			// 1. Replace the selection with the task as a plain text node. A
			//    selection that ran through the line break keeps that break as
			//    the line boundary.
			var endsWithBr = false;
			var picked = rng.cloneContents();
			if (picked.lastChild && isBr(picked.lastChild)) endsWithBr = true;
			rng.deleteContents();
			var textNode = doc.createTextNode(content);
			rng.insertNode(textNode);
			if (endsWithBr) textNode.parentNode.insertBefore(doc.createElement('br'), textNode.nextSibling);

			// 2. The line is the run of inline nodes between <br>s (or the
			//    block edges). Unselected text on the same line stays with it.
			var top = textNode;
			while (top.parentNode !== block) top = top.parentNode;
			var first = top;
			var last = top;
			while (first.previousSibling && !isBr(first.previousSibling) && !dom.isBlock(first.previousSibling)) first = first.previousSibling;
			while (last.nextSibling && !isBr(last.nextSibling) && !dom.isBlock(last.nextSibling)) last = last.nextSibling;
			var prevBr = isBr(first.previousSibling) ? first.previousSibling : null;
			var nextBr = isBr(last.nextSibling) ? last.nextSibling : null;

			var li = doc.createElement('li');
			var lineNodes = [];
			for (var n = first; n; n = n.nextSibling) {
				lineNodes.push(n);
				if (n === last) break;
			}
			// Marks where the line sat, so what was before it and after it
			// can be told apart once the line has moved into the new item.
			var marker = doc.createComment('inline-todo-line');
			block.insertBefore(marker, first);
			for (var i = 0; i < lineNodes.length; i++) li.appendChild(lineNodes[i]);

			function isPlainList(n) {
				return isList(n) && !(n.classList && n.classList.contains('joplin-checklist'));
			}
			// An empty paragraph, which Joplin saves as "&nbsp;". It goes
			// between the checklist and any bullet or numbered list it touches.
			// Without it Joplin saves the two as ONE Markdown list (same "-"
			// marker, only a blank line between), and on the next load its
			// renderer marks the whole list as a checklist, so every neighbor
			// came back as a checkbox (measured in Joplin 3.7.21, 2026-10-07).
			// It shows as one blank line. The same holds for a list nested
			// inside an item: there the gap is saved indented and keeps the
			// sibling sub-items as bullets (measured the same day).
			function gap() {
				var p = doc.createElement('p');
				var br = doc.createElement('br');
				br.setAttribute('data-mce-bogus', '1');
				p.appendChild(br);
				return p;
			}
			function separateFromLists(ul) {
				var parent = ul.parentNode;
				if (!parent) return;
				if (isPlainList(ul.previousSibling)) parent.insertBefore(gap(), ul);
				if (isPlainList(ul.nextSibling)) parent.insertBefore(gap(), ul.nextSibling);
			}

			var ul;
			if (tag === 'LI') {
				var list = block.parentNode;
				var inChecklist = !!(list.classList && list.classList.contains('joplin-checklist'));
				// What is left of the item: lines before the converted line go
				// to one item, lines after it to another, and a nested sublist
				// stays under the converted item.
				var beforeLi = block.cloneNode(false);
				var afterLi = block.cloneNode(false);
				var past = false;
				for (var c = block.firstChild; c; ) {
					var nxt = c.nextSibling;
					if (c === marker || c === prevBr || c === nextBr) {
						// The marker and the line's own breaks go away.
						if (c === marker) past = true;
						block.removeChild(c);
					} else if (!past) beforeLi.appendChild(c);
					else if (isList(c)) li.appendChild(c);
					else afterLi.appendChild(c);
					c = nxt;
				}
				trimEdges(beforeLi);
				trimEdges(afterLi);
				if (inChecklist) {
					// Already a checkbox line: keep it one, unchecked, in place.
					if (beforeLi.firstChild) list.insertBefore(beforeLi, block);
					list.insertBefore(li, block);
					if (afterLi.firstChild) list.insertBefore(afterLi, block);
					list.removeChild(block);
					ul = list;
				} else {
					// Split the list: items before, a checklist holding this
					// item, items after. A numbered list keeps its numbering.
					var tail = list.cloneNode(false);
					var sib = block.nextSibling;
					while (sib) {
						var nx = sib.nextSibling;
						tail.appendChild(sib);
						sib = nx;
					}
					if (afterLi.firstChild) tail.insertBefore(afterLi, tail.firstChild);
					if (beforeLi.firstChild) list.insertBefore(beforeLi, block);
					list.removeChild(block);
					ul = doc.createElement('ul');
					ul.className = 'joplin-checklist';
					ul.appendChild(li);
					dom.insertAfter(ul, list);
					if (tail.firstChild) {
						if (list.nodeName === 'OL') {
							var start = parseInt(list.getAttribute('start') || '1', 10);
							tail.setAttribute('start', String(start + list.children.length + 1));
						}
						dom.insertAfter(tail, ul);
					}
					if (!list.firstChild) list.parentNode.removeChild(list);
					separateFromLists(ul);
				}
			} else {
				// Paragraph: [lines before] [checklist item] [lines after].
				var before = block.cloneNode(false);
				var after = block.cloneNode(false);
				var past2 = false;
				for (var c2 = block.firstChild; c2; ) {
					var nxt2 = c2.nextSibling;
					if (c2 === marker || c2 === prevBr || c2 === nextBr) {
						if (c2 === marker) past2 = true;
						block.removeChild(c2);
					} else if (!past2) before.appendChild(c2);
					else after.appendChild(c2);
					c2 = nxt2;
				}
				var parent = block.parentNode;
				ul = doc.createElement('ul');
				ul.className = 'joplin-checklist';
				ul.appendChild(li);
				parent.insertBefore(before, block);
				parent.insertBefore(ul, block);
				parent.insertBefore(after, block);
				parent.removeChild(block);
				trimEdges(before);
				trimEdges(after);
				separateFromLists(ul);
			}
			trimEdges(li);

			var caret = doc.createRange();
			caret.selectNodeContents(li.parentNode ? li : body);
			caret.collapse(false);
			ed.selection.setRng(caret);
		});
		ed.nodeChanged();
		return true;
	}

	function run(ed, content) {
		if (convertLine(ed, content)) return;
		// Heading, table cell or multi-block selection: the 1.4.2 behavior.
		ed.selection.setContent(escHtml(content));
		ed.execCommand('InsertJoplinChecklist', false, null, {});
	}

	function findEditor() {
		try {
			var tm = window.parent && window.parent !== window ? window.parent.tinymce : null;
			if (!tm || typeof tm.get !== 'function') return null;
			var eds = tm.get();
			for (var i = 0; i < eds.length; i++) {
				if (eds[i].getWin && eds[i].getWin() === window) return eds[i];
			}
		} catch (e) {
			/* not inside the Rich Text editor */
		}
		return null;
	}

	function register() {
		var ed = findEditor();
		if (!ed) return false;
		if (!ed.__inlineTodoGuiRegistered) {
			ed.__inlineTodoGuiRegistered = true;
			ed.addCommand(COMMAND, function (_ui, value) {
				run(ed, typeof value === 'string' ? value : String((value && value.content) || ''));
			});
		}
		// Tell the plugin the command exists, so it stops using the old path.
		try {
			if (window.webviewApi) window.webviewApi.postMessage(CONTENT_SCRIPT_ID, { type: 'ready' });
		} catch (e) {
			/* the plugin falls back to the old path */
		}
		return true;
	}

	// Exposed for the test rig; harmless in Joplin.
	window.inlineTodoGuiConvertLine = convertLine;
	window.inlineTodoGuiRun = run;

	if (!register()) {
		var tries = 0;
		var timer = setInterval(function () {
			if (register() || ++tries >= 50) clearInterval(timer);
		}, 100);
	}
})();
