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

// The values the "Default due date" setting can take, and their labels. The
// label is shown in the dialog hint so it never contradicts the setting.
const DEFAULT_DUE_OPTIONS: Record<string, string> = {
	none: 'No date',
	today: 'Today',
	tomorrow: 'Tomorrow',
	plus7: 'One week out',
	nextMonday: 'Next Monday',
};

// Format a Date as YYYY-MM-DD using its LOCAL calendar fields.
//
// This must never go through toISOString() or a parsed date string. Both work in
// UTC, so anywhere west of UTC an evening date formats as the NEXT day. Reading
// the local getters is the only construction that is correct at every hour.
function localISO(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// The date the dialog's due field is pre-filled with. Returns '' for 'none'.
//
// All offsets go through setDate(), which does CALENDAR arithmetic. Adding
// n * 86400000 milliseconds instead would be wrong across a daylight-saving
// change: on a 23-hour spring-forward day it lands a full date too far.
function defaultDueISO(choice: string): string {
	const d = new Date();
	switch (choice) {
		case 'none':
			return '';
		case 'today':
			break;
		case 'plus7':
			d.setDate(d.getDate() + 7);
			break;
		case 'nextMonday':
			// getDay(): 0 = Sunday. The `|| 7` keeps "next Monday" in the future
			// when today IS Monday, instead of returning today.
			d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
			break;
		case 'tomorrow':
		default:
			d.setDate(d.getDate() + 1);
			break;
	}
	return localISO(d);
}

// Force the task keyword into the shape the Inline TODO plugin can actually see.
//
// Its scanner requires an @word, a //date or a +tag on the line. A keyword with
// no leading "@" is none of those, so a task with a blank date and no tags would
// be written correctly and then never appear in the summary note. Blank dates
// became easy in 1.3.0, so this guard is what stops that silent loss.
function normalizeToken(raw: string): string {
	const t = (raw || '').trim().replace(/\s+/g, '');
	if (!t) return '@TODO';
	return t.startsWith('@') ? t : '@' + t;
}

async function getSettings() {
	const token = normalizeToken(await joplin.settings.value(`${SECTION}.token`));
	const dateFirst = await joplin.settings.value(`${SECTION}.dateFirst`);
	const rawDue = await joplin.settings.value(`${SECTION}.defaultDue`);
	const defaultDue = DEFAULT_DUE_OPTIONS[rawDue] ? rawDue : 'tomorrow';
	return { token, dateFirst: dateFirst !== false, defaultDue };
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

function buildDialogHtml(
	taskText: string,
	tokenLabel: string,
	duePrefill: string,
	dueHint: string,
	isMobile: boolean,
): string {
	const grabHint = isMobile
		? 'Replaces the task line (or your selection) with a checkbox line.'
		: 'Replaces the text from your cursor to the end of the line with a checkbox line.';
	return `
	<style>
		/* Fixed, centered width so the content never renders wider than the dialog
		   window (which was clipping the right-hand weekday columns and nav). */
		#itg-wrap { font-family: var(--joplin-font-family, sans-serif); width: 100%; max-width: 320px; margin: 0 auto; box-sizing: border-box; color: var(--joplin-color, #222); }
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
		#itg-cal .itg-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
		#itg-cal .itg-wd { text-align: center; font-size: 0.72em; opacity: 0.6; padding: 2px 0; }
		#itg-cal .itg-day { border: none; background: transparent; cursor: pointer; padding: 6px 0; border-radius: 4px; font-size: 0.9em; color: var(--joplin-color, #222); }
		#itg-cal .itg-day:hover { background: rgba(128,128,128,0.18); }
		#itg-cal .itg-empty { visibility: hidden; }
		#itg-cal .itg-today { outline: 1px solid #4b7bec; }
		#itg-cal .itg-selected { background: #4b7bec; color: #fff; }
		#itg-cal .itg-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
		#itg-cal .itg-quick { border: 1px solid var(--joplin-divider-color, #ccc); background: transparent; color: var(--joplin-color, #222); border-radius: 4px; padding: 4px 9px; cursor: pointer; font-size: 0.82em; }
		#itg-cal .itg-quick:hover { background: rgba(128,128,128,0.18); }
		/* Mobile only: same dialog, bigger touch targets. Desktop rendering is unchanged
		   because these rules require the itg-mobile class, which desktop never gets. */
		#itg-wrap.itg-mobile input[type="text"], #itg-wrap.itg-mobile input[type="date"] { padding: 10px; font-size: 1.05em; }
		#itg-wrap.itg-mobile .itg-day { padding: 11px 0; font-size: 1em; }
		#itg-wrap.itg-mobile .itg-quick { padding: 8px 12px; font-size: 0.9em; }
		#itg-wrap.itg-mobile .itg-nav { padding: 6px 16px; }
	</style>
	<div id="itg-wrap"${isMobile ? ' class="itg-mobile"' : ''}>
		<form name="main">
			<h3>Convert to Inline TODO</h3>
			<div class="field">
				<label class="lbl">Task</label>
				<div class="taskbox">${esc(taskText)}</div>
			</div>
			<div class="field">
				<label class="lbl" for="itg-due">Due date <span class="hint">${esc(dueHint)}</span></label>
				<input type="date" id="itg-due" name="due" value="${duePrefill}" />
				<div id="itg-cal"></div>
			</div>
			<div class="field">
				<label class="lbl" for="itg-tags">Tags <span class="hint">(optional, space or comma separated)</span></label>
				<input type="text" id="itg-tags" name="tags" placeholder="e.g. BOB DealFlow" />
			</div>
			<div class="field">
				<label class="lbl" for="itg-keyword">Keyword <span class="hint">(groups this task in the summary note)</span></label>
				<input type="text" id="itg-keyword" name="keyword" value="${esc(tokenLabel)}" />
			</div>
			<div class="hint">${grabHint}</div>
		</form>
	</div>
	`;
}

joplin.plugins.register({
	onStart: async function () {
		// -------------------- Platform --------------------
		// versionInfo().platform is 'desktop' or 'mobile' (present since Joplin
		// 3.0, verified in the v3.0.15 source). Mobile has no menu bar, no
		// keyboard accelerators and no Rich Text editor, so a few paths below
		// branch on this. Anything unexpected is treated as desktop, which is
		// the behavior this plugin always had.
		let isMobile = false;
		try {
			const info = await joplin.versionInfo();
			isMobile = !!info && info.platform === 'mobile';
		} catch (e) {
			isMobile = false;
		}

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
				label: 'Default task keyword',
				description:
					'Starts with @. The Inline TODO plugin treats this as the task\'s category and groups the summary note by it, so different keywords make different groups. Any @word works and @TODO is only a convention. This is the starting value; you can change it per task in the dialog.',
			},
			[`${SECTION}.defaultDue`]: {
				value: 'tomorrow',
				type: SettingItemType.String,
				isEnum: true,
				options: DEFAULT_DUE_OPTIONS,
				section: SECTION,
				public: true,
				label: 'Default due date',
				description:
					'What the due date field is pre-filled with when the dialog opens. Choose "No date" to start blank. You can always pick, change or clear the date in the dialog.',
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
		// Do NOT fit-to-content for width: Joplin was clamping the dialog window
		// narrower than the form, clipping the right weekday columns and the
		// next-month nav. Let the dialog use its default width; #itg-wrap is a
		// fixed, centered 320px so the whole calendar is always visible.
		await joplin.views.dialogs.setFitToContent(dialog, false);
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
					// The argument asks for whole-line mode. On a phone, placing the
					// cursor exactly at the start of the task is a clumsy gesture, so
					// mobile grabs the whole line (minus any leading bullet or
					// checkbox marker). Desktop passes false and behaves exactly as
					// before: selection if any, else cursor to end of line.
					grabbed = await joplin.commands.execute('editor.execCommand', {
						name: 'inlineTodoGuiGrab',
						args: [isMobile],
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
						message: isMobile
							? 'Tap inside the task line, then tap the convert button in the editor toolbar.'
							: 'Markdown: put your cursor left of the task. Rich text: highlight the task. Then run this.',
						type: ToastType.Info,
					});
					return;
				}

				const { token, dateFirst, defaultDue } = await getSettings();
				const duePrefill = defaultDueISO(defaultDue);
				const dueHint =
					defaultDue === 'none'
						? '(optional, type it or click a day below)'
						: `(defaults to ${DEFAULT_DUE_OPTIONS[defaultDue].toLowerCase()}, type it or click a day below)`;
				await joplin.views.dialogs.setHtml(
					dialog,
					buildDialogHtml(text, token, duePrefill, dueHint, isMobile),
				);

				const result = await joplin.views.dialogs.open(dialog);
				if (!result || result.id !== 'ok') return;

				const form = (result.formData && result.formData.main) || {};
				const tags = parseTagList(form.tags || '');
				// A blank keyword field falls back to the setting, and both go through
				// normalizeToken, so a cleared field can never emit a line the Inline
				// TODO scanner cannot see.
				const taskToken = normalizeToken(form.keyword || token);
				const content = buildTodoContent({
					token: taskToken,
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
					} else if (isMobile) {
						// Mobile fallback, only reached if the content script grab was
						// unavailable. Mobile has no Rich Text editor, so the note is
						// always Markdown: insert a complete checkbox line over the
						// selection. focusElement and InsertJoplinChecklist do not exist
						// on mobile and are never called on this path.
						await joplin.commands.execute('replaceSelection', '- [ ] ' + content);
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
		// The menuItems API is documented desktop-only (see
		// api/JoplinViewsMenuItems.d.ts), and mobile has no Tools menu and no
		// keyboard, so the menu entry and the Ctrl+Alt+T accelerator are
		// desktop-only. On mobile the editor toolbar button below is the trigger.
		if (!isMobile) {
			await joplin.views.menuItems.create(
				'inlineTodoGuiToolsMenu',
				'inlineTodoGui.convert',
				MenuItemLocation.Tools,
				{ accelerator: 'CmdOrCtrl+Alt+T' },
			);
		}

		await joplin.views.toolbarButtons.create(
			'inlineTodoGuiToolbarButton',
			'inlineTodoGui.convert',
			ToolbarButtonLocation.EditorToolbar,
		);
	},
});
