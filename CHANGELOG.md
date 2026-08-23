# Changelog

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
