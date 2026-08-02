import { ComponentType, useState } from "react";
import Settings from "./Settings";
import AddTransaction from "./AddTransaction";
import Transactions from "./Transactions";
import Analytics from "./Analytics";
import Reports from "./Reports";
import { BarChart, FileText, Home, List, Sliders } from "./icons";
import UpdateBanner from "./UpdateBanner";
import "./App.css";

export type Tab =
  | "overview"
  | "transactions"
  | "analytics"
  | "report"
  | "settings";
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
  analytics: { page: Analytics, icon: BarChart },
  report: { page: Reports, icon: FileText },
  settings: { page: Settings, icon: Sliders },
};

function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const { page: Page } = tabs[tab];

  return (
    // The banner sits outside the shell so it spans both columns, and renders
    // nothing at all unless an update is actually waiting.
    <>
      <UpdateBanner />
      {/* One nav, four shapes, all CSS. Five items is where a top bar runs out
          of room, so the sizes below are measured rather than guessed:
            ≥1024   side rail, 216px
            768–1023  top bar with the wordmark (wordmark + 5 labels = 656px)
            588–767   top bar, no wordmark (5 labels alone = 562px)
            <588    icon-only, 5 × 44×44 = 220px
          The wordmark is what gives, and it costs nothing: this is a single
          window, the OS title bar already says LedgerFlow, and the H1 under the
          bar names the screen. */}
      <div className="min-h-screen bg-bg font-sans text-ink lg:grid lg:grid-cols-[13.5rem_1fr]">
        <header className="sticky top-0 z-30 border-b border-line bg-rail/95 backdrop-blur lg:h-screen lg:border-r lg:border-b-0">
          <div className="flex h-[52px] items-center gap-4 px-3 lg:h-full lg:flex-col lg:items-stretch lg:gap-0 lg:px-3 lg:py-4">
            {/* Hidden between 588 and 767: five labelled items need all 588 of
                a 620px window's bar, and the wordmark is the one item that is
                not a destination.

                The mark is rail-only. At md the bar has 50px of headroom over
                the measured 694, and a 24px tile plus its gap spends most of
                it; the rail has a whole 216px column. alt="" because the text
                beside it already says LedgerFlow — a name here reads twice. */}
            <p className="hidden px-2 pb-3.5 text-sm font-semibold tracking-[-0.01em] md:block lg:flex lg:items-center lg:gap-2 lg:pt-1">
              <img src="/icon.png" alt="" className="hidden size-6 lg:block" />
              LedgerFlow
            </p>
            <nav className="flex flex-1 justify-between gap-1 lg:flex-none lg:flex-col lg:justify-start lg:gap-1">
              {(Object.keys(tabs) as Tab[]).map((name) => {
                const Icon = tabs[name].icon;
                const active = tab === name;
                return (
                  <button
                    key={name}
                    onClick={() => setTab(name)}
                    aria-current={active ? "page" : undefined}
                    // The label is the accessible name at every width; below
                    // 588 it is only visually hidden, never dropped.
                    aria-label={name}
                    className={`relative flex size-11 cursor-pointer items-center justify-center gap-2.5 rounded-md text-[13.5px] capitalize transition-colors nav:size-auto nav:h-9 nav:justify-start nav:px-2.5 lg:h-9 lg:w-full ${
                      active
                        ? "font-medium text-ink nav:text-ink lg:bg-accent-weak"
                        : "text-muted hover:bg-hover hover:text-ink"
                    }`}
                  >
                    {/* Active marker: a 2px underline on the bar, a 2px left bar
                        in the rail. One element, repositioned — the rail is the
                        same nav rotated, and so is its marker. */}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent lg:inset-x-auto lg:top-2 lg:bottom-2 lg:left-0 lg:h-auto lg:w-0.5"
                      />
                    )}
                    <Icon
                      className={`size-[18px] shrink-0 ${active ? "text-accent" : ""}`}
                    />
                    <span className="hidden nav:inline">{name}</span>
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
    </>
  );
}

export default App;
