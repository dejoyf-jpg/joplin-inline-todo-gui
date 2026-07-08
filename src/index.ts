import joplin from 'api';
import {
	SettingItemType,
	MenuItemLocation,
	ToolbarButtonLocation,
	ToastType,
	ContentScriptType,
} from 'api/types';

const SECTION = 'inlineTodoGui';
const DIALOG_ID = 'inlineTodoGuiDialog';

// Turn a free-form tag string into a clean tag token (letters, digits, _ and -).
function sanitizeTag(raw: string): string {
	return raw.trim().replace(/^\++/, '').replace(/[^A-Za-z0-9_-]/g, '');
}

// Split a comma/space separated list into clean, de-duplicated tags.
function parseTagList(raw: string): string[] {
	if (!raw) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const piece of raw.split(/[\s,]+/)) {
		const t = sanitizeTag(piece);
		if (t && !seen.has(t.toLowerCase())) {
			seen.add(t.toLowerCase());
			out.push(t);
		}
	}
	return out;
}

// Basic HTML-escaping for values we drop into the dialog markup.
function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function pad2(n: number): string {
	return (n < 10 ? '0' : '') + n;
}

// Default due date shown in the dialog: tomorrow, as YYYY-MM-DD.
function tomorrowISO(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function getSettings() {
	const token = ((await joplin.settings.value(`${SECTION}.token`)) || '@TODO').trim() || '@TODO';
	const dateFirst = await joplin.settings.value(`${SECTION}.dateFirst`);
	return { token, dateFirst: dateFirst !== false };
}

// Build the checkbox *content* (everything after "- [ ] ") that the Inline TODO
// plugin (plugin.calebjohn.todo) recognizes:  @TODO <text> //<due> +tag1 +tag2
// The "- [ ] " is added afterwards by Joplin's textCheckbox command, so the line
// becomes a real, clickable checkbox in both the Markdown and Rich Text editors.
function buildTodoContent(opts: {
	token: string;
	text: string;
	due: string;
	tags: string[];
	dateFirst: boolean;
}): string {
	const parts: string[] = [`${opts.token} ${opts.text.trim()}`];
	const dueToken = opts.due ? `//${opts.due}` : '';
	const tagTokens = opts.tags.map((t) => `+${t}`);
	if (opts.dateFirst) {
		if (dueToken) parts.push(dueToken);
		parts.push(...tagTokens);
	} else {
		parts.push(...tagTokens);
		if (dueToken) parts.push(dueToken);
	}
	return parts.join(' ');
}

function buildDialogHtml(taskText: string, tokenLabel: string): string {
	return `
	<style>
		#itg-wrap { font-family: var(--joplin-font-family, sans-serif); min-width: 340px; max-width: 400px; color: var(--joplin-color, #222); }
		#itg-wrap h3 { margin: 0 0 10px 0; font-size: 1.05em; }
		#itg-wrap .field { margin-bottom: 12px; }
		#itg-wrap label.lbl { display: block; font-weight: 600; margin-bottom: 4px; font-size: 0.9em; }
		#itg-wrap .taskbox { padding: 7px 8px; border: 1px solid var(--joplin-divider-color, #ccc); border-radius: 4px; background: rgba(128,128,128,0.10); font-family: var(--joplin-font-family, monospace); word-break: break-word; }
		#itg-wrap input[type="text"], #itg-wrap input[type="date"] { width: 100%; box-sizing: border-box; padding: 7px 8px; font-size: 1em; border: 1px solid var(--joplin-divider-color, #ccc); border-radius: 4px; background: var(--joplin-background-color, #fff); color: var(--joplin-color, #222); }
		#itg-wrap .hint { font-size: 0.82em; opacity: 0.72; font-weight: normal; }
		/* Calendar drawn by dialog.js. Always shown; the date field above also accepts typing. */
		#itg-cal { border: 1px solid var(--joplin-divider-color, #ccc); border-radius: 6px; padding: 8px; margin-top: 8px; user-select: none; }
		#itg-cal .itg-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
		#itg-cal .itg-cal-title { font-weight: 600; }
		#itg-cal .itg-nav { border: none; background: transparent; cursor: pointer; font-size: 1.25em; line-height: 1; padding: 2px 12px; border-radius: 4px; color: var(--joplin-color, #222); }
		#itg-cal .itg-nav:hover { background: rgba(128,128,128,0.18); }
		#itg-cal .itg-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
		#itg-cal .itg-wd { text-align: center; font-size: 0.72em; opacity: 0.6; padding: 2px 0; }
		#itg-cal .itg-day { border: none; background: transparent; cursor: pointer; padding: 6px 0; border-radius: 4px; font-size: 0.9em; color: var(--joplin-color, #222); }
		#itg-cal .itg-day:hover { background: rgba(128,128,128,0.18); }
		#itg-cal .itg-empty { visibility: hidden; }
		#itg-cal .itg-today { outline: 1px solid #4b7bec; }
		#itg-cal .itg-selected { background: #4b7bec; color: #fff; }
		#itg-cal .itg-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
		#itg-cal .itg-quick { border: 1px solid var(--joplin-divider-color, #ccc); background: transparent; color: var(--joplin-color, #222); border-radius: 4px; padding: 4px 9px; cursor: pointer; font-size: 0.82em; }
		#itg-cal .itg-quick:hover { background: rgba(128,128,128,0.18); }
	</style>
	<div id="itg-wrap">
		<form name="main">
			<h3>Convert to Inline TODO</h3>
			<div class="field">
				<label class="lbl">Task</label>
				<div class="taskbox">${esc(taskText)}</div>
			</div>
			<div class="field">
				<label class="lbl" for="itg-due">Due date <span class="hint">(defaults to tomorrow &mdash; type it, or click a day below)</span></label>
				<input type="date" id="itg-due" name="due" value="${tomorrowISO()}" />
				<div id="itg-cal"></div>
			</div>
			<div class="field">
				<label class="lbl" for="itg-tags">Tags <span class="hint">(optional, space or comma separated)</span></label>
				<input type="text" id="itg-tags" name="tags" placeholder="e.g. BOB DealFlow" />
			</div>
			<div class="hint">Replaces the text from your cursor to the end of the line with a <code>${esc(tokenLabel)}</code> line.</div>
		</form>
	</div>
	`;
}

joplin.plugins.register({
	onStart: async function () {
		// -------------------- Settings --------------------
		await joplin.settings.registerSection(SECTION, {
			label: 'Inline TODO Quick Add',
			iconName: 'fas fa-check-square',
			description:
				'Convert the text right of your cursor into an @TODO line recognized by the Inline TODO plugin (plugin.calebjohn.todo).',
		});

		await joplin.settings.registerSettings({
			[`${SECTION}.token`]: {
				value: '@TODO',
				type: SettingItemType.String,
				section: SECTION,
				public: true,
				label: 'Task keyword',
				description:
					'The keyword the Inline TODO plugin scans for. Default @TODO. Change only if you customised the plugin.',
			},
			[`${SECTION}.dateFirst`]: {
				value: true,
				type: SettingItemType.Bool,
				section: SECTION,
				public: true,
				label: 'Put due date before tags',
				description:
					'When on, the line reads "@TODO text //date +tags". When off, "@TODO text +tags //date".',
			},
		});

		// -------------------- Content script (Markdown/CM6 editor) --------------------
		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			'inlineTodoGuiCm',
			'./contentScript.js',
		);

		// -------------------- Dialog --------------------
		const dialog = await joplin.views.dialogs.create(DIALOG_ID);
		await joplin.views.dialogs.setButtons(dialog, [
			{ id: 'ok', title: 'Convert' },
			{ id: 'cancel', title: 'Cancel' },
		]);
		await joplin.views.dialogs.setFitToContent(dialog, true);
		// CSP-safe interactivity (the calendar) via a loaded script, not inline handlers.
		await joplin.views.dialogs.addScript(dialog, './dialog.js');

		// -------------------- Command --------------------
		await joplin.commands.register({
			name: 'inlineTodoGui.convert',
			label: 'Convert to Inline TODO…',
			iconName: 'fas fa-check-square',
			execute: async () => {
				// Markdown editor: grab cursor -> end of line (or the selection) via
				// the content script. Rich text editor: fall back to the selection.
				let grabbed: { from: number; to: number; text: string } | null = null;
				try {
					grabbed = await joplin.commands.execute('editor.execCommand', {
						name: 'inlineTodoGuiGrab',
					});
				} catch (e) {
					grabbed = null;
				}

				let text = '';
				let range: { from: number; to: number } | null = null;
				if (grabbed && typeof grabbed.text === 'string' && grabbed.text.trim()) {
					text = grabbed.text.trim();
					range = { from: grabbed.from, to: grabbed.to };
				} else {
					text = ((await joplin.commands.execute('selectedText')) || '').trim();
				}

				if (!text) {
					await joplin.views.dialogs.showToast({
						message:
							'Markdown: put your cursor left of the task. Rich text: highlight the task. Then run this.',
						type: ToastType.Info,
					});
					return;
				}

				const { token, dateFirst } = await getSettings();
				await joplin.views.dialogs.setHtml(dialog, buildDialogHtml(text, token));

				const result = await joplin.views.dialogs.open(dialog);
				if (!result || result.id !== 'ok') return;

				const form = (result.formData && result.formData.main) || {};
				const tags = parseTagList(form.tags || '');
				const content = buildTodoContent({
					token,
					text,
					due: (form.due || '').trim(),
					tags,
					dateFirst,
				});

				try {
					if (range) {
						// Markdown: insert a real checkbox line directly. It renders as a
						// clickable checkbox (via Rich Markdown / the preview pane).
						await joplin.commands.execute('editor.execCommand', {
							name: 'inlineTodoGuiReplaceRange',
							args: [range.from, range.to, '- [ ] ' + content],
						});
					} else {
						// Rich text: insert the text, refocus the editor (the modal dialog
						// stole focus, which made the checklist command silently no-op),
						// then convert the line to a real checkbox with the same command
						// the core checklist toolbar button uses.
						await joplin.commands.execute('replaceSelection', content);
						try {
							await joplin.commands.execute('focusElement', 'noteBody');
						} catch (e) {
							/* focusElement is desktop-only; ignore if unavailable */
						}
						// The exact command Joplin's own Rich Text checklist button fires.
						// (textCheckbox is Markdown-editor-only, which is why it did nothing here.)
						await joplin.commands.execute('editor.execCommand', {
							name: 'InsertJoplinChecklist',
						});
					}
					await joplin.views.dialogs.showToast({
						message: 'Converted to Inline TODO.',
						type: ToastType.Success,
					});
				} catch (e) {
					await joplin.views.dialogs.showToast({
						message: 'Could not replace the text. Try again in the note editor.',
						type: ToastType.Error,
					});
				}
			},
		});

		// -------------------- Menu + toolbar --------------------
		await joplin.views.menuItems.create(
			'inlineTodoGuiToolsMenu',
			'inlineTodoGui.convert',
			MenuItemLocation.Tools,
			{ accelerator: 'CmdOrCtrl+Alt+T' },
		);

		await joplin.views.toolbarButtons.create(
			'inlineTodoGuiToolbarButton',
			'inlineTodoGui.convert',
			ToolbarButtonLocation.EditorToolbar,
		);
	},
});
