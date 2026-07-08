// CodeMirror 6 content script for the Markdown editor. Exposes two commands the
// main plugin calls via editor.execCommand:
//   inlineTodoGuiGrab        -> returns {from,to,text}: the selection if any,
//                               otherwise from the cursor to the end of its line.
//   inlineTodoGuiReplaceRange(from,to,insert) -> replaces that exact range.
// Only active in the Markdown (CM6) editor; the Rich Text editor uses the
// selectedText/replaceSelection fallback in the main plugin.
module.exports = {
	default: function (_context) {
		return {
			plugin: function (editorControl) {
				if (!editorControl || !editorControl.cm6) return;

				editorControl.registerCommand('inlineTodoGuiGrab', function () {
					var view = editorControl.editor;
					var state = view.state;
					var main = state.selection.main;
					var from, to;
					if (!main.empty) {
						from = main.from;
						to = main.to;
					} else {
						from = main.head;
						to = state.doc.lineAt(main.head).to;
					}
					return { from: from, to: to, text: state.sliceDoc(from, to) };
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
