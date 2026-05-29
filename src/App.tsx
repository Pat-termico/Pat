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

function formatTimeLabel(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTimePtBr(ts: number) {
  return new Date(ts).toLocaleString("pt-BR");
}

function formatCsvNumber(n: number | undefined, decimals: number) {
  if (!Number.isFinite(n)) return "";
  return Number(n).toFixed(decimals).replace(".", ",");
}

function clampHistory<T>(arr: T[], max: number) {
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [latest, setLatest] = useState<SensorPayload | null>(null);
  const [history, setHistory] = useState<SensorPayload[]>([]);
  const [consoleLines, setConsoleLines] = useState<{ ts: number; raw: string }[]>([]);

  const pressureRef = useRef(1012.0);

  const exportCsv = async () => {
    if (!history.length) return;
    const header = ["DataHora", "T1", "T2", "TA", "U", "hPa", "VOC"];
    const lines = ["sep=;", header.join(";")];
    for (const r of history) {
      lines.push(
        [
          formatDateTimePtBr(r.ts),
          formatCsvNumber(r.t1, 1),
          formatCsvNumber(r.t2, 1),
          formatCsvNumber(r.temp, 1),
          formatCsvNumber(r.hum, 0),
          formatCsvNumber(r.pressure, 0),
          formatCsvNumber(r.voc, 1)
        ].join(";")
      );
    }
    const csvText = lines.join("\r\n");
    const defaultFileName = `dashboard-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

    const api = window.DashboardArduino;
    if (api?.exportCsv) {
      await api.exportCsv({ csvText, defaultFileName });
      return;
    }

    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const socket = createDashboardSocket();

    socket.on("connect", () => {
      setStatus((s) => ({ ...s, error: undefined }));
    });

    socket.on("status", (s) => setStatus(s));

    socket.on("serialLine", (p: { ts: number; raw: string; parsed: boolean }) => {
      setConsoleLines((l) => clampHistory([...l, { ts: p.ts, raw: p.raw }], 90));
    });

    socket.on("sensor", (p) => {
      const hasPressure = Number.isFinite(p.pressure);
      const computedPressure = 1012 + Math.sin(p.ts / 8000) * 1.2 + (p.hum - 50) * 0.02;
      const pressure = hasPressure ? Number(p.pressure) : computedPressure;
      const next: SensorPayload = { ...p, pressure };

      setLatest(next);
      setHistory((h) => clampHistory([...h, next], 900));

      pressureRef.current = hasPressure ? pressure : pressureRef.current * 0.92 + pressure * 0.08;
    });

    return () => {
      socket.close();
    };
  }, []);

  const lastUpdateTs = latest?.ts ?? status.lastSeenTs;
  const online = Boolean(status.connected && lastUpdateTs && Date.now() - lastUpdateTs < 4000);

  const therm1 = useMemo(() => history.map((p) => ({ ts: p.ts, v: p.t1 })), [history]);
  const therm2 = useMemo(() => history.map((p) => ({ ts: p.ts, v: p.t2 })), [history]);
  const pressureHpa = Number.isFinite(latest?.pressure) ? Number(latest?.pressure) : pressureRef.current;

  const historyRows: HistoryRow[] = useMemo(() => {
    const sliced = history.slice(-180);
    return sliced.map((p) => ({
      ts: p.ts,
      label: formatTimeLabel(p.ts),
      t1: p.t1,
      t2: p.t2
    }));
  }, [history]);

  return (
    <div className="min-h-full bg-slate-50">
      <Header status={status} onExport={exportCsv} exportDisabled={!history.length} />

      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="grid grid-cols-1 gap-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Termopares Tipo K</div>
                <div className="text-xs text-slate-500">2 canais • destaque + mini gráfico</div>
              </div>
              <div className="hidden items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-soft ring-1 ring-slate-200/60 sm:flex">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
                <span>{online ? "Atualizando" : "Sem dados recentes"}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ThermocoupleCard title="Termopar 1" value={latest?.t1 ?? 0} color="red" history={therm1} />
              <ThermocoupleCard
                title="Termopar 2"
                value={latest?.t2 ?? 0}
                color="orange"
                history={therm2}
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Ambiente (BME680)</div>
                    <div className="text-xs text-slate-500">Temperatura • Umidade • Pressão (simulada)</div>
                  </div>
                  <div className="rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-medium text-slate-600">
                    {lastUpdateTs ? `Última atualização: ${formatTimeLabel(lastUpdateTs)}` : "Aguardando"}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <EnvCard
                    title="Temperatura Ambiente"
                    value={(latest?.temp ?? 0).toFixed(1)}
                    unit="°C"
                    icon={Thermometer}
                    accent="blue"
                  />
                  <EnvCard
                    title="Umidade"
                    value={Math.round(latest?.hum ?? 0).toString()}
                    unit="%"
                    icon={Droplets}
                    accent="cyan"
                  />
                  <EnvCard
                    title="Pressão"
                    value={pressureHpa.toFixed(0)}
                    unit="hPa"
                    icon={Gauge}
                    accent="violet"
                  />
                </div>
              </div>

              <div className="mt-6">
                <VocQuality voc={latest?.voc ?? 0} />
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
                    <div className="text-xs text-slate-500">t1,t2,temp,hum,voc</div>
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
                        3: <span className="font-medium">Temperatura Ambiente</span> (°C)
                      </div>
                      <div>
                        4: <span className="font-medium">Umidade</span> (%)
                      </div>
                      <div>
                        5: <span className="font-medium">VOC</span> (kΩ)
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
