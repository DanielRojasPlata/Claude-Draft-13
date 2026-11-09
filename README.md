# Guionista

A screenplay editor with industry-standard formatting, live pagination, revisions, reports, import/export and a built-in writing assistant.

## Use the app (Windows)

Run **`desktop/dist/Guionista-Portable.exe`**. It is one portable file: no installer, no admin rights.
Your scripts are saved as plain JSON files in a `GuionistaData` folder **next to the .exe** (copy that folder to move your work; if the .exe sits in a read-only place the folder is created in your user profile instead).

### Writing
| Key | Action |
|---|---|
| Tab / Shift-Tab | Cycle the element type (Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, General), wrapping at both ends |
| Enter | New element with the next-logical type (Scene Heading→Action, Character→Dialogue, Parenthetical→Dialogue, Dialogue→Character, Transition→Scene Heading) |
| Ctrl-B / I / U | Bold / italic / underline |
| Ctrl-Z / Ctrl-Shift-Z | Undo / redo (element-level, 1000 steps) |
| Ctrl-F · Ctrl-G · Ctrl-S · Ctrl-P | Find & replace · go to scene/page · save · print / PDF |

SmartType suggests characters, extensions, locations and times of day from the script itself. Enter accepts, Esc dismisses, nothing is inserted on blur.

Select text across scenes and pages with the mouse (drag, Shift+click) or the keyboard (Shift+arrows, Ctrl+A); copy, cut, delete, format and replace work on the whole selection.

### Features
Scene Navigator (drag or ▲▼ to reorder, live scene numbers) · dual dialogue · title page · header/footer/watermark · (MORE)/(CONT'D) control (automatic `NAME (CONT'D)` when a speaker continues in the same scene) · revision mode with colours, left-margin asterisks and locked page numbers (12A, 12B) · reports (scene, character, cast, location, script/pages) with CSV export · import `.fountain` / `.txt` / `.fdx` · export Fountain, Final Draft XML and PDF · Day / Night / Midnight modes.

### Writing assistant (top-right "Assistant" button)
The free web versions of **Claude, ChatGPT and Gemini** open inside the panel (desktop app). There is no API key: sign in on the site once and it remembers you. "Paste into chat" copies the current scene, the selection or the whole script and pastes it into the chat box.

### Page layout defaults
Document → Page Layout: **Save as default for new scripts** keeps your margins, font and per-element formatting for every new script (like "Set as Default" in Word). **Reset to original** puts the open script back to the layout the program shipped with; **Forget my saved default** makes new scripts use the original layout again.

### Your work is safe
Every change is saved automatically within a second, on closing a window the app finishes saving first, and the script is also written as a `.fdx` file. `GuionistaData/backups` keeps rolling safety copies of every script (and of scripts you delete). If the editor engine or a window crashes it restarts by itself from the saved copy.

### PDF
Letter 8.5×11in, margins 1.5in left / 3 cm right / 1in top and bottom (all adjustable in Document → Page Layout, per element too), Courier Prime 12pt, 54 lines per page, element indents per the screenplay standard.

## Develop

```bash
pnpm install
docker compose up -d && pnpm db:push && pnpm db:seed   # web mode only (Postgres)
pnpm dev                                               # http://localhost:3000  (demo@guionista.app / guionista-demo)
pnpm test && pnpm typecheck && pnpm build

cd desktop && npm install && node node_modules/electron/install.js
npm run dist:win        # builds desktop/dist/Guionista-Portable.exe (cross-builds from Linux)
npm run e2e             # drives the real desktop shell end to end (needs xvfb)
node e2e/pdf-check.mjs file.pdf   # measures an exported PDF against the spec
```

Web mode stores scripts in Postgres through Prisma behind Auth.js sign-in; the desktop app uses the same UI and engine with a file-backed store and no sign-in. See `DECISIONS.md`.
