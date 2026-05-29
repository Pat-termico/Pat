const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fsSync = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs/promises");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function readArgValue(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => typeof a === "string" && a.startsWith(pref));
  if (!hit) return null;
  const val = hit.slice(pref.length).trim();
  return val ? val : null;
}

function getPreferredSerialPath() {
  const fromEnv = String(process.env.ARDUINO_PORT || "").trim();
  if (fromEnv) return fromEnv;
  return readArgValue("serialPort") || readArgValue("com") || readArgValue("port");
}

function getPreferredBaudRate() {
  const fromEnv = String(process.env.ARDUINO_BAUD || "").trim();
  const fromArg = readArgValue("baud") || readArgValue("baudRate");
  const raw = fromEnv || fromArg || "";
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 300 && n <= 2000000) return n;
  return 9600;
}

let serialDepsPromise = null;
async function loadSerialDeps() {
  if (!serialDepsPromise) {
    serialDepsPromise = Promise.all([import("serialport"), import("@serialport/parser-readline")]).then(
      ([sp, pr]) => {
        const SerialPort = sp.SerialPort || (sp.default && sp.default.SerialPort);
        const ReadlineParser = pr.ReadlineParser || (pr.default && pr.default.ReadlineParser);
        if (!SerialPort || !ReadlineParser) throw new Error("Falha ao carregar dependências de serial");
        return { SerialPort, ReadlineParser };
      }
    );
  }
  return serialDepsPromise;
}

function createIoServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  return new Promise((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 4317;
      const socketUrl = `http://127.0.0.1:${port}`;
      resolve({ io, httpServer, socketUrl });
    });
  });
}

function parseCsvLine(line) {
  const raw = String(line ?? "").trim();
  const matches = raw.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 5) return null;
  const nums = matches.slice(0, 6).map((p) => Number(p));
  if (nums.length < 5 || nums.some((n) => !Number.isFinite(n))) return null;

  const isLegacyWithT3 = nums.length >= 6;
  const t1 = nums[0];
  const t2 = nums[1];
  const temp = isLegacyWithT3 ? nums[3] : nums[2];
  const hum = isLegacyWithT3 ? nums[4] : nums[3];
  const voc = isLegacyWithT3 ? nums[5] : nums[4];
  return {
    t1,
    t2,
    temp,
    hum,
    voc,
    raw,
    ts: Date.now()
  };
}

function parseTextLine(line) {
  const raw = String(line ?? "").trim();
  const numberFrom = (re) => {
    const m = raw.match(re);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };

  if (/^T1:/i.test(raw)) return { kind: "value", patch: { t1: numberFrom(/T1:\s*([-+]?\d+(?:\.\d+)?)/i) } };
  if (/^T2:/i.test(raw)) return { kind: "value", patch: { t2: numberFrom(/T2:\s*([-+]?\d+(?:\.\d+)?)/i) } };

  if (/Temp\s*Ambiente:/i.test(raw))
    return { kind: "value", patch: { temp: numberFrom(/Temp\s*Ambiente:\s*([-+]?\d+(?:\.\d+)?)/i) } };
  if (/Umidade:/i.test(raw)) return { kind: "value", patch: { hum: numberFrom(/Umidade:\s*([-+]?\d+(?:\.\d+)?)/i) } };
  if (/Pressao:/i.test(raw))
    return { kind: "value", patch: { pressure: numberFrom(/Pressao:\s*([-+]?\d+(?:\.\d+)?)/i) } };
  if (/VOC\s*\/\s*Gas:/i.test(raw))
    return { kind: "value", patch: { voc: numberFrom(/VOC\s*\/\s*Gas:\s*([-+]?\d+(?:\.\d+)?)/i) } };

  if (/^=+\s*BME680\s*=+/i.test(raw)) return { kind: "startFrame" };
  if (/^-{10,}/.test(raw)) return { kind: "endFrame" };

  return null;
}

