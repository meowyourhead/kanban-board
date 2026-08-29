// Node runner for tests/smoke.html — loads the page in jsdom with a real
// (non-opaque) origin so localStorage works, waits for the report to finish,
// prints it, and exits non-zero on any FAIL.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = path.join(here, 'smoke.html');

// Inline the external <script src> tags so no resource loading is needed.
let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = fs.readFileSync(path.resolve(here, src), 'utf8');
  return '<script>\n' + code + '\n</script>';
});

const dom = new JSDOM(html, {
  url: 'http://localhost/smoke.html', // opaque file:// origins have no localStorage in jsdom
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});

const { window } = dom;

const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  if (window.document.title === 'SMOKE-OK' || window.document.title === 'SMOKE-FAIL') break;
  await new Promise((r) => setTimeout(r, 50));
}

const report = window.document.getElementById('report');
const text = report ? report.textContent : '(no report produced — page never finished)';
console.log(text);

const passed = window.document.title === 'SMOKE-OK';
window.close();
process.exit(passed ? 0 : 1);
