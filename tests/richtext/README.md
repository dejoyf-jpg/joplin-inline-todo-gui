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
  `--remote-debugging-port=9337 --profile <scratch profile>` whose API token is
  set in that profile's settings.json and listens on port 41185. Never point it
  at a Joplin holding real notes.