async function pickArduinoPort(preferredPath) {
  const { SerialPort } = await loadSerialDeps();
  const ports = await SerialPort.list();
  if (!ports.length) return null;

  if (preferredPath) {
    const wanted = preferredPath.toLowerCase();
    const direct = ports.find((p) => String(p.path || "").toLowerCase() === wanted);
    if (direct) return direct;
    const byCom = ports.find((p) => {
      const pp = String(p.path || "").toLowerCase();
      return pp.endsWith(wanted) || pp.includes(wanted);
    });
    if (byCom) return byCom;
    return null;
  }

  const scored = ports
    .map((p) => {
      const man = (p.manufacturer || "").toLowerCase();
      const vid = (p.vendorId || "").toLowerCase();
      const pid = (p.productId || "").toLowerCase();
      let score = 0;
      if (man.includes("arduino")) score += 100;
      if (man.includes("wch") || man.includes("ch340")) score += 40;
      if (man.includes("silicon labs") || man.includes("cp210")) score += 35;
      if (vid === "2341" || vid === "2a03") score += 90;
      if (vid === "1a86") score += 45;
      if (vid === "10c4") score += 40;
      if (p.path && (p.path.toLowerCase().includes("usb") || p.path.toLowerCase().includes("com")))
        score += 10;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.p ?? null;
}

function createSerialBridge(io) {
  let currentPort = null;
  let lastStatus = { connected: false };
  let scanning = false;
  let scanTimer = null;
  let preferredPath = getPreferredSerialPath();
  const baudRate = getPreferredBaudRate();
  let lastInvalidNotifyTs = 0;
  let textFrame = null;
  let textFrameTouched = false;

  const lastGood = {
    t1: 0,
    t2: 0,
    temp: 0,
    hum: 0,
    pressure: 1012,
    voc: 0
  };

  function emitStatus(next) {
    lastStatus = { ...lastStatus, ...next };
    io.emit("status", lastStatus);
  }

  function emitSensorSnapshot({ ts, raw, patch }) {
    if (patch) {
      const allowed = new Set(["t1", "t2", "temp", "hum", "pressure", "voc"]);
      for (const [k, v] of Object.entries(patch)) {
        if (!allowed.has(k)) continue;
        if (Number.isFinite(v)) lastGood[k] = v;
      }
    }
    const payload = {
      t1: lastGood.t1,
      t2: lastGood.t2,
      temp: lastGood.temp,
      hum: lastGood.hum,
      pressure: lastGood.pressure,
      voc: lastGood.voc,
      raw:
        raw ||
        `${lastGood.t1},${lastGood.t2},${lastGood.temp},${lastGood.hum},${lastGood.voc}`,
      ts
    };
    io.emit("sensor", payload);
  }

  function resetTextFrame() {
    textFrame = {};
    textFrameTouched = false;
  }

  function finalizeTextFrame(ts) {
    if (!textFrame || !textFrameTouched) return false;
    emitSensorSnapshot({ ts, patch: textFrame });
    resetTextFrame();
    return true;
  }

  async function closeCurrent() {
    if (!currentPort) return;
    try {
      currentPort.removeAllListeners();
      if (currentPort.isOpen) {
        await new Promise((res) => currentPort.close(() => res()));
      }
    } catch {
    } finally {
      currentPort = null;
    }
  }

  async function connectOnce() {
    const { SerialPort, ReadlineParser } = await loadSerialDeps();
    if (!preferredPath) {
      emitStatus({
        connected: false,
        portPath: undefined,
        manufacturer: undefined,
        error: "Selecione uma porta serial (COM) na lista",
        lastSeenTs: Date.now()
      });
      return false;
    }

    const picked = { path: preferredPath, manufacturer: "manual" };
    if (!picked || !picked.path) {
      const msg = preferredPath
        ? `Porta serial não encontrada: ${preferredPath}`
        : "Arduino não encontrado";
      emitStatus({ connected: false, portPath: preferredPath || undefined, manufacturer: undefined, error: msg });
      return false;
    }

    const port = new SerialPort({
      path: picked.path,
      baudRate,
      autoOpen: false
    });

    await new Promise((resolve, reject) => {
      port.open((err) => (err ? reject(err) : resolve()));
    });

    currentPort = port;
    emitStatus({
      connected: true,
      portPath: picked.path,
      manufacturer: picked.manufacturer,
      baudRate,
      error: undefined,
      lastSeenTs: Date.now()
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: "\n", encoding: "utf8" }));

    parser.on("data", (line) => {
      const ts = Date.now();
      const raw = String(line ?? "").trim();
      let didParse = false;

      const parsedCsv = parseCsvLine(line);
      if (parsedCsv) {
        didParse = true;
        emitStatus({ connected: true, error: undefined, lastSeenTs: parsedCsv.ts });
        io.emit("serialLine", { ts, raw, parsed: true });
        emitSensorSnapshot({ ts: parsedCsv.ts, raw: parsedCsv.raw, patch: parsedCsv });
        return;
      }

      const parsedText = parseTextLine(raw);
      const recognizedText = Boolean(parsedText);
      if (parsedText?.kind === "startFrame") {
        resetTextFrame();
      } else if (parsedText?.kind === "endFrame") {
        didParse = finalizeTextFrame(ts);
      } else if (parsedText?.kind === "value") {
        if (!textFrame) resetTextFrame();
        const patch = parsedText.patch || {};
        for (const v of Object.values(patch)) {
          if (Number.isFinite(v)) {
            textFrameTouched = true;
            break;
          }
        }
        Object.assign(textFrame, patch);
      }

      io.emit("serialLine", { ts, raw, parsed: didParse });
      if (recognizedText) {
        emitStatus({ connected: true, error: didParse ? undefined : lastStatus.error, lastSeenTs: ts });
        return;
      }
      if (!didParse) {
        if (ts - lastInvalidNotifyTs > 2000) {
          lastInvalidNotifyTs = ts;
          emitStatus({ connected: true, error: "Dados recebidos, mas o formato está inválido", lastSeenTs: ts });
        } else {
          emitStatus({ connected: true, lastSeenTs: ts });
        }
        return;
      }

      emitStatus({ connected: true, error: undefined, lastSeenTs: ts });
    });

    port.on("error", (err) => {
      emitStatus({ connected: false, error: err?.message || "Erro serial" });
    });

    port.on("close", () => {
      emitStatus({ connected: false, error: "Conexão serial encerrada" });
      scheduleScan(800);
    });

    return true;
  }

  async function scanLoop() {
    if (scanning) return;
    scanning = true;
    try {
      await closeCurrent();
      await connectOnce();
    } catch (e) {
      emitStatus({ connected: false, error: e?.message || String(e) });
      scheduleScan(1200);
    } finally {
      scanning = false;
    }
  }

  function scheduleScan(delayMs) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanLoop();
    }, delayMs);
  }

  function setPreferredPath(nextPath) {
    preferredPath = String(nextPath || "").trim() || null;
    emitStatus({ connected: false, portPath: preferredPath || undefined });
    scheduleScan(0);
  }

  function start() {
    scanLoop();
    const periodic = setInterval(() => {
      if (currentPort && currentPort.isOpen) return;
      scheduleScan(0);
    }, 2500);

    return async () => {
      clearInterval(periodic);
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      await closeCurrent();
    };
  }

  return { start, getStatus: () => lastStatus, setPreferredPath };
}

