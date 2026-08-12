"use strict";

function toFiniteNumberOrNull(v, { treatZeroAsInvalid = false } = {}) {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  if (v === "NaN") return null;
  if (typeof v === "string") {
    if (v.trim().length === 0) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (treatZeroAsInvalid && n === 0) return null;
    return n;
  }
  if (!Number.isFinite(v)) return null;
  const n = Number(v);
  if (treatZeroAsInvalid && n === 0) return null;
  return n;
}

function isThermocoupleValid(x) {
  if (!Number.isFinite(x)) return false;
  if (typeof x !== "number") return false;
  if (Number.isNaN(x)) return false;
  return true;
}

function parseCsvLine(line) {
  const raw = String(line ?? "").trim();
  if (!raw.length) return null;
  const tokens = raw.split(",").map((s) => s.trim());
  if (tokens.length === 0) return null;

  const toNum = (tk) => (tk.length === 0 ? null : toFiniteNumberOrNull(tk));
  const nums = tokens.map(toNum);

  if (tokens.length === 7) {
    const [t1, t2, t3, temp, hum, pressure, voc] = nums;
    const t1V = isThermocoupleValid(t1) ? t1 : null;
    const t2V = isThermocoupleValid(t2) ? t2 : null;
    const t3V = isThermocoupleValid(t3) ? t3 : null;
    const tempV = toFiniteNumberOrNull(temp);
    const humV = toFiniteNumberOrNull(hum);
    const pressureV = toFiniteNumberOrNull(pressure);
    const vocV = toFiniteNumberOrNull(voc);
    const ok =
      typeof t1V === "number" ||
      typeof t2V === "number" ||
      typeof t3V === "number" ||
      typeof tempV === "number" ||
      typeof humV === "number" ||
      typeof pressureV === "number" ||
      typeof vocV === "number";
    if (!ok) return null;
    return {
      format: "official",
      patch: { t1: t1V, t2: t2V, t3: t3V, temp: tempV, hum: humV, pressure: pressureV, voc: vocV },
      raw,
      legacy: false
    };
  }

  if (tokens.length === 5 || tokens.length === 6) {
    const withT3 = tokens.length === 6;
    const t1 = nums[0];
    const t2 = nums[1];
    const t3Maybe = withT3 ? nums[2] : null;
    const temp = withT3 ? nums[3] : nums[2];
    const hum = withT3 ? nums[4] : nums[3];
    const voc = withT3 ? nums[5] : nums[4];
    const t1V = isThermocoupleValid(t1) ? t1 : null;
    const t2V = isThermocoupleValid(t2) ? t2 : null;
    const tempV = toFiniteNumberOrNull(temp);
    const humV = toFiniteNumberOrNull(hum);
    const vocV = toFiniteNumberOrNull(voc);
    const patch = { t1: t1V, t2: t2V, temp: tempV, hum: humV, voc: vocV };
    if (withT3) {
      const t3LV = isThermocoupleValid(t3Maybe) ? t3Maybe : null;
      if (typeof t3LV === "number") patch.t3 = t3LV;
    }
    const any = Object.values(patch).some((v) => typeof v === "number");
    if (!any) return null;
    return {
      format: "legacy",
      patch,
      raw,
      legacy: true
    };
  }

  return null;
}

function parseTextLine(line) {
  const raw = String(line ?? "").trim();
  if (!raw.length) return null;
  const numberFrom = (re) => {
    const m = raw.match(re);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };

  const mk = (patch) => ({ kind: "value", patch, raw });

  const toThermo = (re) => {
    const v = numberFrom(re);
    if (!Number.isFinite(v)) return null;
    return isThermocoupleValid(v) ? v : null;
  };

  if (/^T1:/i.test(raw)) return mk({ t1: toThermo(/T1:\s*([-+]?\d+(?:\.\d+)?)/i) });
  if (/^T2:/i.test(raw)) return mk({ t2: toThermo(/T2:\s*([-+]?\d+(?:\.\d+)?)/i) });
  if (/^T3:/i.test(raw)) return mk({ t3: toThermo(/T3:\s*([-+]?\d+(?:\.\d+)?)/i) });

  if (/Temp\s*Ambiente:/i.test(raw))
    return mk({ temp: toFiniteNumberOrNull(numberFrom(/Temp\s*Ambiente:\s*([-+]?\d+(?:\.\d+)?)/i)) });
  if (/Umidade:/i.test(raw)) return mk({ hum: toFiniteNumberOrNull(numberFrom(/Umidade:\s*([-+]?\d+(?:\.\d+)?)/i)) });
  if (/Press(?:ao|ão):/i.test(raw))
    return mk({ pressure: toFiniteNumberOrNull(numberFrom(/Press(?:ao|ão):\s*([-+]?\d+(?:\.\d+)?)/i)) });
  if (/Pressure:/i.test(raw))
    return mk({ pressure: toFiniteNumberOrNull(numberFrom(/Pressure:\s*([-+]?\d+(?:\.\d+)?)/i)) });
  if (/VOC\s*\/\s*Gas:/i.test(raw))
    return mk({ voc: toFiniteNumberOrNull(numberFrom(/VOC\s*\/\s*Gas:\s*([-+]?\d+(?:\.\d+)?)/i)) });
  if (/VOC\s*:/i.test(raw)) return mk({ voc: toFiniteNumberOrNull(numberFrom(/VOC\s*:\s*([-+]?\d+(?:\.\d+)?)/i)) });

  if (/^=+\s*BME680\s*=+/i.test(raw)) return { kind: "startFrame", raw };
  if (/^-{10,}/.test(raw)) return { kind: "endFrame", raw };

  return null;
}

function calcularQualidadeVOC(voc) {
  if (typeof voc !== "number" || !Number.isFinite(voc)) {
    return { texto: "Sem leitura", percentual: 0, faixa: "indisponivel" };
  }
  if (voc > 100) return { texto: "Excelente", percentual: 90, faixa: "excelente" };
  if (voc > 60) return { texto: "Boa", percentual: 70, faixa: "boa" };
  if (voc > 30) return { texto: "Moderada", percentual: 50, faixa: "moderada" };
  return { texto: "Ruim", percentual: 20, faixa: "ruim" };
}

module.exports = {
  parseCsvLine,
  parseTextLine,
  toFiniteNumberOrNull,
  isThermocoupleValid,
  calcularQualidadeVOC
};
