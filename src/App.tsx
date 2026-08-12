import { useEffect, useMemo, useRef, useState } from "react";
import { Droplets, Gauge, Thermometer, Usb } from "lucide-react";
import { motion } from "framer-motion";
import Header from "./components/Header";
import ThermocoupleCard from "./components/ThermocoupleCard";
import EnvCard from "./components/EnvCard";
import VocQuality from "./components/VocQuality";
import HistoryChart, { type HistoryRow } from "./components/HistoryChart";
import SerialConsole from "./components/SerialConsole";
import Footer from "./components/Footer";
import { createDashboardSocket } from "./lib/socket";
import type { ConnectionStatus, SensorPayload } from "./lib/types";
import { calcularQualidadeVOC } from "./lib/voc";

function formatTimeLabel(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function clampHistory<T>(arr: T[], max: number) {
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

function fmtOne(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "---";
  return v.toFixed(1);
}

function fmtZero(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "---";
  return v.toFixed(0);
}

function fmtRounded(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "---";
  return Math.round(v).toString();
}

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [latest, setLatest] = useState<SensorPayload | null>(null);
  const [history, setHistory] = useState<SensorPayload[]>([]);
  const [consoleLines, setConsoleLines] = useState<{ ts: number; raw: string }[]>([]);
  const [backupInfo, setBackupInfo] = useState<{ baseDir?: string; rows?: number } | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  };

  const exportCsv = async () => {
    try {
      const rowsForExport = history.length
        ? history.map((r) => ({
            ts: r.ts,
            t1: r.t1,
            t2: r.t2,
            t3: r.t3,
            temp: r.temp,
            hum: r.hum,
            pressure: r.pressure,
            voc: r.voc
          }))
        : undefined;
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const defaultFileName = `Dashboard_Arduino_${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}.csv`;
      const res = await window.DashboardArduino?.exportCsv?.({ rows: rowsForExport, defaultFileName });
      if (!res) return;
      if (res.canceled) return;
      showToast("ok", `Exportado: ${res.filePath ?? defaultFileName} (${res.rows ?? 0} linhas)`);
    } catch (e) {
      showToast("err", `Falha ao exportar: ${(e as Error)?.message ?? String(e)}`);
    }
  };

  const runBackupNow = async () => {
    try {
      const r = await window.DashboardArduino?.runBackupManual?.();
      if (!r) {
        showToast("err", "Backup não disponível");
        return;
      }
      if (r.ok) {
        showToast("ok", `Backup salvo: ${r.path ?? "sucesso"} (${r.rows ?? 0} amostras)`);
      } else {
        showToast("err", `Falha no backup: ${r.error ?? "erro desconhecido"}`);
      }
    } catch (e) {
      showToast("err", `Falha no backup: ${(e as Error)?.message ?? String(e)}`);
    }
  };

  useEffect(() => {
    let mounted = true;
    const refreshBackupInfo = async () => {
      try {
        const r = await window.DashboardArduino?.getBackupInfo?.();
        if (mounted) setBackupInfo(r || null);
      } catch {}
    };
    refreshBackupInfo();
    const id = window.setInterval(refreshBackupInfo, 2500);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const socket = createDashboardSocket();

    socket.on("connect", () => {
      setStatus((s) => ({ ...s, error: undefined }));
    });

    socket.on("status", (s) => setStatus(s));

    socket.on("serialLine", (p: { ts: number; raw: string; parsed: boolean }) => {
      setConsoleLines((l) => clampHistory([...l, { ts: p.ts, raw: p.raw }], 120));
    });

    socket.on("sensor", (p: SensorPayload) => {
      const next: SensorPayload = p;
      setLatest(next);
      setHistory((h) => clampHistory([...h, next], 900));
    });

    return () => {
      socket.close();
    };
  }, []);

  const lastUpdateTs = latest?.ts ?? status.lastSeenTs;
  const online = Boolean(status.connected && lastUpdateTs && Date.now() - lastUpdateTs < 4000);

  const therm1 = useMemo(() => history.map((p) => ({ ts: p.ts, v: p.t1 })), [history]);
  const therm2 = useMemo(() => history.map((p) => ({ ts: p.ts, v: p.t2 })), [history]);
  const therm3 = useMemo(() => history.map((p) => ({ ts: p.ts, v: p.t3 })), [history]);
  const pressureHpa = typeof latest?.pressure === "number" && Number.isFinite(latest.pressure) ? latest.pressure : null;

  const historyRows: HistoryRow[] = useMemo(() => {
    const sliced = history.slice(-180);
    return sliced.map((p) => ({
      ts: p.ts,
      label: formatTimeLabel(p.ts),
      t1: p.t1,
      t2: p.t2,
      t3: p.t3
    }));
  }, [history]);

  void calcularQualidadeVOC;

  return (
    <div className="relative min-h-full bg-slate-50">
      {toast ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`pointer-events-auto fixed right-4 top-20 z-50 rounded-2xl px-4 py-2 text-xs font-semibold shadow-soft ring-1 ${
            toast.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
              : "bg-red-50 text-red-800 ring-red-200"
          }`}
        >
          {toast.text}
        </motion.div>
      ) : null}

      <Header
        status={status}
        onExport={exportCsv}
        onBackup={runBackupNow}
        exportDisabled={!history.length}
        lastReadTs={latest?.ts}
        backupInfo={backupInfo}
      />

      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="grid grid-cols-1 gap-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Termopares Tipo K</div>
                <div className="text-xs text-slate-500">3 canais • MAX6675 • destaque + mini gráfico</div>
              </div>
              <div className="hidden items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-soft ring-1 ring-slate-200/60 sm:flex">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
                <span>{online ? "Atualizando" : "Sem dados recentes"}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <ThermocoupleCard title="Termopar 1" value={latest?.t1 ?? null} color="red" history={therm1} />
              <ThermocoupleCard title="Termopar 2" value={latest?.t2 ?? null} color="orange" history={therm2} />
              <ThermocoupleCard title="Termopar 3" value={latest?.t3 ?? null} color="green" history={therm3} />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Ambiente (BME680)</div>
                    <div className="text-xs text-slate-500">Temperatura • Umidade • Pressão • real</div>
                  </div>
                  <div className="rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-medium text-slate-600">
                    {lastUpdateTs ? `Última atualização: ${formatTimeLabel(lastUpdateTs)}` : "Aguardando"}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <EnvCard
                    title="Temperatura Ambiente"
                    value={fmtOne(latest?.temp)}
                    unit="°C"
                    icon={Thermometer}
                    accent="blue"
                  />
                  <EnvCard
                    title="Umidade"
                    value={fmtRounded(latest?.hum)}
                    unit="%"
                    icon={Droplets}
                    accent="cyan"
                  />
                  <EnvCard
                    title="Pressão"
                    value={fmtOne(pressureHpa)}
                    unit="hPa"
                    icon={Gauge}
                    accent="violet"
                  />
                </div>
              </div>

              <div className="mt-6">
                <VocQuality voc={latest?.voc ?? null} />
              </div>
            </div>

            <div className="lg:col-span-5">
              <SerialConsole lines={consoleLines} connected={online} />

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="mt-6 rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white">
                    <Usb className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Formato Serial (CSV)</div>
                    <div className="text-xs text-slate-500">t1,t2,t3,temp,hum,pressure,voc</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700">
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
                    <div className="grid grid-cols-1 gap-1 text-xs">
                      <div>
                        1: <span className="font-medium">Termopar 1</span> (°C)
                      </div>
                      <div>
                        2: <span className="font-medium">Termopar 2</span> (°C)
                      </div>
                      <div>
                        3: <span className="font-medium">Termopar 3</span> (°C)
                      </div>
                      <div>
                        4: <span className="font-medium">Temperatura Ambiente</span> (°C)
                      </div>
                      <div>
                        5: <span className="font-medium">Umidade</span> (%)
                      </div>
                      <div>
                        6: <span className="font-medium">Pressão</span> (hPa)
                      </div>
                      <div>
                        7: <span className="font-medium">VOC</span> (kΩ)
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          <section>
            <HistoryChart data={historyRows} />
          </section>
        </div>
      </div>

      <Footer online={online} lastUpdateTs={lastUpdateTs} />
    </div>
  );
}
