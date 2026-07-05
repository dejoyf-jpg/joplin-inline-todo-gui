# Inline TODO Quick Add (Joplin plugin)

A small GUI so you never have to hand-type inline-TODO markdown again.

It pairs with the **Inline TODO** plugin by calebjohn (`plugin.calebjohn.todo`),
which scans your notes for `@TODO` checkbox lines and builds a summary note.
This plugin just adds the *front end*: a form that writes the correctly
formatted line for you.

## What it does

Click the toolbar button (editor toolbar), use **Tools → Add Inline TODO…**,
or press **Ctrl/Cmd+Alt+T**. A dialog opens with:

- **Task** text field
- **Due date** picker (optional calendar input)
- **Tag checkboxes** built from your default tags (BOB, DealFlow, L10 out of the box)
- A **More tags** field for one-off tags

On **Insert**, it drops a line like this at your cursor:

```markdown
- [ ] @TODO Call Scott about Brookfield //2026-07-08 +BOB +DealFlow
```

The calebjohn plugin then picks it up under **Tools → Create TODO summary note**.

## Settings

**Tools → Options → Inline TODO Quick Add**:

- **Task keyword** – default `@TODO`.
- **Default tags (checkboxes)** – comma-separated list shown as checkboxes.
- **Put due date before tags** – controls whether the line reads
  `@TODO text //date +tags` (on) or `@TODO text +tags //date` (off).

## Install

Ready-to-install build: [`publish/com.dejoyf.inlineTodoGui.jpl`](publish/com.dejoyf.inlineTodoGui.jpl).

In Joplin: **Tools → Options → Plugins → Install from file** → pick the `.jpl`,
then restart Joplin.

> Insertion targets the **Markdown editor** (CodeMirror). If you use the rich
> text editor, switch to Markdown for the note before inserting.

## Build from source

```bash
npm install
npm run dist   # outputs publish/com.dejoyf.inlineTodoGui.jpl
```

Scaffolded from the official `generator-joplin` template; only `src/` is custom.
