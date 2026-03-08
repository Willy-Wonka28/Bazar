# Bazar Admin Dashboard — Command Center

The Admin Dashboard is a monochromatic Next.js web interface that serves as the operator's **Command Center** for the Bazar runtime. It lets judges (and developers) launch, observe, and verify AI agent execution in real time — without touching a terminal.

## What to Expect

- **Agent Launcher Tiles** — Each registered demo agent (Trader, Treasury) has its own card with a description and a **"Launch Sequence"** button. One click spawns the agent process server-side.
- **Live Execution Terminal** — A full-width terminal panel streams the agent's `stdout`/`stderr` in real time via **Server-Sent Events (SSE)**. You can watch the SDK validate intents, enforce policies, sign transactions, and broadcast to Devnet — all as it happens.
- **Policy Feedback** — Successful transactions appear in white; policy violations and errors are highlighted in red, making it immediately obvious when the SDK blocks a rogue request.
- **Zero Configuration** — The dashboard resolves agent directories automatically. As long as the backend is running and agents are installed, clicking "Launch Sequence" just works.

## How It Works (Under the Hood)

1. The frontend calls `GET /api/execute?agent=<name>`.
2. The Next.js API route spawns the agent as a child process (`npm start` in the agent's directory).
3. Agent output is streamed back to the browser as SSE events.
4. The React UI renders each line with Framer Motion animations and color-codes it by type (error, success, info).

## Running Locally

```bash
cd admin-dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Launch Sequence** on any agent tile.

> **Prerequisite:** The Bazar Backend must be running on port 4000, and agent dependencies must be installed. See the root README for the full setup guide.
