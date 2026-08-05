// Where the AI backend is pointed and which model it uses.
//
// Connect saves the server and key and loads the model list. It deliberately
// does NOT claim the key works: ollama.com answers /api/tags anonymously, so
// the list looks identical with a wrong key, a revoked key, or none at all.
// Proving the key takes a real completion — that is `ollama_check`, which runs
// automatically once a model is chosen and again on demand from Test.
//
// The key is a `settings` row (`api_key`) in the app's own database, not the
// OS keychain — see docs/ollama-key-in-settings.md for that trade and what it
// costs. The field stays WRITE-ONLY anyway: the value is readable now, but
// putting a live credential on screen buys nothing. Leaving the field blank on
// an already-configured app therefore means "keep the stored key", not "clear
// it"; clearing is the explicit Remove button, which writes ''.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Select from "./Select";
import { CLOUD_URL, getSettings, setSetting } from "./db";
import {
  button,
  cancelButton,
  card,
  errorBox,
  h2,
  iconButton,
  input,
  label,
  noticeBox,
} from "./ui";
import { Check, Lightbulb } from "./icons";

/** CLOUD_URL comes from db.ts: a local daemon at `http://localhost:11434` needs
 *  no key, and the same two fields cover it, so there is no cloud/local switch. */
export default function OllamaSettings() {
  const [baseUrl, setBaseUrl] = useState(CLOUD_URL);
  /** What the user has typed now; the stored key is held separately and never
   *  rendered into the field. */
  const [keyDraft, setKeyDraft] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** True only after a completion has come back. Not persisted: a key can be
   *  revoked between launches, so a remembered tick would be a lie. */
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setBaseUrl(s.base_url || CLOUD_URL);
        setModel(s.model || "");
        setKey(s.api_key || "");
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

  /** Sends one real completion. This is the only call that can fail on a bad
   *  key, so it is the only one whose success means anything.
   *
   *  The key is a parameter rather than read from state: `connect()` tests a
   *  key it has only just saved, and a `setKey` from the same tick has not
   *  landed yet. */
  async function check(m: string, url: string, apiKey: string) {
    const reply = await invoke<string>("ollama_check", { baseUrl: url, model: m, apiKey });
    setVerified(true);
    // Quoting what came back beats a green tick: it shows the round trip
    // happened rather than asserting it did.
    setNote(`Working — ${m} replied “${reply.slice(0, 80) || "(nothing)"}”.`);
  }

  function connect() {
    const url = baseUrl.trim() || CLOUD_URL;
    run(async () => {
      setVerified(false);
      // Blank keeps what is stored; only a typed value replaces it.
      const apiKey = keyDraft.trim() || key;
      if (keyDraft.trim()) {
        await setSetting("api_key", apiKey);
        setKey(apiKey);
        setKeyDraft("");
      }
      const names = await invoke<string[]>("ollama_models", { baseUrl: url, apiKey });
      await setSetting("base_url", url);
      setBaseUrl(url);
      setModels(names);

      // A saved model the server no longer offers is a silent wrong answer
      // later, so drop it here, where there is something to say about it.
      if (model && !names.includes(model)) {
        setModel("");
        await setSetting("model", "");
        setNote(`${names.length} models loaded — your previous one is gone, pick another.`);
      } else if (model) {
        await check(model, url, apiKey);
      } else {
        // Not "connected": nothing here has authenticated yet.
        setNote(`${names.length} models loaded. Pick one to test the key.`);
      }
    });
  }

  function removeKey() {
    run(async () => {
      // '' is the absent key, not a stored empty one: every has-a-key test in
      // the app is a truthiness check on this row.
      await setSetting("api_key", "");
      setKey("");
      setKeyDraft("");
      setVerified(false);
      setNote("API key removed from this machine.");
    });
  }

  function chooseModel(next: string) {
    run(async () => {
      setModel(next);
      setVerified(false);
      await setSetting("model", next);
      // Test immediately: picking a model is the moment the user wants to know
      // whether the whole chain works, and it costs a few tokens.
      await check(next, baseUrl.trim() || CLOUD_URL, key);
    });
  }

  const hasKey = key !== "";

  return (
    <section className={`mt-6 ${card}`}>
      <div className="flex items-center gap-2">
        <h2 className={h2}>AI model</h2>
        {model && (
          <span className="rounded-full bg-accent-weak px-2 py-0.5 text-xs text-accent">
            {model}
          </span>
        )}
        {verified && (
          <span className="flex items-center gap-1 rounded-full bg-credit-weak px-2 py-0.5 text-xs text-credit">
            <Check className="size-3" />
            Verified
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
          {busy ? "Working…" : "Connect"}
        </button>
        {/* Re-runs the completion without changing anything — for a key that
            worked yesterday and may have been revoked since. */}
        <button
          className={cancelButton}
          onClick={() => run(() => check(model, baseUrl.trim() || CLOUD_URL, key))}
          disabled={busy || !model}
        >
          Test
        </button>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-line bg-field p-3 text-xs text-muted">
        <Lightbulb className="mt-px size-4 shrink-0" />
        <span>
          The key is stored in this app's database on this machine, and is sent only to the
          server above. Get one at <span className="font-mono">ollama.com/settings/keys</span>.
        </span>
      </p>
    </section>
  );
}
