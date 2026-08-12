import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

type Point = { ts: number; v: number | null };

function clampNumber(n: number | null | undefined): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return null;
}

function formatValue(v: number | null | undefined): string {
  const n = clampNumber(v);
  if (n === null) return "---";
  return n.toFixed(1);
}

function toSparkData(points: Point[]) {
  const filtered = points
    .slice(-40)
    .map((p) => ({ x: p.ts, v: typeof p.v === "number" && Number.isFinite(p.v) ? p.v : null }))
    .filter((p): p is { x: number; v: number } => p.v !== null);
  return filtered;
}

export default function ThermocoupleCard({
  title,
  value,
  color,
  history
}: {
  title: string;
  value: number | null;
  color: "red" | "orange" | "green";
  history: Point[];
}) {
  const spark = toSparkData(history);
  const min = spark.length ? Math.min(...spark.map((p) => p.v)) : null;
  const max = spark.length ? Math.max(...spark.map((p) => p.v)) : null;

  const palette =
    color === "red"
      ? {
          ring: "ring-red-100",
          iconBg: "bg-red-50 text-red-600",
          line: "#ef4444",
          fill: "rgba(239, 68, 68, 0.16)"
        }
      : color === "orange"
        ? {
            ring: "ring-orange-100",
            iconBg: "bg-orange-50 text-orange-600",
            line: "#f97316",
            fill: "rgba(249, 115, 22, 0.16)"
          }
        : {
            ring: "ring-emerald-100",
            iconBg: "bg-emerald-50 text-emerald-700",
            line: "#22c55e",
            fill: "rgba(34, 197, 94, 0.16)"
          };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -3 }}
      className={`group relative overflow-hidden rounded-3xl bg-white p-5 shadow-soft ring-1 ${palette.ring} transition-shadow duration-300 hover:shadow-hover`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-2xl ${palette.iconBg}`}>
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">Termopar Tipo K</div>
          </div>
        </div>
        <div className="rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-medium text-slate-600">
          °C
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="leading-none">
          <div className="text-4xl font-semibold tracking-tight text-slate-900">{formatValue(value)}</div>
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span>
              Máx: <span className="font-medium text-slate-700">{formatValue(max)}°C</span>
            </span>
            <span>
              Min: <span className="font-medium text-slate-700">{formatValue(min)}°C</span>
            </span>
          </div>
        </div>

        <div className="h-20 w-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <Tooltip
                cursor={false}
                contentStyle={{
                  borderRadius: 16,
                  border: "1px solid rgba(148,163,184,0.35)",
                  boxShadow: "0 10px 25px rgba(15,23,42,0.12)",
                  fontSize: 12
                }}
                formatter={(v: unknown) => [`${formatValue(Number(v))} °C`, "Temp"]}
                labelFormatter={() => ""}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={palette.line}
                strokeWidth={2}
                fill={palette.fill}
                isAnimationActive
                animationDuration={450}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-slate-900/5 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />
    </motion.div>
  );
}

