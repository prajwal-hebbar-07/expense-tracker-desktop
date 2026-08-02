---
id: webview-dialogs
type: constraint
status: active
updated: 2026-07-31
links: [stack, settings-schema]
---

# `window.confirm`, `alert`, and `prompt` do not work

The WebView silently ignores all three JavaScript dialog functions. `window.confirm()` **returns `false` immediately without showing anything**, so a guard written the obvious way turns the action it guards into a permanent no-op:

```ts
// BROKEN in this app. confirm() is always false, so this always returns early
// and the delete never runs. It looks like a dead button, not a bug.
if (!window.confirm("Delete this account?")) return;
await deleteAccount(id);
```

This is not a Tauri setting to flip. On macOS, WKWebView routes JS dialogs to its `WKUIDelegate`, and wry (the WebView layer under Tauri, `wry 0.55.1`) implements only two delegate methods — `runOpenPanelWithParameters` for file uploads and `requestMediaCapturePermissionForOrigin`. There is no `runJavaScriptConfirmPanel`, `runJavaScriptAlertPanel`, or `runJavaScriptTextInputPanel`, and WKWebView's documented behaviour when the delegate omits them is to return the default answer without displaying a panel.

Verified 2026-07-31 by reading `wry-0.55.1/src/wkwebview/class/wry_web_view_ui_delegate.rs`. ⚠ Re-check after any wry or Tauri upgrade — if wry adds the panels, `window.confirm` starts working and this node becomes superseded rather than wrong.

## Rules for an agent working here

1. **Never use `window.confirm`, `window.alert`, or `window.prompt`.** They fail silently, which is worse than failing loudly — nothing appears in the console and the UI just seems inert.
2. **Build confirmation in React** for anything inline, as `ConfirmDelete` in `apps/desktop/src/Settings.tsx` does. It needs no dependency and no capability entry.
3. **Reach for `@tauri-apps/plugin-dialog` only when a real OS-modal is required** — a window-blocking prompt on quit, say. It costs a JS dependency, a Rust crate, and a `dialog:*` capability entry, which is why it is not used for a row-level delete.
4. **Put the destructive button second and focus the safe one**, because the guard exists to stop a stray second click landing where the first one did.

## Contract

The in-app pattern, from `Settings.tsx`:

| Element | Behaviour |
|---|---|
| First click on `Delete` | Sets `pending = { table, id }`; the row is replaced by the confirm strip |
| Confirm strip | Names the record and its balance, so what is about to be lost is visible |
| `Cancel` | `autoFocus`ed and placed left of `Delete`, so Enter and a repeat click both cancel |
| `Escape` | Clears `pending` via a `keydown` listener mounted only while `pending` is set |
| `Delete` | Runs the `DELETE`, then clears `pending` |

Only one record can be pending at a time — `pending` is a single value, not a set. Starting a delete also clears any in-progress balance edit, so the two inline modes cannot both own a row.

## Anti-patterns

- **`if (!confirm(...)) return;`** — the exact failure this node exists for. In review it looks correct and ships a dead button.
- **A bare `onClick={() => remove(id)}`** on a destructive action. Rule 2.
- **Adding `@tauri-apps/plugin-dialog` for one confirmation.** Rule 3.
- **Putting `Delete` where the trigger button was**, so a double click confirms itself. Rule 4.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A button does nothing, no console error | `window.confirm`/`alert` in its handler returning the default | Replace with the React pattern above |
| Delete fires with no confirmation | Handler wired straight to the delete rather than to `setPending` | Rule 2 |
| Escape does not cancel | The `keydown` effect is not mounted, or it early-returns because `pending` is null | The effect must depend on `pending` and register only while it is set |
