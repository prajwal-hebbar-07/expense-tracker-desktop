import { useEffect, useState } from "react";
import { Update, check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// One check at launch, against the manifest named in tauri.conf.json. This is
// the app's only outbound call — see docs/auto-update.md for why it is opt-out
// rather than absent, and what it does when the machine is offline.

export type Stage =
  | { at: "idle" }
  | { at: "available"; update: Update }
  /** `pct` is null until the server sends a content-length. */
  | { at: "downloading"; pct: number | null }
  | { at: "ready" }
  | { at: "failed"; message: string };

export function useUpdate() {
  const [stage, setStage] = useState<Stage>({ at: "idle" });

  useEffect(() => {
    let cancelled = false;
    // A failed check is not an error the user needs: being offline is the
    // normal state of a local-first app, and a banner about it would be noise
    // on every flight. It only ever surfaces an update that actually exists.
    check()
      .then((update) => {
        if (!cancelled && update) setStage({ at: "available", update });
      })
      .catch((e) => console.warn("update check failed", e));
    return () => {
      cancelled = true;
    };
  }, []);

  async function install(update: Update) {
    let total = 0;
    let got = 0;
    setStage({ at: "downloading", pct: null });
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          got += e.data.chunkLength;
          setStage({ at: "downloading", pct: total ? Math.round((got / total) * 100) : null });
        }
        if (e.event === "Finished") setStage({ at: "ready" });
      });
      setStage({ at: "ready" });
      // The new binary is staged; only a relaunch swaps it in. Data lives in
      // Application Support, so nothing here touches the database — pending
      // migrations run when the new build opens it.
      await relaunch();
    } catch (e) {
      setStage({ at: "failed", message: String(e) });
    }
  }

  return { stage, install, dismiss: () => setStage({ at: "idle" }) };
}
