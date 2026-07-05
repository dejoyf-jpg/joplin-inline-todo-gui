import joplin from 'api';
import {
	SettingItemType,
	MenuItemLocation,
	ToolbarButtonLocation,
	ToastType,
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

async function getSettings() {
	const token = ((await joplin.settings.value(`${SECTION}.token`)) || '@TODO').trim() || '@TODO';
	const defaultTagsRaw = (await joplin.settings.value(`${SECTION}.defaultTags`)) || '';
	const dateFirst = await joplin.settings.value(`${SECTION}.dateFirst`);
	return {
		token,
		defaultTags: parseTagList(defaultTagsRaw),
		dateFirst: dateFirst !== false,
	};
}

// Build the line the Inline TODO plugin (plugin.calebjohn.todo) recognizes:
//   - [ ] @TODO <text> //<due> +tag1 +tag2
function buildTodoLine(opts: {
	token: string;
	text: string;
	due: string;
	tags: string[];
	dateFirst: boolean;
}): string {
	const parts: string[] = [`- [ ] ${opts.token} ${opts.text.trim()}`];
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

function buildDialogHtml(defaultTags: string[], tokenLabel: string): string {
	const tagCheckboxes = defaultTags.length
		? defaultTags
				.map(
					(t) => `
			<label class="tag">
				<input type="checkbox" name="tag_${esc(t)}" value="${esc(t)}" />
				<span>+${esc(t)}</span>
			</label>`,
				)
				.join('')
		: `<div class="hint">No default tags configured. Add some in Tools &rarr; Options &rarr; Inline TODO Quick Add, or type them below.</div>`;

	return `
	<style>
		#itg-wrap { font-family: var(--joplin-font-family, sans-serif); min-width: 380px; }
		#itg-wrap h3 { margin: 0 0 12px 0; font-size: 1.1em; }
		#itg-wrap .field { margin-bottom: 12px; display: flex; flex-direction: column; }
		#itg-wrap label.lbl { font-weight: 600; margin-bottom: 4px; font-size: 0.9em; }
		#itg-wrap input[type="text"], #itg-wrap input[type="date"] {
			padding: 7px 8px; font-size: 1em; border: 1px solid var(--joplin-divider-color, #ccc);
			border-radius: 4px; background: var(--joplin-background-color, #fff);
			color: var(--joplin-color, #222);
		}
		#itg-wrap .tags { display: flex; flex-wrap: wrap; gap: 6px 14px; }
		#itg-wrap label.tag { display: inline-flex; align-items: center; gap: 5px; font-weight: normal; cursor: pointer; }
		#itg-wrap label.tag span { font-family: var(--joplin-font-family, monospace); }
		#itg-wrap .hint { font-size: 0.85em; opacity: 0.75; }
		#itg-wrap .row { display: flex; gap: 12px; }
		#itg-wrap .row .field { flex: 1; }
	</style>
	<div id="itg-wrap">
		<form name="main">
			<h3>New Inline TODO</h3>
			<div class="field">
				<label class="lbl" for="itg-text">Task</label>
				<input type="text" id="itg-text" name="text" autofocus placeholder="What needs doing?" />
			</div>
			<div class="row">
				<div class="field">
					<label class="lbl" for="itg-due">Due date <span class="hint">(optional)</span></label>
					<input type="date" id="itg-due" name="due" />
				</div>
			</div>
			<div class="field">
				<label class="lbl">Tags</label>
				<div class="tags">${tagCheckboxes}</div>
			</div>
			<div class="field">
				<label class="lbl" for="itg-extra">More tags <span class="hint">(space or comma separated, no + needed)</span></label>
				<input type="text" id="itg-extra" name="extraTags" placeholder="e.g. Q3 followup" />
			</div>
			<div class="hint">Inserts a <code>${esc(tokenLabel)}</code> checkbox line at your cursor.</div>
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
				'GUI quick-add that writes the @TODO markdown recognized by the Inline TODO plugin (plugin.calebjohn.todo).',
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
			[`${SECTION}.defaultTags`]: {
				value: 'BOB, DealFlow, L10',
				type: SettingItemType.String,
				section: SECTION,
				public: true,
				label: 'Default tags (checkboxes)',
				description:
					'Comma-separated tags shown as checkboxes in the quick-add form. Example: BOB, DealFlow, L10',
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

		// -------------------- Dialog --------------------
		const dialog = await joplin.views.dialogs.create(DIALOG_ID);
		await joplin.views.dialogs.setButtons(dialog, [
			{ id: 'ok', title: 'Insert' },
			{ id: 'cancel', title: 'Cancel' },
		]);
		await joplin.views.dialogs.setFitToContent(dialog, true);

		// -------------------- Command --------------------
		await joplin.commands.register({
			name: 'inlineTodoGui.add',
			label: 'Add Inline TODO…',
			iconName: 'fas fa-square-check',
			execute: async () => {
				const { token, defaultTags, dateFirst } = await getSettings();

				await joplin.views.dialogs.setHtml(
					dialog,
					buildDialogHtml(defaultTags, token),
				);

				const result = await joplin.views.dialogs.open(dialog);
				if (!result || result.id !== 'ok') return;

				const form = (result.formData && result.formData.main) || {};
				const text = (form.text || '').trim();
				if (!text) {
					await joplin.views.dialogs.showToast({
						message: 'Inline TODO not added: task text was empty.',
						type: ToastType.Info,
					});
					return;
				}

				// Collect checked default-tag checkboxes plus any free-text tags.
				const checkedTags: string[] = [];
				for (const key of Object.keys(form)) {
					if (key.startsWith('tag_') && form[key]) {
						const t = sanitizeTag(String(form[key]));
						if (t) checkedTags.push(t);
					}
				}
				const extraTags = parseTagList(form.extraTags || '');
				const tags = parseTagList([...checkedTags, ...extraTags].join(' '));

				const line = buildTodoLine({
					token,
					text,
					due: (form.due || '').trim(),
					tags,
					dateFirst,
				});

				try {
					// Insert at the cursor in the markdown editor.
					await joplin.commands.execute('insertText', `${line}\n`);
					await joplin.views.dialogs.showToast({
						message: 'Inline TODO added.',
						type: ToastType.Success,
					});
				} catch (e) {
					await joplin.views.dialogs.showToast({
						message:
							'Could not insert. Open the note in the Markdown editor (not the rich text editor) and try again.',
						type: ToastType.Error,
					});
				}
			},
		});

		// -------------------- Menu + toolbar --------------------
		await joplin.views.menuItems.create(
			'inlineTodoGuiToolsMenu',
			'inlineTodoGui.add',
			MenuItemLocation.Tools,
			{ accelerator: 'CmdOrCtrl+Alt+T' },
		);

		await joplin.views.toolbarButtons.create(
			'inlineTodoGuiToolbarButton',
			'inlineTodoGui.add',
			ToolbarButtonLocation.EditorToolbar,
		);
	},
});
