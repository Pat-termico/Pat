const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];
const TIMEOUT_MS = 120_000;
const startedAt = Date.now();

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, { timeout: 1500 }, (res) => {
      const ok = res.statusCode >= 200 && res.statusCode < 500;
      res.resume();
      resolve(ok ? port : null);
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

async function findVite() {
  while (Date.now() - startedAt < TIMEOUT_MS) {
    for (const p of PORTS) {
      const alive = await checkPort(p);
      if (alive) return alive;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Vite nao iniciou em nenhuma das portas ${PORTS.join(",")} em ${TIMEOUT_MS}ms`);
}

findVite()
  .then((port) => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`[wait-for-vite] Vite detectado em ${url}`);
    process.env.VITE_DEV_SERVER_URL = url;

    const electronCli = require.resolve("electron/cli.js", { paths: [process.cwd()] });
    const child = spawn(process.execPath, [electronCli, "."], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    });
    child.on("exit", (code, sig) => {
      process.exit(code ?? 0);
    });
    child.on("error", (err) => {
      console.error("[wait-for-vite] Electron spawn error:", err);
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("[wait-for-vite] falhou:", err.message);
    process.exit(1);
  });
