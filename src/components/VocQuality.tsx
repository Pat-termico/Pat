import { motion } from "framer-motion";
import { Leaf, Waves } from "lucide-react";
import { calcularQualidadeVOC } from "../lib/voc";

function formatVoc(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "---";
  return Math.round(v).toString();
}

export default function VocQuality({ voc }: { voc: number | null }) {
  const q = calcularQualidadeVOC(voc);

  const statusPill =
    q.faixa === "excelente"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : q.faixa === "boa"
        ? "bg-lime-50 text-lime-700 ring-1 ring-lime-200"
        : q.faixa === "moderada"
          ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          : q.faixa === "indisponivel"
            ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
            : "bg-red-50 text-red-700 ring-1 ring-red-200";

  const pointerColor =
    q.faixa === "excelente"
      ? "bg-emerald-600"
      : q.faixa === "boa"
        ? "bg-lime-600"
        : q.faixa === "moderada"
          ? "bg-amber-600"
          : q.faixa === "indisponivel"
            ? "bg-slate-400"
            : "bg-red-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Qualidade do Ar / VOC</div>
            <div className="text-xs text-slate-500">Classificação automática</div>
          </div>
        </div>
        <div className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusPill}`}>{q.texto}</div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>

        <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 opacity-95" />
          <motion.div
            initial={false}
            animate={{ left: `${q.percentual}%` }}
            transition={{ type: "spring", stiffness: 180, damping: 18 }}
            className="absolute top-1/2 -translate-y-1/2"
            style={{ width: 0 }}
          >
            <div className={`h-4 w-4 -translate-x-2 rounded-full ring-4 ring-white shadow-soft ${pointerColor}`} />
          </motion.div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Waves className="h-4 w-4" />
              VOC / Gases
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-3xl font-semibold tracking-tight text-slate-900">{formatVoc(voc)}</div>
              <div className="text-sm font-medium text-slate-500">kΩ</div>
            </div>
            <div className="mt-1 text-xs text-slate-500">Resistência do gás (indicador)</div>
          </div>

          <div className="rounded-3xl bg-slate-900 p-4 text-white shadow-soft">
            <div className="text-xs font-semibold text-white/80">Índice de Qualidade do Ar</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{q.texto}</div>
            <div className="mt-1 text-xs text-white/70">
              {q.faixa === "excelente"
                ? "Ar limpo e seguro"
                : q.faixa === "boa"
                  ? "Condições estáveis"
                  : q.faixa === "moderada"
                    ? "Atenção: ventilação recomendada"
                    : q.faixa === "indisponivel"
                      ? "Aguardando leitura do BME680"
                      : "Alerta: qualidade baixa"}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

