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
			for (var i = 0; i < lineNodes.length; i++) li.appendChild(lineNodes[i]);

			if (tag === 'LI') {
				var list = block.parentNode;
				var inChecklist = !!(list.classList && list.classList.contains('joplin-checklist'));
				var beforeLi = block.cloneNode(false);
				var afterLi = block.cloneNode(false);
				if (prevBr) {
					while (block.firstChild !== prevBr) beforeLi.appendChild(block.firstChild);
					block.removeChild(prevBr);
				}
				if (nextBr) {
					while (nextBr.nextSibling) afterLi.appendChild(nextBr.nextSibling);
					block.removeChild(nextBr);
				}
				// A nested sublist stays under the converted item.
				while (block.firstChild) {
					var rest = block.firstChild;
					if (isList(rest)) li.appendChild(rest); else afterLi.appendChild(rest);
				}
				if (inChecklist) {
					// Already a checkbox line: keep it one, unchecked, in place.
					if (beforeLi.firstChild) list.insertBefore(beforeLi, block);
					list.insertBefore(li, block);
					if (afterLi.firstChild) list.insertBefore(afterLi, block);
					list.removeChild(block);
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
					var ul = doc.createElement('ul');
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
				}
			} else {
				// Paragraph: [lines before] [checklist item] [lines after].
				var before = block.cloneNode(false);
				var after = block.cloneNode(false);
				if (prevBr) {
					while (block.firstChild !== prevBr) before.appendChild(block.firstChild);
					block.removeChild(prevBr);
				}
				if (nextBr) {
					while (nextBr.nextSibling) after.appendChild(nextBr.nextSibling);
					block.removeChild(nextBr);
				}
				var parent = block.parentNode;
				var list2 = doc.createElement('ul');
				list2.className = 'joplin-checklist';
				list2.appendChild(li);
				parent.insertBefore(before, block);
				parent.insertBefore(list2, block);
				parent.insertBefore(after, block);
				parent.removeChild(block);
				trimEdges(before);
				trimEdges(after);
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
