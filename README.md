# Inline TODO Quick Add (Joplin plugin)

A small GUI so you never have to hand-type inline-TODO markdown again.

It pairs with the **Inline TODO** plugin by calebjohn (`plugin.calebjohn.todo`),
which scans your notes for `@TODO` checkbox lines and builds a summary note.
This plugin is the front end: it writes the correctly formatted line for you and
turns it into a real, clickable checkbox.

## What it does

Put your cursor in front of a task you have already typed, then click the editor
toolbar button, use **Tools > Convert to Inline TODO**, or press
**Ctrl/Cmd+Alt+T**.

It grabs the text from your cursor to the end of the line (or your selection, if
you have one) and opens a dialog with:

- **Task**, the grabbed text, shown so you can confirm what will be converted
- **Due date**, pre-filled from your configured default, with a click-to-pick
  calendar and Today / Tomorrow / +1 week / Clear buttons
- **Tags**, optional, space or comma separated, no `+` needed
- **Keyword**, pre-filled from your default, changeable per task

On **Convert**, the line becomes a real checkbox:

```markdown
- [ ] @TODO Call Scott about Brookfield //2026-07-08 +BOB +DealFlow
```

This works in **both** the Markdown editor and the Rich Text editor.

The calebjohn plugin then picks it up under **Tools > Create TODO summary note**.

## Settings

**Tools > Options > Inline TODO Quick Add**:

- **Default task keyword**, default `@TODO`. The Inline TODO plugin treats this
  as the task's category and groups the summary note by it, so different
  keywords make different groups. Any `@word` works. You can override it per
  task in the dialog.
- **Default due date**, one of *No date*, *Today*, *Tomorrow* (default),
  *One week out*, *Next Monday*. This is only what the field is pre-filled with;
  you can always change or clear it in the dialog.
- **Put due date before tags**, controls whether the line reads
  `@TODO text //date +tags` (on) or `@TODO text +tags //date` (off).

## Install

**From Joplin** (recommended): **Tools > Options > Plugins**, search for
"Inline TODO Quick Add", install, restart Joplin.

**From file**: grab [`publish/com.dejoyf.inlineTodoGui.jpl`](publish/com.dejoyf.inlineTodoGui.jpl),
then in Joplin use **Tools > Options > Plugins > Install from file** and restart.

## Notes

A task line has to carry at least one of an `@keyword`, a `//date` or a `+tag`,
or the Inline TODO plugin's scanner will not see it. That is why the keyword
always starts with `@`, and why a keyword you type without one gets the `@`
added: it keeps a dateless, tagless task visible in the summary note.

## Build from source

```bash
npm install
npm run dist   # outputs publish/com.dejoyf.inlineTodoGui.jpl
```

Scaffolded from the official `generator-joplin` template; only `src/` is custom.

## Issues and feature requests

Please open an issue on this repository.

## License

MIT
