const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const fsSync = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs/promises");
const { parseCsvLine, parseTextLine, calcularQualidadeVOC } = require("./lib/parsers.cjs");
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch {
  autoUpdater = null;
}

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let autoUpdateCheckTimer = null;

if (isDev || process.env.ELECTRON_LOCAL_DATA) {
  const localDataRoot = path.join(__dirname, "..", ".electron-temp");
  const userDataDir = path.join(localDataRoot, "userData");
  const cacheDir = path.join(localDataRoot, "cache");
  fsSync.mkdirSync(userDataDir, { recursive: true });
  fsSync.mkdirSync(cacheDir, { recursive: true });
  app.setPath("userData", userDataDir);
  app.setPath("cache", cacheDir);
}

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
    t1: null,
    t2: null,
    t3: null,
    temp: null,
    hum: null,
    pressure: null,
    voc: null
  };
  let sessionHistory = [];

  function emitStatus(next) {
    lastStatus = { ...lastStatus, ...next };
    io.emit("status", lastStatus);
  }

  function sessionHistoryPush(row) {
    sessionHistory.push(row);
    const MAX = 10_800;
    if (sessionHistory.length > MAX) {
      sessionHistory = sessionHistory.slice(sessionHistory.length - MAX);
    }
  }

  function getSessionHistory() {
    return sessionHistory.slice();
  }

  function emitSensorSnapshot({ ts, raw, patch, legacy }) {
    const allowed = new Set(["t1", "t2", "t3", "temp", "hum", "pressure", "voc"]);
    if (patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (!allowed.has(k)) continue;
        if (typeof v === "number" && Number.isFinite(v)) {
          lastGood[k] = v;
        } else if (v === null) {
        }
      }
    }
    const payload = {
      t1: lastGood.t1,
      t2: lastGood.t2,
      t3: lastGood.t3,
      temp: lastGood.temp,
      hum: lastGood.hum,
      pressure: lastGood.pressure,
      voc: lastGood.voc,
      raw:
        raw ||
        [lastGood.t1, lastGood.t2, lastGood.t3, lastGood.temp, lastGood.hum, lastGood.pressure, lastGood.voc]
          .map((x) => (typeof x === "number" ? String(x) : ""))
          .join(","),
      ts,
      legacy: Boolean(legacy || false)
    };
    sessionHistoryPush(payload);
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
        emitStatus({ connected: true, error: undefined, lastSeenTs: ts });
        io.emit("serialLine", { ts, raw, parsed: true });
        emitSensorSnapshot({ ts, raw: parsedCsv.raw, patch: parsedCsv.patch, legacy: parsedCsv.legacy });
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

  return {
    start,
    getStatus: () => lastStatus,
    setPreferredPath,
    getSessionHistory,
    clearSessionHistory: () => {
      sessionHistory = [];
    }
  };
}

