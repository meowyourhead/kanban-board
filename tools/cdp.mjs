// Evaluate JavaScript in the running app (or capture a screenshot) over the WebView2
// DevTools protocol. Start the app with tools\dev-run.cmd first.
//
//   node tools\cdp.mjs "document.title"
//   node tools\cdp.mjs "$env:TEMP\shot.png" --screenshot
//
// Optional: set CDP_PORT (default 9222).

const port = process.env.CDP_PORT || 9222;
const argument = process.argv[2];
const screenshot = process.argv[3] === '--screenshot';

if (!argument) {
  console.error('usage: node tools\\cdp.mjs "<js expression>"');
  console.error('       node tools\\cdp.mjs "<output.png>" --screenshot');
  process.exit(2);
}

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target =
  list.find((t) => t.type === 'page' && t.url.includes('kanban.localhost')) ||
  list.find((t) => t.type === 'page');
if (!target) {
  console.error('No page target found. Is the app running with the debug port enabled?');
  process.exit(3);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

function command(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

if (screenshot) {
  const shot = await command('Page.captureScreenshot', { format: 'png' });
  const fs = await import('node:fs');
  fs.writeFileSync(argument, Buffer.from(shot.result.data, 'base64'));
  console.log(argument);
  ws.close();
  process.exit(0);
}

const response = await command('Runtime.evaluate', {
  expression: argument,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
});

if (response.result && response.result.exceptionDetails) {
  console.error(JSON.stringify(response.result.exceptionDetails, null, 2));
  ws.close();
  process.exit(1);
}

const result = response.result && response.result.result;
console.log(JSON.stringify(result ? result.value : null, null, 2));
ws.close();
