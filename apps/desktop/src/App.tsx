import { ComponentType, useState } from "react";
import Settings from "./Settings";
import AddTransaction from "./AddTransaction";
import Transactions from "./Transactions";
import { Home, List, Sliders, Wallet } from "./icons";
import "./App.css";

export type Tab = "overview" | "transactions" | "settings";
/** Lets a screen send the user somewhere else — the Settings link in the empty
 *  state of the add form is the only caller so far. */
export type Go = (tab: Tab) => void;

// Switching tabs remounts the page, which is what makes a freshly added
// transaction show up on the Transactions list without any shared state.
// Typed as ComponentType<{ go: Go }> so a screen that ignores `go` can still
// declare no props at all.
const tabs: Record<
  Tab,
  { page: ComponentType<{ go: Go }>; icon: ComponentType<{ className?: string }> }
> = {
  overview: { page: AddTransaction, icon: Home },
  transactions: { page: Transactions, icon: List },
  settings: { page: Settings, icon: Sliders },
};

function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const { page: Page } = tabs[tab];

  return (
    // One nav, two shapes: a sticky top bar in a half-screen window, a side rail
    // once there is room for one. `lg:flex-col` on the same element does it, so
    // there is no second copy of the tabs to keep in sync.
    <div className="min-h-screen bg-bg font-sans text-ink lg:grid lg:grid-cols-[14rem_1fr]">
      <header className="sticky top-0 z-10 border-b border-line bg-rail/95 backdrop-blur lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center gap-4 px-4 py-3 lg:h-full lg:flex-col lg:items-stretch lg:gap-8 lg:px-3 lg:py-6">
          <p className="flex items-center gap-2.5 lg:px-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
              <Wallet />
            </span>
            <span className="text-base font-semibold tracking-tight">Expenses</span>
          </p>
          <nav className="flex flex-1 gap-1 lg:flex-none lg:flex-col">
            {(Object.keys(tabs) as Tab[]).map((name) => {
              const Icon = tabs[name].icon;
              return (
                <button
                  key={name}
                  onClick={() => setTab(name)}
                  aria-current={tab === name ? "page" : undefined}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm capitalize transition-colors ${
                    tab === name
                      ? "bg-accent/15 font-medium text-accent"
                      : "text-muted hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  <Icon className="size-[18px] shrink-0" />
                  {name}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="min-w-0">
        <Page go={setTab} />
      </main>
    </div>
  );
}

export default App;
