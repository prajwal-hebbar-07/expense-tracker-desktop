import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const logo = "h-24 p-6 transition-[filter] duration-[750ms] will-change-[filter]";
const field =
  "rounded-lg border border-transparent px-[1.2em] py-[0.6em] text-base font-medium " +
  "shadow-[0_2px_2px_rgba(0,0,0,0.2)] outline-none transition-[border-color] duration-[250ms] " +
  "bg-white text-[#0f0f0f] dark:bg-[#0f0f0f98] dark:text-white";
const link = "font-medium text-[#646cff] no-underline hover:text-[#535bf2]";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="flex min-h-screen flex-col justify-center pt-[10vh] text-center font-sans bg-[#f6f6f6] text-[#0f0f0f] dark:bg-[#2f2f2f] dark:text-[#f6f6f6]">
      <h1>Welcome to Tauri + React</h1>

      <div className="flex justify-center">
        <a href="https://vite.dev" target="_blank" className={link}>
          <img
            src="/vite.svg"
            className={`${logo} hover:drop-shadow-[0_0_2em_#747bff]`}
            alt="Vite logo"
          />
        </a>
        <a href="https://tauri.app" target="_blank" className={link}>
          <img
            src="/tauri.svg"
            className={`${logo} hover:drop-shadow-[0_0_2em_#24c8db]`}
            alt="Tauri logo"
          />
        </a>
        <a href="https://react.dev" target="_blank" className={link}>
          <img
            src={reactLogo}
            className={`${logo} hover:drop-shadow-[0_0_2em_#61dafb]`}
            alt="React logo"
          />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="flex justify-center"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          className={`${field} mr-[5px]`}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button
          type="submit"
          className={`${field} cursor-pointer hover:border-[#396cd8] active:border-[#396cd8] active:bg-[#e8e8e8] dark:active:bg-[#0f0f0f69]`}
        >
          Greet
        </button>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