async function createMainWindow({ socketUrl }) {
  const win = new BrowserWindow({
    icon: getWindowIconPath(),
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--socketUrl=${socketUrl}`, `--appVersion=${app.getVersion()}`]
    }
  });

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

let disposeSerial = null;

function getWindowIconPath() {
  const candidates = [
    path.join(__dirname, "..", "build", "Logo_web-site.png"),
    path.join(__dirname, "..", "build", "icon.png")
  ];
  for (const p of candidates) {
    if (fsSync.existsSync(p)) return p;
  }
  return undefined;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(async () => {
  const { io, socketUrl } = await createIoServer();
  const serial = createSerialBridge(io);
  disposeSerial = await serial.start();

  ipcMain.handle("dashboard:getStatus", () => serial.getStatus());
  ipcMain.handle("dashboard:listSerialPorts", async () => {
    const { SerialPort } = await loadSerialDeps();
    const ports = await SerialPort.list();
    return ports
      .map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        vendorId: p.vendorId,
        productId: p.productId
      }))
      .sort((a, b) => String(a.path).localeCompare(String(b.path), "pt-BR"));
  });
  ipcMain.handle("dashboard:setSerialPort", async (_event, args) => {
    const portPath = String(args?.portPath || "").trim();
    serial.setPreferredPath(portPath);
    return { ok: true };
  });
  ipcMain.handle("dashboard:exportCsv", async (event, args) => {
    const csvText = String(args?.csvText || "");
    const defaultFileName = String(args?.defaultFileName || "").trim() || "dashboard.csv";
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Exportar dados",
      defaultPath: path.join(app.getPath("documents"), defaultFileName),
      filters: [{ name: "CSV (Excel)", extensions: ["csv"] }]
    });
    if (canceled || !filePath) return { canceled: true };
    const content = csvText.startsWith("\ufeff") ? csvText : `\ufeff${csvText}`;
    await fs.writeFile(filePath, content, "utf8");
    return { canceled: false, filePath };
  });

  io.on("connection", (socket) => {
    socket.emit("status", serial.getStatus());
  });

  await createMainWindow({ socketUrl });
});

app.on("before-quit", async () => {
  if (disposeSerial) await disposeSerial();
});
