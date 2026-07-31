import { cancelButton, dangerButton } from "./ui";

/**
 * Two-step delete guard. Deliberately *not* window.confirm(): wry's WKUIDelegate
 * implements no runJavaScriptConfirmPanel, so window.confirm() returns false
 * immediately without showing a dialog and the delete would never fire.
 *
 * Cancel is focused and sits left of Delete, so a stray Enter or a second click
 * in the same spot as the first cancels rather than destroys.
 */
export default function ConfirmDelete({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-3 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2">
      <span className="flex-1 text-sm">
        Delete <span className="font-medium">{label}</span>? This cannot be undone.
      </span>
      <button autoFocus className={cancelButton} onClick={onCancel}>
        Cancel
      </button>
      <button className={dangerButton} onClick={onConfirm}>
        Delete
      </button>
    </div>
  );
}