function yyyymmdd(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hhmmss(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function getBackupBaseDir() {
  const fallbacks = [];
  try {
    fallbacks.push(path.join(app.getPath("userData"), "Backups"));
  } catch {}
  try {
    fallbacks.push(path.join(app.getPath("documents"), "Dashboard Arduino", "Backups"));
  } catch {}
  for (const p of fallbacks) {
    try {
      fsSync.mkdirSync(path.dirname(p), { recursive: true });
      fsSync.mkdirSync(p, { recursive: true });
      if (fsSync.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function buildSessionCsv(rows, options = {}) {
  const { includeHeader = true, semicolon = true } = options;
  const sep = semicolon ? ";" : ",";
  const fmtNum = (x) => {
    if (x === null || x === undefined || typeof x !== "number" || !Number.isFinite(x)) return "";
    return String(x);
  };
  const fmtQ = (x) => {
    const q = calcularQualidadeVOC(x);
    return q.texto;
  };
  const headers = [
    "Data",
    "Hora",
    "Termopar 1",
    "Termopar 2",
    "Termopar 3",
    "Temperatura Ambiente",
    "Umidade",
    "Pressão",
    "VOC",
    "Qualidade do Ar"
  ];
  const lines = [];
  if (includeHeader) lines.push(headers.join(sep));
  for (const r of rows) {
    const dt = new Date(r.ts);
    lines.push(
      [
        dt.toLocaleDateString("pt-BR"),
        dt.toLocaleTimeString("pt-BR"),
        fmtNum(r.t1),
        fmtNum(r.t2),
        fmtNum(r.t3),
        fmtNum(r.temp),
        fmtNum(r.hum),
        fmtNum(r.pressure),
        fmtNum(r.voc),
        fmtQ(r.voc)
      ].join(sep)
    );
  }
  return lines.join("\r\n");
}

async function writeBackupFile(baseDir, prefix, rows, { allowOverwriteOld = true, overwriteTargetPath = null } = {}) {
  if (!baseDir || !rows || !rows.length) return null;
  const dayDir = path.join(baseDir, yyyymmdd());
  await fs.mkdir(dayDir, { recursive: true });
  let targetPath = overwriteTargetPath;
  if (!targetPath) targetPath = path.join(dayDir, `${prefix}_${yyyymmdd()}_${hhmmss()}.csv`);
  const utf8Bom = "\uFEFF";
  const csvBody = buildSessionCsv(rows);
  const tmp = `${targetPath}.tmp`;
  await fs.writeFile(tmp, utf8Bom + csvBody, "utf8");
  let tries = 0;
  do {
    try {
      await fs.rename(tmp, targetPath);
      return targetPath;
    } catch {
      try {
        await fs.copyFile(tmp, targetPath);
        try { await fs.rm(tmp, { force: true }); } catch {}
        return targetPath;
      } catch {}
    }
    tries++;
    if (!allowOverwriteOld) {
      targetPath = path.join(dayDir, `${prefix}_${yyyymmdd()}_${hhmmss()}_${process.pid}_${tries}.csv`);
    }
  } while (tries < 5);
  try { await fs.rm(tmp, { force: true }); } catch {}
  return null;
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
      additionalArguments: [`--socketUrl=${socketUrl}`, `--appVersion=${app.getVersion()}`],
      devTools: !app.isPackaged
    }
  });

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    try { win.webContents.openDevTools({ mode: "detach" }); } catch {}
  } else {
    try {
      win.removeMenu();
      if (Menu && typeof Menu.setApplicationMenu === "function") {
        Menu.setApplicationMenu(null);
      }
    } catch {}
    await win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  if (app.isPackaged) {
    try {
      win.webContents.on("devtools-opened", () => {
        try { win.webContents.closeDevTools(); } catch {}
      });
      win.webContents.on("before-input-event", (_e, input) => {
        const key = (input.key || "").toLowerCase();
        const f12 = input.key === "F12";
        const ctrlShiftI = (input.control || input.meta) && input.shift && key === "i";
        const ctrlShiftJ = (input.control || input.meta) && input.shift && key === "j";
        const ctrlShiftC = (input.control || input.meta) && input.shift && key === "c";
        if (f12 || ctrlShiftI || ctrlShiftJ || ctrlShiftC) {
          try { win.webContents.closeDevTools(); } catch {}
        }
      });
    } catch {}
  }

  return win;
}

let disposeSerial = null;
let serialBridgeRef = null;

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

function configureAutoUpdater() {
  if (!autoUpdater || !app.isPackaged || process.platform !== "win32") return;

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  } catch {
    return;
  }

  autoUpdater.on("error", (error) => {
    console.error("Falha no auto update:", error);
  });

  autoUpdater.on("update-available", () => {
    const win = BrowserWindow.getAllWindows()[0];
    dialog
      .showMessageBox(win, {
        type: "info",
        title: "Atualização disponível",
        message: "Uma nova versão do Dashboard Arduino foi encontrada.",
        detail: "O download será feito automaticamente em segundo plano.",
        buttons: ["OK"]
      })
      .catch(() => {});
  });

  autoUpdater.on("update-downloaded", () => {
    const win = BrowserWindow.getAllWindows()[0];
    dialog
      .showMessageBox(win, {
        type: "question",
        title: "Atualização pronta",
        message: "A nova versão do Dashboard Arduino já foi baixada.",
        detail: "Clique em Reiniciar agora para instalar a atualização.",
        buttons: ["Reiniciar agora", "Depois"],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) {
          try {
            autoUpdater.quitAndInstall();
          } catch {}
        }
      })
      .catch(() => {});
  });

  const checkForUpdates = () => {
    try {
      autoUpdater.checkForUpdates().catch((error) => {
        console.error("Falha ao verificar atualizações:", error);
      });
    } catch {}
  };

  checkForUpdates();
  autoUpdateCheckTimer = setInterval(checkForUpdates, 30 * 60 * 1000);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let latestSessionBackupTarget = null;
let latestSessionRowsAtStart = [];

app.whenReady().then(async () => {
  const { io, socketUrl } = await createIoServer();
  const serial = createSerialBridge(io);
  serialBridgeRef = serial;
  disposeSerial = await serial.start();

  try {
    const baseDir = getBackupBaseDir();
    if (baseDir) {
      try {
        const dayDir = path.join(baseDir, yyyymmdd());
        latestSessionBackupTarget = path.join(dayDir, `fim_${yyyymmdd()}_${hhmmss()}.csv`);
        latestSessionRowsAtStart = serial.getSessionHistory ? serial.getSessionHistory() : [];
        if (latestSessionRowsAtStart && latestSessionRowsAtStart.length > 0) {
          try {
            await writeBackupFile(baseDir, "inicio", latestSessionRowsAtStart, { allowOverwriteOld: false });
          } catch (e) {
            console.warn("backup inicio não gravado:", e?.message || String(e));
          }
        }
      } catch {}
    }
  } catch {}

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
    const win = BrowserWindow.fromWebContents(event.sender);
    const rows = Array.isArray(args?.rows) && args.rows.length > 0 ? args.rows : serial.getSessionHistory();
    const csvBody = buildSessionCsv(rows);
    const defaultFileName = String(args?.defaultFileName || "").trim() || `Dashboard_Arduino_${yyyymmdd()}_${hhmmss().replace(/-/g, "")}.csv`;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Exportar dados para Excel/CSV",
      defaultPath: path.join(app.getPath("documents"), defaultFileName),
      filters: [{ name: "CSV (Excel)", extensions: ["csv"] }]
    });
    if (canceled || !filePath) return { canceled: true };
    const content = "\uFEFF" + csvBody;
    await fs.writeFile(filePath, content, "utf8");
    return { canceled: false, filePath, rows: rows.length };
  });
  ipcMain.handle("dashboard:runBackupManual", async () => {
    try {
      const baseDir = getBackupBaseDir();
      const rows = serial.getSessionHistory ? serial.getSessionHistory() : [];
      const written = await writeBackupFile(baseDir, "manual", rows, { allowOverwriteOld: false });
      return { ok: Boolean(written), path: written || undefined, rows: rows.length, baseDir: baseDir || undefined };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });
  ipcMain.handle("dashboard:getBackupInfo", async () => {
    const baseDir = getBackupBaseDir();
    const rows = serial.getSessionHistory ? serial.getSessionHistory() : [];
    return { baseDir: baseDir || undefined, rows: rows.length };
  });

  io.on("connection", (socket) => {
    socket.emit("status", serial.getStatus());
  });

  await createMainWindow({ socketUrl });
  configureAutoUpdater();
});

let disposeSerialRan = false;
app.on("before-quit", async () => {
  if (autoUpdateCheckTimer) {
    clearInterval(autoUpdateCheckTimer);
    autoUpdateCheckTimer = null;
  }
  if (disposeSerialRan) return;
  disposeSerialRan = true;

  try {
    const serial = serialBridgeRef;
    const baseDir = getBackupBaseDir();
    const rows = serial?.getSessionHistory ? serial.getSessionHistory() : [];
    if (baseDir && rows.length > 0) {
      try {
        await writeBackupFile(baseDir, "fim", rows, { allowOverwriteOld: true, overwriteTargetPath: latestSessionBackupTarget });
      } catch (e) {
        console.warn("backup fim não gravado:", e?.message || String(e));
      }
    }
  } catch (e) {
    console.warn("backup fim falhou:", e?.message || String(e));
  }

  if (typeof disposeSerial === "function") {
    try { await disposeSerial(); } catch {}
  }
});

