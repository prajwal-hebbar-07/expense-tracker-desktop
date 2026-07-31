import React from "react";
import ReactDOM from "react-dom/client";
import Database from "@tauri-apps/plugin-sql";
import App from "./App";

// Opening the database is what runs the pending migrations. Load once here and
// share the handle; a connection per call trips "database is locked".
Database.load("sqlite:expenses.db").catch((e) =>
  console.error("failed to open expenses.db", e),
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
