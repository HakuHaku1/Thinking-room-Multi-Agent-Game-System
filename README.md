# The Thinking Room

A five-game board-game arcade: chess, tic-tac-toe, checkers, Connect Four, and Gomoku. The opponent can use a local Ollama model coordinated as a small multi-agent team, or the built-in game AI when Ollama is unavailable.

## Run the app


To start manually:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Enable the Ollama agent team

1. Install and start Ollama for Windows.
2. In a terminal, download the default model:

```powershell
   ollama pull llama3.2:3b
```

3. Keep the Ollama service running, then refresh the app. It checks the local service at `http://localhost:11434` and shows whether the configured model is available.

By default, the app uses `llama3.2:3b`. To change the model or local service URL, set `OLLAMA_MODEL` or `OLLAMA_BASE_URL` in `.env.local`, then restart Next.js. See `.env.example` for the defaults. Ollama runs on your computer; no Anthropic key or cloud API billing is used.

Each AI move is coordinated by three roles using the local model: **Strategist** proposes an attacking move, **Challenger** independently looks for threats and defenses, and **Referee** chooses from the legal-move list and gives the player a short explanation. A separate **Conversational** role handles chat about the board and decision. After a completed game, the **Coach** role reviews the recorded moves and returns a strength, improvement, and next-game tip.

The session win-rate display uses decisive games (wins and losses, excluding draws) and targets 50%. The agent prompt adjusts its challenge when either side leads by at least two wins: it raises pressure when the player is ahead and eases pressure when the agent team is ahead. This is adaptive tuning, not a guarantee that every session or individual match will finish exactly 50/50. The game rules engine remains responsible for validating and applying every move. If Ollama is unavailable, the built-in local game AI can still play, but Ollama-powered chat and post-game coaching require the local model to be running.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Team

| Member | Role |
| --- | --- |
| Hakuryu Acosta Kato | Full Stack Developer / AI Engineer / Project Lead |
| Luis Fernando A. Nival | Backend Developer/ UI/UX Designer |
| Zerwin Kurt D. Ventura | Quality Assurance Tester / Documentation / Researcher|
| Mickaela Paula R. Orillosa | Quality Assurance Tester/ Documentation / Researcher  |
