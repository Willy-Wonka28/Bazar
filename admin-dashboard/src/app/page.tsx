"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, SquareTerminal, ShieldAlert, Cpu, Database } from "lucide-react";

export default function Dashboard() {
  const [logs, setLogs] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the terminal to the bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const runAgent = async (agentName: string) => {
    if (isRunning) return;

    setIsRunning(true);
    setActiveAgent(agentName);
    setLogs([`> INIT SEQUENCE INITIATED...`, `> ALLOCATING COMPUTE FOR [${agentName.toUpperCase()}]`]);

    try {
      const response = await fetch(`/api/execute?agent=${agentName}`);

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        // Clean up SSE formatting
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.text) {
              setLogs(prev => [...prev, data.text]);
            }
          } catch (e) { /* skip unparseable lines */ }
        }
      }
    } catch (error: any) {
      setLogs(prev => [...prev, `[FATAL EXCEPTION] ${error.message}`]);
    } finally {
      setIsRunning(false);
      setLogs(prev => [...prev, `> SEQUENCE TERMINATED.`]);
    }
  };

  return (
    <main className="min-h-screen p-8 md:p-16 flex flex-col gap-12 selection:bg-gray-800">

      {/* HEADER */}
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl md:text-6xl font-bold tracking-widest text-[#D4AF37] glowing-text">
          BAZAR
        </h1>
        <p className="text-gray-400 text-sm md:text-base uppercase tracking-[0.3em]">
          Agentic Wallet Security Runtime // Command Center
        </p>
      </header>

      {/* DASHBOARD GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">

        {/* LEFT PANEL: AGENT CONTROLLERS */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <h2 className="text-xl border-b border-[#333] pb-2 text-white flex items-center gap-3">
            <Cpu size={24} className="text-gray-400" /> ACTIVE AGENTS
          </h2>

          {/* TRADER AGENT TILE */}
          <div className="bg-[#111] border border-[#222] p-6 rounded-none flex flex-col gap-4 hover:border-gray-500 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg text-white">TRADER AGENT</h3>
                <p className="text-xs text-gray-500 mt-1">UUID: trader-agent-001</p>
              </div>
              <div>
                <Database size={32} className="text-gray-600" />
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Swaps SOL → USDC on Jupiter v6 DEX. Policy engine validates all program IDs before signing.
            </p>
            <button
              onClick={() => runAgent('trader-agent')}
              disabled={isRunning}
              className="mt-4 bg-white text-black py-3 font-bold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {isRunning && activeAgent === 'trader-agent' ? 'EXECUTING...' : 'LAUNCH SEQUENCE'} <Play size={16} />
            </button>
          </div>

          {/* TREASURY AGENT TILE */}
          <div className="bg-[#111] border border-[#222] p-6 rounded-none flex flex-col gap-4 hover:border-gray-500 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg text-white">TREASURY VAULT</h3>
                <p className="text-xs text-gray-500 mt-1">UUID: treasury-agent-002</p>
              </div>
              <div>
                <ShieldAlert size={32} className="text-gray-600" />
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Secured corporate vault processing strictly allowed micro-payouts.
            </p>
            <button
              onClick={() => runAgent('treasury-agent')}
              disabled={isRunning}
              className="mt-4 border border-white text-white py-3 font-bold hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {isRunning && activeAgent === 'treasury-agent' ? 'EXECUTING...' : 'LAUNCH SEQUENCE'} <Play size={16} />
            </button>
          </div>

        </div>

        {/* RIGHT PANEL: LIVE EXECUTION TERMINAL */}
        <div className="lg:col-span-2 flex flex-col h-[600px] border border-[#333] bg-[#050505]">
          <div className="bg-[#111] border-b border-[#333] p-4 flex justify-between items-center">
            <h2 className="text-sm text-gray-400 flex items-center gap-2"><SquareTerminal size={18} /> RUNTIME // LIVE_EXECUTION_STDOUT</h2>
            <div className="flex gap-2">
              {/* Terminal Dots */}
              <div className="w-3 h-3 rounded-full bg-[#333]"></div>
              <div className="w-3 h-3 rounded-full bg-[#333]"></div>
              <div className="w-3 h-3 rounded-full bg-white"></div>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed"
          >
            {logs.length === 0 ? (
              <p className="text-gray-600 animate-pulse">Awaiting operator instruction...</p>
            ) : (
              logs.map((log, i) => (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  key={i}
                  className={`mb-2 ${log.includes('ERROR') || log.includes('BLOCKED') || log.includes('HALTED') || log.includes('VIOLATION')
                    ? 'text-red-500 font-bold'
                    : log.includes('Success') || log.includes('Confirmed') || log.includes('✅')
                      ? 'text-white font-bold'
                      : 'text-gray-400'
                    }`}
                >
                  {log}
                </motion.div>
              ))
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
