// Ollama server, credentials and model selection.
//
// Keys are named rows in `ollama_account`. One row may be active; no active
// row means a local daemon with no authentication. Listing models does not
// prove a key works because ollama.com serves `/api/tags` anonymously, so only
// a real completion earns the Verified badge.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Select from "./Select";
import {
  CLOUD_URL,
  addOllamaAccount,
  deleteOllamaAccount,
  getOllamaAccounts,
  getOllamaConfig,
  setActiveOllamaAccount,
  setSetting,
  updateOllamaAccountKey,
  type OllamaAccount,
} from "./db";
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


export default function OllamaSettings() {
  const [baseUrl, setBaseUrl] = useState(CLOUD_URL);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<OllamaAccount[]>([]);
  const [keyDraft, setKeyDraft] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const active = accounts.find((account) => account.active === 1) ?? null;
  const activeKey = active?.api_key ?? "";

  useEffect(() => {
    Promise.all([getOllamaConfig(), getOllamaAccounts()])
      .then(([config, savedAccounts]) => {
        setBaseUrl(config.base_url);
        setModel(config.model);
        setAccounts(savedAccounts);
        setKeyDraft(savedAccounts.find((account) => account.active === 1)?.api_key ?? "");
        if (config.model) setModels([config.model]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  function run(fn: () => Promise<void>) {
    setError(null);
    setNote(null);
    setBusy(true);
    fn()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  async function check(nextModel: string, url: string, apiKey: string) {
    const reply = await invoke<string>("ollama_check", {
      baseUrl: url,
      model: nextModel,
      apiKey,
    });
    setVerified(true);
    setNote(`Working — ${nextModel} replied “${reply.slice(0, 80) || "(nothing)"}”.`);
  }

  function chooseAccount(value: string) {
    const id = value ? Number(value) : null;
    const next = id === null ? null : accounts.find((account) => account.id === id) ?? null;
    run(async () => {
      await setActiveOllamaAccount(id);
      setAccounts((current) =>
        current.map((account) => ({ ...account, active: account.id === id ? 1 : 0 })),
      );
      setKeyDraft(next?.api_key ?? "");
      setEditingKey(false);
      setRevealKey(false);
      setVerified(false);
      setNote(
        next
          ? `${next.name} will be used for AI requests. Connect or Test to verify its key.`
          : "No API key selected. This is the right choice for a local Ollama.",
      );
    });
  }

  function addAccount(e: { preventDefault: () => void }) {
    e.preventDefault();
    const name = newName.trim();
    const apiKey = newKey.trim();
    run(async () => {
      if (!name) throw new Error("Give this Ollama account a name.");
      if (!apiKey) throw new Error("Paste an API key.");
      if (accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`An Ollama account named “${name}” already exists.`);
      }

      const created = await addOllamaAccount(name, apiKey);
      setAccounts((current) => [
        created,
        ...current.map((account) => ({ ...account, active: 0 as const })),
      ]);
      setKeyDraft(created.api_key);
      setNewName("");
      setNewKey("");
      setEditingKey(false);
      setRevealKey(false);
      setVerified(false);
      setNote(`${created.name} was added and selected.`);
    });
  }

  function saveKey() {
    if (!active) return;
    const apiKey = keyDraft.trim();
    run(async () => {
      if (!apiKey) throw new Error("An API key cannot be empty.");
      await updateOllamaAccountKey(active.id, apiKey);
      setAccounts((current) =>
        current.map((account) =>
          account.id === active.id ? { ...account, api_key: apiKey } : account,
        ),
      );
      setKeyDraft(apiKey);
      setEditingKey(false);
      setRevealKey(false);
      setVerified(false);
      setNote(`${active.name}'s API key was updated.`);
    });
  }

  function cancelKeyEdit() {
    setKeyDraft(activeKey);
    setEditingKey(false);
    setRevealKey(false);
  }

  function removeAccount() {
    if (!active) return;
    run(async () => {
      await deleteOllamaAccount(active.id);
      setAccounts((current) => current.filter((account) => account.id !== active.id));
      setKeyDraft("");
      setEditingKey(false);
      setRevealKey(false);
      setVerified(false);
      setNote(`${active.name} and its API key were removed from this machine.`);
    });
  }

  function connect() {
    const url = baseUrl.trim() || CLOUD_URL;
    run(async () => {
      setVerified(false);
      const names = await invoke<string[]>("ollama_models", { baseUrl: url, apiKey: activeKey });
      await setSetting("base_url", url);
      setBaseUrl(url);
      setModels(names);

      if (model && !names.includes(model)) {
        setModel("");
        await setSetting("model", "");
        setNote(`${names.length} models loaded — your previous one is gone, pick another.`);
      } else if (model) {
        await check(model, url, activeKey);
      } else {
        setNote(`${names.length} models loaded. Pick one to test the selected account.`);
      }
    });
  }

  function chooseModel(next: string) {
    run(async () => {
      setModel(next);
      setVerified(false);
      await setSetting("model", next);
      await check(next, baseUrl.trim() || CLOUD_URL, activeKey);
    });
  }

  return (
    <section className={`mt-6 ${card}`}>
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="rounded-full bg-hover px-2 py-0.5 text-xs text-muted tabular-nums">
          {accounts.length} {accounts.length === 1 ? "key" : "keys"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Choose which Ollama account handles AI requests, or use a local Ollama without a key.
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
        <Select
          id="ollama-account"
          label="Account used for AI"
          disabled={busy || editingKey}
          items={[
            { value: "", label: "No API key", hint: "Local server" },
            ...accounts.map((account) => ({
              value: String(account.id),
              label: account.name,
              hint: `•••• ${account.api_key.slice(-4)}`,
            })),
          ]}
          value={active ? String(active.id) : ""}
          onChange={chooseAccount}
        />
      </div>

      {active ? (
        <div className="mt-3 rounded-xl border border-line bg-field p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="ollama-key" className={label}>
              {editingKey ? `Update ${active.name}'s API key` : `${active.name} API key`}
            </label>
            <span className="text-xs text-muted">
              {editingKey ? "Replace the saved value" : "Hidden by default"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="ollama-key"
              type={revealKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              readOnly={!editingKey}
              className={`${input} min-w-52 flex-1 font-mono`}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.currentTarget.value)}
            />
            <button
              type="button"
              className={iconButton}
              aria-pressed={revealKey}
              onClick={() => setRevealKey((shown) => !shown)}
            >
              {revealKey ? "Hide" : "Show"}
            </button>
            {editingKey ? (
              <>
                <button type="button" className={button} onClick={saveKey} disabled={busy}>
                  Save key
                </button>
                <button type="button" className={cancelButton} onClick={cancelKeyEdit} disabled={busy}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={iconButton}
                  onClick={() => {
                    setEditingKey(true);
                    setRevealKey(false);
                  }}
                  disabled={busy}
                >
                  Change
                </button>
                <button
                  type="button"
                  className={iconButton}
                  onClick={removeAccount}
                  disabled={busy}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-line bg-field p-3 text-sm text-muted">
          No cloud account selected. Add one below, or connect to{" "}
          <span className="font-mono">http://localhost:11434</span> without a key.
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Add API key</p>
        <form onSubmit={addAccount} className="mt-3 flex flex-wrap gap-2">
          <input
            aria-label="Ollama account name"
            className={`${input} min-w-40 flex-1`}
            placeholder="Account name (e.g. Personal)"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
          />
          <input
            aria-label="New Ollama API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className={`${input} min-w-52 flex-[2] font-mono`}
            placeholder="Paste API key"
            value={newKey}
            onChange={(e) => setNewKey(e.currentTarget.value)}
          />
          <button type="submit" className={button} disabled={busy}>
            Add key
          </button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <Select
          className="min-w-56 flex-1"
          label="Model"
          placeholder={models.length ? "Select a model…" : "Connect to load models"}
          disabled={busy || editingKey || !models.length}
          items={models.map((name) => ({ value: name, label: name }))}
          value={model}
          onChange={chooseModel}
        />
        <button className={button} onClick={connect} disabled={busy || editingKey}>
          {busy ? "Working…" : "Connect"}
        </button>
        <button
          className={cancelButton}
          onClick={() => run(() => check(model, baseUrl.trim() || CLOUD_URL, activeKey))}
          disabled={busy || editingKey || !model}
        >
          Test
        </button>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-line bg-field p-3 text-xs text-muted">
        <Lightbulb className="mt-px size-4 shrink-0" />
        <span>
          Keys are stored in this app's database on this machine. The selected account's key is
          sent only to the server above. Get a key at{" "}
          <span className="font-mono">ollama.com/settings/keys</span>.
        </span>
      </p>
    </section>
  );
}
