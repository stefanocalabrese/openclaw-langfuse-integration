#!/usr/bin/env node
import { spawn } from 'child_process';

const LANGFUSE_HOST = 'https://langfuse.tideflowai.net';
const LANGFUSE_PUBLIC_KEY = 'pk-lf-6e407d3e-f8f3-438e-9d40-f246fc55c64b';
const LANGFUSE_SECRET_KEY = 'sk-lf-c863bf74-8de0-4583-8df1-bad7d7aad502';
const activeRuns = new Map();
const journal = spawn('journalctl', ['--user', '-u', 'openclaw-gateway.service', '-f', '-o', 'json', '--all']);

journal.stdout.on('data', async (data) => {
  const lines = data.toString().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const message = entry.MESSAGE || '';

      const match = message.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[([^\]]+)\] (.+)$/);
      if (!match) continue;

      const [, component, content] = match;

      // START: Capture run start
      if (content.includes('embedded run start:') && content.includes('runId=')) {
        const runId = content.match(/runId=([a-f0-9-]+)/)?.[1];
        if (runId) {
          activeRuns.set(runId, {
            startTime: new Date(),
            sessionId: content.match(/sessionId=([a-f0-9-]+)/)?.[1],
            model: content.match(/model=([^\s]+)/)?.[1],
            latestText: null,
          });
          console.log(`📊 Trace started: ${runId}`);
        }
      }

      // CAPTURE: Assistant response chunks
      if (content.includes('stream=assistant') && content.includes('text=')) {
        const shortRunId = content.match(/run=([a-f0-9]+)/)?.[1];
        const text = content.match(/text=(.+)$/)?.[1];

        if (shortRunId && text) {
          for (const [fullRunId, run] of activeRuns.entries()) {
            if (fullRunId.startsWith(shortRunId)) {
              run.latestText = text;
              console.log(`💬 Captured: ${text.substring(0, 60)}...`);
              break;
            }
          }
        }
      }

      // DONE: Send to Langfuse
      if (content.includes('embedded run done:') && content.includes('runId=')) {
        const runId = content.match(/runId=([a-f0-9-]+)/)?.[1];
        const duration = content.match(/durationMs=(\d+)/)?.[1];

        if (runId && activeRuns.has(runId)) {
          const run = activeRuns.get(runId);
          await sendToLangfuse(runId, run, duration);
          activeRuns.delete(runId);
          console.log(`✅ Sent to Langfuse: ${runId}`);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
});

async function sendToLangfuse(runId, run, duration) {
  const batch = [
    {
      id: `evt-${runId}`,
      timestamp: run.startTime.toISOString(),
      type: 'trace-create',
      body: {
        id: runId,
        name: 'openclaw-chat',
        userId: 'openclaw-gateway',
        metadata: {
          sessionId: run.sessionId,
          model: run.model,
          durationMs: duration,
        },
        timestamp: run.startTime.toISOString(),
      },
    },
    {
      id: `gen-${runId}`,
      timestamp: run.startTime.toISOString(),
      type: 'generation-create',
      body: {
        id: `gen-${runId}`,
        traceId: runId,
        name: 'llm-response',
        model: run.model || 'gemini-2.5-flash-preview-09-2025',
        startTime: run.startTime.toISOString(),
        endTime: new Date(run.startTime.getTime() + parseInt(duration || 0)).toISOString(),
        input: {
          messages: [{
            role: 'user',
            content: '[See OpenClaw UI for input message]'
          }]
        },
        output: { text: run.latestText || '[No response captured]' },
        metadata: {
          durationMs: duration,
          sessionId: run.sessionId,
        },
      },
    },
  ];

  try {
    const response = await fetch(`${LANGFUSE_HOST}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64')}`,
      },
      body: JSON.stringify({ batch }),
    });

    if (!response.ok) {
      console.error(`❌ Langfuse error: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Failed to send:', error.message);
  }
}

journal.stderr.on('data', (data) => {
  console.error('❌ journalctl error:', data.toString());
});

journal.on('error', (error) => {
  console.error('❌ spawn error:', error);
});

console.log('🦞 OpenClaw → Langfuse bridge running');
console.log('📊 Capturing: assistant output, timing, model info');
console.log('⚠️  User input not available (OpenClaw uses WebSocket-only API)');