// Where the AI backend is pointed and which model it uses.
//
// One "Connect" button does both jobs — it saves the server and key, and proves
// they work by listing models. A separate Save would let the user store a typo
// and only discover it the next time a feature needed the model.
//
// The key field is WRITE-ONLY. The key lives in the OS credential store and no
// command hands it back (see docs/ollama-flow.md), so this screen can say
// whether one is stored but can never show it. Leaving the field blank on an
// already-configured app therefore means "keep the stored key", not "clear it";
// clearing is the explicit Remove button.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Select from "./Select";
import { getSettings, setSetting } from "./db";
import { button, card, errorBox, h2, iconButton, input, label, noticeBox } from "./ui";
import { Lightbulb } from "./icons";

/** ollama.com. A local daemon is `http://localhost:11434` and needs no key —
 *  the same two fields cover it, so there is no cloud/local mode switch. */
const CLOUD_URL = "https://ollama.com";

export default function OllamaSettings() {
  const [baseUrl, setBaseUrl] = useState(CLOUD_URL);
  /** What the user has typed now, never the stored key. */
  const [keyDraft, setKeyDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSettings(), invoke<boolean>("has_ollama_key")])
      .then(([s, stored]) => {
        setBaseUrl(s.base_url || CLOUD_URL);
        setModel(s.model || "");
        setHasKey(stored);
        // Seed the list with the saved choice so the select shows it before
        // anyone reconnects; otherwise a configured app reads as unconfigured.
        if (s.model) setModels([s.model]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  /** Wraps every handler so a rejected promise surfaces here instead of
   *  becoming a silent unhandled rejection. */
  function run(fn: () => Promise<void>) {
    setError(null);
    setNote(null);
    setBusy(true);
    fn()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  function connect() {
    const url = baseUrl.trim() || CLOUD_URL;
    run(async () => {
      if (keyDraft.trim()) {
        await invoke("set_ollama_key", { key: keyDraft.trim() });
        setHasKey(true);
        setKeyDraft("");
      }
      const names = await invoke<string[]>("ollama_models", { baseUrl: url });
      await setSetting("base_url", url);
      setBaseUrl(url);
      setModels(names);
      // A saved model the server no longer offers is a silent wrong answer
      // later, so drop it here, where there is something to say about it.
      if (model && !names.includes(model)) {
        setModel("");
        await setSetting("model", "");
        setNote(`Connected. ${names.length} models — your previous one is gone, pick another.`);
      } else {
        setNote(`Connected. ${names.length} models available.`);
      }
    });
  }

  function removeKey() {
    run(async () => {
      await invoke("set_ollama_key", { key: "" });
      setHasKey(false);
      setKeyDraft("");
      setNote("API key removed from this machine.");
    });
  }

  function chooseModel(next: string) {
    setModel(next);
    setSetting("model", next).catch((e) => setError(String(e)));
  }

  return (
    <section className={`mt-6 ${card}`}>
      <div className="flex items-center gap-2">
        <h2 className={h2}>AI model</h2>
        {model && (
          <span className="rounded-full bg-accent-weak px-2 py-0.5 text-xs text-accent">
            {model}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Connect to Ollama Cloud with an API key, or to a local Ollama at{" "}
        <span className="font-mono">http://localhost:11434</span>, which needs no key.
      </p>

      {error && (
        <p role="alert" className={errorBox}>
          {error}
        </p>
      )}
      {note && !error && <p className={noticeBox}>{note}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ollama-url" className={`${label} mb-1.5 block`}>
            Server
          </label>
          <input
            id="ollama-url"
            className={`${input} w-full`}
            placeholder={CLOUD_URL}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.currentTarget.value)}
          />
        </div>
        <div>
          <span className="mb-1.5 flex items-center justify-between">
            <label htmlFor="ollama-key" className={label}>
              API key
            </label>
            {hasKey && (
              <button className={`${iconButton} -my-1`} onClick={removeKey} disabled={busy}>
                Remove
              </button>
            )}
          </span>
          <input
            id="ollama-key"
            type="password"
            autoComplete="off"
            className={`${input} w-full`}
            placeholder={
              hasKey ? "Stored — type a new key to replace it" : "Leave blank for a local Ollama"
            }
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Select
          className="min-w-56 flex-1"
          label="Model"
          placeholder={models.length ? "Select a model…" : "Connect to load models"}
          disabled={!models.length}
          items={models.map((m) => ({ value: m, label: m }))}
          value={model}
          onChange={chooseModel}
        />
        <button className={button} onClick={connect} disabled={busy}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-line bg-field p-3 text-xs text-muted">
        <Lightbulb className="mt-px size-4 shrink-0" />
        <span>
          The key is kept in your OS keychain, not in this app's database, and is sent only to
          the server above. Get one at <span className="font-mono">ollama.com/settings/keys</span>.
        </span>
      </p>
    </section>
  );
}
