## Obsidian Tools

Utility helpers for running local JS scripts from your vault.

### What it does
- **Run JS**: Opens a compact picker with a dropdown of discovered scripts and a parameters field. Press Enter or click Run. Falls back to a single input if no scripts are found. Executes `<scriptsDir>/<name>.js` and shows the result as a Notice.

### How scripts work
- Location: configurable via Settings → Obsidian Tools → Scripts directory. Default: `_Meta/Scripts`.
- Filename: `name.js` (CommonJS). You can type `name` or `name.js` in the prompt.
- Export a function named `run`:

```js
// _Meta/Scripts/echo.js
exports.run = ({ app, plugin, args }) => {
  return args.join(' ');
};
```

### Using Run JS
1. Open Command Palette → "Run JS".
2. Pick a script from the dropdown.
3. (Optional) Fill the parameters field, e.g., `hello "two words"`.
4. Press Enter or click Run. The result appears as an Obsidian Notice.

Fallback: If no scripts are discovered, a single input is shown. Type the whole command, e.g., `echo "two words"`.

### Running locally from terminal
- Or via the local package script (when inside `_Meta/Scripts`):

```bash
bun run echo -- hello world
```

### Settings
- **Scripts directory**: Relative to vault root (e.g., `_Meta/Scripts`, `scripts`).

### Notes
- Scripts are executed with `require` and must export `run`.
- The input parser supports quoted arguments using `'` or `"`.
- Errors are surfaced via a Notice and logged to the console.
- The picker hides some internal helpers by default (e.g., `_runner.js`).

### Development
- Requirements: bun
- Commands (run inside this plugin folder):
  - `bun install`
  - `bun run dev` (watch)
  - `bun run build` (production bundle)

The bundled files (`main.js`, `manifest.json`, optional `styles.css`) should reside in this plugin directory inside your vault.


