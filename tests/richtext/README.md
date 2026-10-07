# Rich Text editor tests

Runs the plugin's Rich Text helper (`src/richTextConvert.js`) inside Joplin's own
TinyMCE build and `joplinLists` plugin in headless Chrome, and checks the Markdown
Joplin would save.

Setup (once, in this folder): `npm i playwright @joplin/turndown @joplin/turndown-plugin-gfm markdown-it esbuild`,
then `npx esbuild conv-entry.js --bundle --outfile=conv.bundle.js`.
Set `JOPLIN_APP` to an extracted `app.asar` of the Joplin version under test.

- `node run.mjs shipped cases.json` (also `more.json`, `stress.json`): scripted selections.
  `node run.mjs old cases.json` replays the 1.4.2 behavior for comparison.
  `HELPER=../../dist/richTextConvert.js` tests the built copy.
- `node mouse.mjs`: real mouse and keyboard selections.
- `node e2e-joplin.mjs`: end to end against an ISOLATED Joplin started with
  (`env -u WAYLAND_DISPLAY` in front, or Electron ignores the virtual display and
  the test window opens on the real desktop; it did on 2026-10-07)
  `--remote-debugging-port=9337 --profile <scratch profile>` whose API token is
  set in that profile's settings.json and listens on port 41185. Never point it
  at a Joplin holding real notes.
- `node probe-joplin.mjs` (`TOKFILE=<file holding the API token> CASES=<json>`; case =
  `{title, body, probe}`): the ground truth for any Markdown shape. Creates notes
  from the given Markdown in the isolated Joplin, prints which list items the real
  editor shows as checkboxes (`[cb]`) or bullets (`[..]`), then types one character
  and prints what Joplin re-saves. The reload check in `methods.js` is a simulation
  of Joplin's renderer; prove a new shape here first.
- `node e2e-regress.mjs` (`TOKFILE=...`, `ONLY=<case id>` filters): the 2026-10-07
  regression suite in the real isolated Joplin (45 list cases, each converted,
  saved, reloaded by leaving and reopening the note, and re-saved once more; the
  second save must be identical). Its rig twins are `reg-lists-1.4.4.json`,
  `stress-lists-1.4.4.json` and `extra-lists-1.4.4.json` for `run.mjs`.
- The isolated instance's plugin toolbar button appears only after its "Toggle
  editors" button is clicked twice (Ctrl+L does nothing there); `e2e-joplin.mjs`
  does that itself.
