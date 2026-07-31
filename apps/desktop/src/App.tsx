import { useState } from "react";
import Settings from "./Settings";
import AddTransaction from "./AddTransaction";
import Transactions from "./Transactions";
import "./App.css";

// Switching tabs remounts the page, which is what makes a freshly added
// transaction show up on the Transactions list without any shared state.
const tabs = { overview: AddTransaction, transactions: Transactions, settings: Settings };
type Tab = keyof typeof tabs;

function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const Page = tabs[tab];

  return (
    // One nav, two shapes: a sticky top bar in a half-screen window, a side rail
    // once there is room for one. `lg:flex-col` on the same element does it, so
    // there is no second copy of the tabs to keep in sync.
    <div className="min-h-screen bg-bg font-sans text-ink lg:grid lg:grid-cols-[13rem_1fr]">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center gap-4 px-4 py-3 lg:h-full lg:flex-col lg:items-stretch lg:gap-8 lg:py-6">
          <p className="text-sm font-semibold tracking-tight lg:px-3">Expenses</p>
          <nav className="flex flex-1 gap-1 lg:flex-none lg:flex-col">
            {(Object.keys(tabs) as Tab[]).map((name) => (
              <button
                key={name}
                onClick={() => setTab(name)}
                aria-current={tab === name ? "page" : undefined}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm capitalize transition-colors lg:text-left ${
                  tab === name
                    ? "bg-accent/12 font-medium text-accent"
                    : "text-muted hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {name}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="min-w-0">
        <Page />
      </main>
    </div>
  );
}

export default App;
