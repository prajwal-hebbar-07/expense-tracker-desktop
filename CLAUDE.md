# Rules

- Use `pnpm` for all Node package operations. Never `npm` or `yarn`.
  - `pnpm add` / `pnpm add -D`, `pnpm install`, `pnpm dlx`, `pnpm run <script>`
  - Scaffolding too: `pnpm create tauri-app`, not `npm create`.

- Every document in `docs/` is written for an AI coding agent to act on, not for prose reading. The user will ask questions by pointing at a document, so each one must answer them without the conversation that produced it.

  Required in every doc:
  - **Frontmatter**: `id`, `type` (decision | constraint | alternative | reference), `status`, `updated`, `links`.
  - **One topic per file.** Split rather than append a second subject. Cross-reference with `[[id]]`.
  - **Contracts, not descriptions.** Exact paths, table/column names, request and response shapes, env vars, error codes — the literal strings an agent will type.
  - **Rules as numbered imperatives**, each with its reason. "Do X because Y", not "X is generally preferred".
  - **State the anti-patterns.** What not to do, and what the mistake looks like in review.
  - **Failure modes** as a symptom → cause → action table where the topic can fail at runtime.
  - **Mark uncertainty with ⚠** and say what to verify. Never present a recalled API detail as settled fact.
  - **Record superseded decisions** as their own node with `status: superseded` and `superseded-by:`. Don't delete history.

  Node skeleton:

  ```markdown
  ---
  id: ollama-flow
  type: decision
  status: active        # active | superseded | fallback
  updated: 2026-07-31
  links: [ollama-flow-fallback]
  ---

  # Title

  One-paragraph answer to "what is this and why".

  ## Rules for an agent working here
  1. Do X, because Y.

  ## Contract
  Exact shapes, paths, names.

  ## Failure modes
  | Symptom | Cause | Action |
  ```

- Structure `docs/` as a **memory graph** (Karpathy-style agent memory), not a manual. Prefer this whenever the content allows; fall back to a plain document only when a topic genuinely refuses to split.
  1. **Many small nodes beat one long doc.** If a file needs two `##` sections that a reader would arrive at separately, it's two nodes.
  2. **Links are the structure.** A node earns its place by what it connects to. `[[id]]` pointing at a node that doesn't exist yet is valid — it marks one worth writing, not an error.
  3. **Append, don't rewrite.** A changed decision becomes a new node plus a `status: superseded` marker on the old one. The graph keeps its history; that history is what stops a question from being re-litigated.
  4. **Write the node when the decision is made**, not at the end. A decision recorded three days late has already lost its reasoning.
  5. **No index until it hurts.** Two nodes don't need a map of themselves. Add one past roughly six.
