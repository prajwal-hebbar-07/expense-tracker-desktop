import React from "react";
import ReactDOM from "react-dom/client";
import { db } from "./db";
import App from "./App";

// Importing db opens the connection, which is what runs pending migrations.
// Log here so a failure at startup is visible even before a screen queries.
db.catch((e) => console.error("failed to open expenses.db", e));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
