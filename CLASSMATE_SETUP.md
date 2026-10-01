# Set Up The Thinking Room on Windows

This guide is for a classmate setting up a fresh copy of the project. The app uses a local Ollama model; it does not need a Claude or Anthropic API key.

## One-time prerequisites

1. Install **Node.js 20.9 or newer** from https://nodejs.org/. This also installs npm.
2. Install **Ollama for Windows** from https://ollama.com/download/windows.
3. Share the project source through Git or a ZIP. Include `package.json`, `package-lock.json`, `start.bat`, and `.env.example`. Do not include `node_modules`, `.next`, or `.git`; `start.bat` installs the dependencies locally.

## Start the application

Double-click `start.bat` in the project folder.

On the first run, the script will:

- Create `.env.local` from `.env.example` if the local settings file is missing.
- Offer to install Ollama with `winget` if it cannot find Ollama.
- Start the local Ollama service if it is not already running.
- Download `llama3.2:3b` if that model is not installed. The download is about 2 GB and happens only once.
- Install the app's npm dependencies if needed.
- Start Next.js.

When the terminal says Next.js is ready, open the Local URL it prints (normally http://localhost:3000). Keep the terminal window open while playing. Close it with `Ctrl+C` when finished.

## If setup stops

- **Node.js or npm missing:** install Node.js 20.9 or newer, close and reopen the terminal, then run `start.bat` again.
- **Ollama not found:** install Ollama from https://ollama.com/download/windows. If it was just installed, reopen the project folder or terminal and try again.
- **Ollama will not start:** open the Ollama app from the Windows Start menu, wait for it to start, and run `start.bat` again.
- **Model download fails:** check the internet connection and run `start.bat` again. It will retry the model pull.
- **The page says Ollama is offline:** keep Ollama running and refresh the page.

The multi-agent opponent uses **Strategist**, **Challenger**, and **Referee** roles. The separate **Coach** reviews completed matches. The session record steers the opponent toward a 50/50 win rate over time, but it cannot guarantee an exact split.