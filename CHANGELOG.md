# Changelog

## 1.4.4

### Fixed

- Rich Text editor: converting one item of a bullet or numbered list no longer
  turns the other items into checkboxes after the note reloads. 1.4.3 split the
  task into its own checklist, but Joplin saved the two lists as one Markdown
  list and, on the next load, rendered every item of it as a checkbox (measured
  in Joplin 3.7.21). The task is now separated from the rest of the list by an
  empty paragraph on each side it touches, which Joplin saves as `&nbsp;` and
  shows as one blank line. The other items stay bullets through every save and
  reload.
- Lists whose items have a blank line between them (Joplin's "loose" form) are
  handled the same way; before, the task ended up nested under an empty bullet
  there (`- - [ ] ...`), where the Inline TODO scanner could not see it.
- A line that already starts with the keyword (for example after converting it
  twice) no longer comes out as `@TODO @TODO ...`, and a due date already in the
  line is not repeated beside the new one.

### Known limitation

- Converting an item that has its own sub-items also turns those sub-items
  into checkboxes when the note is saved. That is how Joplin stores a checkbox
  item's children, not something the plugin controls. (Converting one of the
  sub-items themselves is fine: its sibling sub-items stay bullets.)

## 1.4.3

### Fixed

- Rich Text editor: converting a line that has other lines directly above or
  below it (no blank line between) no longer turns those neighboring lines into
  checkboxes. Only the selected line becomes the task. Joplin's own checklist
  command works on a whole paragraph, and adjacent lines are one paragraph in
  the Rich Text editor, so the plugin now ships a small helper that Joplin loads
  into the Rich Text editor and that converts just the selected line. The same
  applies inside bullet and numbered lists; a numbered list keeps its numbering.
- Rich Text editor: task text containing `<` or `&` is inserted as text, never
  as markup.

### Known limitation

- Converting a list item that has its own sub-items also turns those sub-items
  into checkboxes when the note is saved. That is how Joplin stores a checkbox
  item's children, not something the plugin controls.

## 1.4.2

### Changed

- Listing metadata only, no behavior change. `repository_url` is set to the form
  Joplin's plugin registry has on record for this plugin id, so the registry can
  ingest new releases again. `homepage_url` and the npm `repository` field still
  point at this repository, and Joplin's Report issue link resolves here.

## 1.4.1

### Changed

- New example todo in the README, a neutral tags placeholder in the dialog,
  and clearer code comments. Documentation only, no behavior change.

## 1.4.0 (2026-08-23)

Mobile support (Android).

### Added

- The plugin now declares `platforms: ["desktop", "mobile"]` and runs on
  Joplin mobile. **Minimum Joplin version is now 3.4.2 on ALL platforms**, up
  from 3.0.0 on desktop. A single floor is used deliberately rather than a
  per-platform one: Joplin's manifest parser populates the mobile floor by
  reading the `app_min_version` key, so a separate `app_min_version_mobile`
  entry is never read on the install-from-file path and would leave the real
  mobile floor at whatever `app_min_version` says. Verified in Joplin's
  `manifestFromObject.ts` on the dev branch and at tags v3.0.15 and v3.4.3.
  3.4.2 is also what the companion Inline TODO plugin
  (`plugin.calebjohn.todo` v2.1.1) requires, so anyone who can run the pair
  already meets it. Existing 1.3.0 installs on older Joplin keep working;
  they simply stop being offered updates.
- Mobile trigger: the editor toolbar button (the one location mobile honors
  for plugin toolbar buttons). Mobile has no Tools menu and no keyboard
  accelerators, so those remain desktop only.
- Mobile grab: tap anywhere in the task line. With no selection, the plugin
  takes the whole line, preserves indentation, and strips a leading bullet
  (`- `, `* `, `+ `, `1. `, `1) `) or existing checkbox marker so the marker
  is replaced, not doubled. An explicit selection still takes priority, same
  as desktop. Desktop keeps the cursor-to-end-of-line behavior exactly as
  before.
- Mobile dialog: same dialog, with larger touch targets (inputs, calendar
  day cells, quick buttons). The due date field is a standard date input, so
  Android offers its native date picker; the built-in click-to-pick calendar
  remains available and works by touch.
- Platform detection uses `joplin.versionInfo().platform` at startup, wrapped
  in try/catch; anything unexpected is treated as desktop, which is the
  behavior the plugin always had.

### Unchanged on desktop

- Every desktop path is byte-for-byte the same flow as 1.3.0: toolbar button,
  Tools menu entry, Ctrl/Cmd+Alt+T, cursor-to-end-of-line grab, Rich Text
  editor support via `InsertJoplinChecklist`, the `@` keyword normalization
  guard, and local-calendar date handling (never UTC, never millisecond
  arithmetic).

### iOS status and limitations. Read this before installing on iOS.

- **iOS is untested, and that is permanent, not a gap awaiting a fix.** The
  author has no Apple device, so no release of this plugin has ever been run
  on iOS and none will be verified there.
- There is no iOS-specific code in this plugin. iOS gets exactly the shared
  mobile code path that Android gets, nothing more. That was a deliberate
  choice: an untestable platform-specific branch shipped to strangers is a
  liability.
- What is known secondhand, from Joplin's own changelogs and forum, not from
  running this plugin: Joplin iOS supports plugins and has marked that
  support as beta since iOS v13.0.3 (2024-06-19), with plugin fixes
  continuing through v13.4.x (2025). iOS plugin support has historically
  lagged Android in stability.
- Expected but unverified on iOS: the editor toolbar trigger, the dialog
  rendering and its loaded script, the CodeMirror 6 grab, and the native
  date input behavior. Any of these may differ from Android.
- iOS issues are not tracked or fixed. Android is the supported mobile
  platform. An iOS user is welcome to run this, but should treat it as
  unsupported.

## 1.3.0

- Configurable default due date (including "No date"), per-task keyword
  field, public repository URLs.

## 1.2.x

- Initial published versions: dialog with click-to-pick calendar, tags, and
  keyword; Markdown and Rich Text editor support on desktop.
