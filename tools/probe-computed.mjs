#!/usr/bin/env node
/**
 * Computed-style probe: load a URL in headless Chrome and evaluate a JS
 * expression in the page after `load`, printing its JSON result. The one
 * dependency-free way on this VM to check what CSS really resolves to —
 * happy-dom does not cascade `var()`, and piping through a headful
 * devtools session needs an X server.
 *
 *   node tools/probe-computed.mjs <url> <expression-file.js>
 *
 * The expression file holds one JS expression (a promise is awaited). Uses
 * the Chrome DevTools Protocol over Node's built-in fetch + WebSocket; the
 * browser gets a throwaway profile and is killed on exit. `CHROME_ARGS`
 * appends launch flags (space-separated) — e.g. the WebMCP testing features.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, expressionFile] = process.argv.slice(2);
if (!url || !expressionFile) {
  console.error("usage: node tools/probe-computed.mjs <url> <expression-file.js>");
  process.exit(2);
}
const expression = readFileSync(expressionFile, "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = 9222 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "probe-chrome-"));
const chrome = spawn(
  process.env.CHROME ?? "google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    ...(process.env.CHROME_ARGS ?? "").split(/\s+/).filter((arg) => arg !== ""),
    "about:blank"
  ],
  { stdio: "ignore" }
);
// Chrome (and its helper processes) keep writing the profile until they
// have exited, so the directory goes only after the browser is gone, with
// patience for the last flushes. A signal-killed child reports
// `exitCode === null` and `signalCode` set — check both.
const alive = () => chrome.exitCode === null && chrome.signalCode === null;
async function shutdown() {
  if (alive()) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill("SIGTERM");
    await Promise.race([exited, sleep(3000)]);
    if (alive()) {
      chrome.kill("SIGKILL");
      await Promise.race([exited, sleep(1000)]);
    }
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch {
      await sleep(100);
    }
  }
}

const endpoint = `http://127.0.0.1:${port}`;

async function waitForBrowser() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error("Chrome did not start");
}

async function main() {
  await waitForBrowser();
  const created = await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT" });
  const target = await created.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("WebSocket failed"));
  });

  let nextId = 1;
  const pending = new Map();
  const events = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(String(message.data));
    if (data.id !== undefined) {
      const { resolve, reject } = pending.get(data.id) ?? {};
      pending.delete(data.id);
      if (data.error) reject?.(new Error(data.error.message));
      else resolve?.(data.result);
    } else if (events.has(data.method)) {
      events.get(data.method)();
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) => new Promise((resolve) => events.set(method, resolve));

  await send("Page.enable");
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(15000).then(() => { throw new Error("load timed out"); })]);
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text + " " + JSON.stringify(result.exceptionDetails.exception ?? {}));
  }
  console.log(JSON.stringify(result.result.value, null, 2));
  socket.close();
}

main().then(
  async () => {
    await shutdown();
    process.exit(0);
  },
  async (error) => {
    console.error(error.message);
    await shutdown();
    process.exit(1);
  }
);
