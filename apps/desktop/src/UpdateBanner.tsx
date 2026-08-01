import { button, cancelButton } from "./ui";
import { Info } from "./icons";
import { useUpdate } from "./update";

/**
 * Shown only when an update actually exists. Silent otherwise — including when
 * the check fails, because "could not reach the update server" is not news to
 * someone using an offline-first app on a train.
 */
export default function UpdateBanner() {
  const { stage, install, dismiss } = useUpdate();
  if (stage.at === "idle") return null;

  const busy = stage.at === "downloading" || stage.at === "ready";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-weak px-4 py-2.5 text-sm"
    >
      <Info className="size-4 shrink-0 text-accent" />

      {stage.at === "available" && (
        <>
          <span className="flex-1">
            Version <span className="font-medium">{stage.update.version}</span> is
            available.
            {stage.update.date && (
              <span className="ml-2 text-muted">{stage.update.date.slice(0, 10)}</span>
            )}
          </span>
          <button className={cancelButton} onClick={dismiss}>
            Later
          </button>
          <button className={button} onClick={() => install(stage.update)}>
            Install and restart
          </button>
        </>
      )}

      {busy && (
        <span className="flex-1">
          {stage.at === "ready"
            ? "Installed. Restarting…"
            : stage.pct === null
              ? "Downloading…"
              : `Downloading… ${stage.pct}%`}
        </span>
      )}

      {stage.at === "failed" && (
        <>
          <span className="flex-1 text-danger">Update failed: {stage.message}</span>
          <button className={cancelButton} onClick={dismiss}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
