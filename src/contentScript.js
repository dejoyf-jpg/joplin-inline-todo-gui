// CodeMirror 6 content script for the Markdown editor, desktop and mobile
// (the mobile editor is CodeMirror 6 too, so this same script runs there).
// Exposes two commands the main plugin calls via editor.execCommand:
//   inlineTodoGuiGrab(wholeLine) -> returns {from,to,text}: the selection if
//       any; otherwise, when wholeLine is falsy (desktop), from the cursor to
//       the end of its line; when wholeLine is true (mobile), the whole line
//       the cursor is on, keeping indentation and dropping a leading bullet
//       or checkbox marker from the text while including it in the range, so
//       the marker is replaced rather than doubled.
//   inlineTodoGuiReplaceRange(from,to,insert) -> replaces that exact range.
// On desktop the Rich Text editor uses the selectedText/replaceSelection
// fallback in the main plugin instead.
module.exports = {
	default: function (_context) {
		return {
			plugin: function (editorControl) {
				if (!editorControl || !editorControl.cm6) return;

				editorControl.registerCommand('inlineTodoGuiGrab', function (wholeLine) {
					var view = editorControl.editor;
					var state = view.state;
					var main = state.selection.main;
					var from, to, text;
					if (!main.empty) {
						from = main.from;
						to = main.to;
						text = state.sliceDoc(from, to);
					} else if (wholeLine) {
						// Mobile: tap anywhere in the line, grab the whole task.
						var line = state.doc.lineAt(main.head);
						var lineText = state.sliceDoc(line.from, line.to);
						var indent = (lineText.match(/^\s*/) || [''])[0];
						var rest = lineText.slice(indent.length);
						// A leading "- ", "* ", "+ ", "1. ", "1) " and an optional
						// existing "[ ]"/"[x]" box are part of the replaced range but
						// not of the task text, so converting "- call Scott" yields
						// "- [ ] @TODO call Scott" and never "- [ ] @TODO - call Scott".
						var marker = (rest.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/) || [''])[0];
						from = line.from + indent.length;
						to = line.to;
						text = rest.slice(marker.length);
					} else {
						from = main.head;
						to = state.doc.lineAt(main.head).to;
						text = state.sliceDoc(from, to);
					}
					return { from: from, to: to, text: text };
				});

				editorControl.registerCommand('inlineTodoGuiReplaceRange', function (from, to, insert) {
					var view = editorControl.editor;
					view.dispatch({
						changes: { from: from, to: to, insert: insert },
						selection: { anchor: from + insert.length },
					});
					view.focus();
					return true;
				});
			},
		};
	},
};
