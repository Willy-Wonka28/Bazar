import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const agent = searchParams.get('agent'); // 'trader-agent' or 'treasury-agent'

    if (!agent) {
        return new Response("Missing agent query parameter", { status: 400 });
    }

    // Resolve the absolute path to the bazar/agents-demo directory
    // Assuming admin-dashboard is adjacent to agents-demo
    const agentDir = path.resolve(process.cwd(), '../agents-demo', agent);

    // Create a TransformStream to send Server-Sent Events (SSE) to the client
    let controller: ReadableStreamDefaultController;
    const readableStream = new ReadableStream({
        start(c) {
            controller = c;
        }
    });

    const encoder = new TextEncoder();

    // Spawn the agent using ts-node via npm start
    const child = spawn('npm', ['start'], {
        cwd: agentDir,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' }
    });

    // Helper to send SSE formatted messages
    const sendEvent = (data: string) => {
        if (!controller) return;
        try {
            // Send the raw terminal line as data
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: data })}\n\n`));
        } catch (e) {
            console.error("Stream closed");
        }
    };

    child.stdout.on('data', (data) => {
        // Break multiple lines into separate events
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) sendEvent(line.trim());
        }
    });

    child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) {
                // Formatting errors specifically
                sendEvent(`[ERROR] ${line.trim()}`);
            }
        }
    });

    child.on('close', (code) => {
        sendEvent(`[SYSTEM] PROCESS TERMINATED WITH CODE ${code}`);
        try {
            controller.close();
        } catch (e) { /* ignore already closed */ }
    });

    child.on('error', (err) => {
        sendEvent(`[FATAL] Failed to spawn agent: ${err.message}`);
        try {
            controller.close();
        } catch (e) { /* ignore already closed */ }
    });

    return new Response(readableStream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
