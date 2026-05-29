import { useEffect, useMemo, useState } from "react";
import { Download, PlugZap, Timer } from "lucide-react";
import type { ConnectionStatus } from "../lib/types";
import internalLogo from "../assets/EVA LTDA Embedde.png";

function formatNow(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function Header({
  status,
  onExport,
  exportDisabled
}: {
  status: ConnectionStatus;
  onExport?: () => void;
  exportDisabled?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const [ports, setPorts] = useState<{ path: string; manufacturer?: string }[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const list = await window.DashboardArduino?.listSerialPorts?.();
        if (!mounted) return;
        setPorts((list || []).map((p) => ({ path: p.path, manufacturer: p.manufacturer })));
      } catch {
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const setPort = async (portPath: string) => {
    try {
      await window.DashboardArduino?.setSerialPort?.(portPath);
    } catch {
    }
  };

  const statusUi = useMemo(() => {
    if (status.connected) {
      return {
        label: "Conectado",
        dot: "bg-emerald-500",
        pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      };
    }
    return {
      label: "Desconectado",
      dot: "bg-slate-300",
      pill: "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
    };
  }, [status.connected]);

  return (
    <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70">
            <img src={internalLogo} alt="EVA LTDA" className="h-full w-full object-contain p-1" />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-semibold tracking-tight">Dashboard Arduino</div>
            <div className="text-xs text-slate-500">Monitoramento industrial em tempo real</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onExport ? (
            <button
              type="button"
              onClick={onExport}
              disabled={Boolean(exportDisabled)}
              className="hidden items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-soft ring-1 ring-slate-200/60 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:flex"
              title="Exportar para Excel (CSV)"
            >
              <Download className="h-4 w-4 opacity-80" />
              <span>Exportar</span>
            </button>
          ) : null}

          <div className="relative">
            <button
              type="button"
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium ${statusUi.pill}`}
              title={status.error ? status.error : ""}
            >
              <span className={`h-2 w-2 rounded-full ${statusUi.dot}`} />
              <PlugZap className="h-4 w-4 opacity-80" />
              <span>{statusUi.label}</span>
              <span className="hidden text-slate-500 sm:inline">
                {status.portPath ? `• ${status.portPath}` : ""}
              </span>
              {status.error ? (
                <span className="ml-1 hidden rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200 sm:inline">
                  Erro
                </span>
              ) : null}
            </button>

            {!status.connected ? (
              <div className="absolute right-0 top-[46px] z-20 w-56 overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/70">
                <div className="px-3 py-2 text-[11px] font-semibold text-slate-500">Portas disponíveis</div>
                <div className="max-h-52 overflow-auto">
                  {ports.length === 0 ? (
                    <div className="px-3 pb-3 text-xs text-slate-600">Nenhuma porta encontrada</div>
                  ) : (
                    ports.map((p) => (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => setPort(p.path)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <span className="font-semibold">{p.path}</span>
                        <span className="max-w-[120px] truncate text-[11px] text-slate-500">
                          {p.manufacturer || ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-soft sm:flex">
            <Timer className="h-4 w-4 opacity-90" />
            <span>{formatNow(now)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
