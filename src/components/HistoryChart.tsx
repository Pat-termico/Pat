import { motion } from "framer-motion";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type HistoryRow = {
  ts: number;
  label: string;
  t1: number | null;
  t2: number | null;
  t3: number | null;
};

export default function HistoryChart({ data }: { data: HistoryRow[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Histórico de Temperaturas (°C)</div>
          <div className="text-xs text-slate-500">Atualização em tempo real • Termopares 1, 2 e 3</div>
        </div>
        <div className="rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-medium text-slate-600">
          Realtime
        </div>
      </div>

      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              minTickGap={18}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={42}
              domain={["auto", "auto"]}
              allowDataOverflow={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 16,
                border: "1px solid rgba(148,163,184,0.35)",
                boxShadow: "0 10px 25px rgba(15,23,42,0.12)",
                fontSize: 12
              }}
              formatter={(v: unknown, name: unknown) => [
                typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)} °C` : "---",
                String(name)
              ]}
              labelFormatter={(l: string | number) => `Horário ${l}`}
            />
            <Line
              type="monotone"
              dataKey="t1"
              name="Termopar 1"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive
              animationDuration={450}
            />
            <Line
              type="monotone"
              dataKey="t2"
              name="Termopar 2"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive
              animationDuration={450}
            />
            <Line
              type="monotone"
              dataKey="t3"
              name="Termopar 3"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive
              animationDuration={450}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
