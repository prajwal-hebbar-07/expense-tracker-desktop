// Shared Tailwind class strings. Extracted from Settings so a second screen
// does not fork its own slightly-different input and button.

export const input =
  "rounded-lg border border-black/15 dark:border-white/20 px-3 py-2 text-base " +
  "bg-white text-[#0f0f0f] dark:bg-[#0f0f0f98] dark:text-white outline-none " +
  "focus:border-[#396cd8] transition-[border-color] duration-[250ms]";
export const button =
  "rounded-lg border border-transparent px-4 py-2 text-base font-medium cursor-pointer " +
  "bg-white text-[#0f0f0f] dark:bg-[#0f0f0f98] dark:text-white " +
  "shadow-[0_2px_2px_rgba(0,0,0,0.2)] hover:border-[#396cd8] active:bg-[#e8e8e8] " +
  "dark:active:bg-[#0f0f0f69] transition-[border-color] duration-[250ms]";
export const iconButton = "px-2 py-1 text-sm opacity-60 hover:opacity-100 cursor-pointer";
export const cancelButton =
  "rounded-lg px-4 py-2 text-sm font-medium cursor-pointer bg-white text-[#0f0f0f] " +
  "dark:bg-[#0f0f0f98] dark:text-white shadow-[0_2px_2px_rgba(0,0,0,0.2)] " +
  "border border-transparent hover:border-[#396cd8]";
export const dangerButton =
  "rounded-lg px-4 py-2 text-sm font-medium cursor-pointer bg-red-600 text-white " +
  "hover:bg-red-700 active:bg-red-800 shadow-[0_2px_2px_rgba(0,0,0,0.2)]";
