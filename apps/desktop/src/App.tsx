import { useState } from "react";
import Settings from "./Settings";
import Transactions from "./Transactions";
import "./App.css";

const tabs = { transactions: Transactions, settings: Settings };
type Tab = keyof typeof tabs;

function App() {
  const [tab, setTab] = useState<Tab>("transactions");
  const Page = tabs[tab];

  return (
    <main className="min-h-screen font-sans bg-[#f6f6f6] text-[#0f0f0f] dark:bg-[#2f2f2f] dark:text-[#f6f6f6]">
      <nav className="mx-auto flex w-full max-w-2xl gap-6 px-6 pt-6 text-sm">
        {(Object.keys(tabs) as Tab[]).map((name) => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`cursor-pointer capitalize ${
              tab === name ? "font-medium underline underline-offset-4" : "opacity-60"
            }`}
          >
            {name}
          </button>
        ))}
      </nav>
      <Page />
    </main>
  );
}

export default App;
