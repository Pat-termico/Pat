const { parseCsvLine, parseTextLine, toFiniteNumberOrNull, isThermocoupleValid, calcularQualidadeVOC } = require("../electron/lib/parsers.cjs");
const assert = require("node:assert/strict");
const test = require("node:test");

test("toFiniteNumberOrNull básico", () => {
  assert.equal(toFiniteNumberOrNull(125.4), 125.4);
  assert.equal(toFiniteNumberOrNull("125.4"), 125.4);
  assert.equal(toFiniteNumberOrNull(""), null);
  assert.equal(toFiniteNumberOrNull(NaN), null);
  assert.equal(toFiniteNumberOrNull(null), null);
  assert.equal(toFiniteNumberOrNull(undefined), null);
  assert.equal(toFiniteNumberOrNull(0), 0);
  assert.equal(toFiniteNumberOrNull(0, { treatZeroAsInvalid: true }), null);
});

test("isThermocoupleValid", () => {
  assert.equal(isThermocoupleValid(125.4), true);
  assert.equal(isThermocoupleValid(-5.2), true);
  assert.equal(isThermocoupleValid(NaN), false);
  assert.equal(isThermocoupleValid(null), false);
  assert.equal(isThermocoupleValid("123"), false);
  assert.equal(isThermocoupleValid(Infinity), false);
});

test("parseCsvLine OFICIAL 7 campos (t1,t2,t3,temp,hum,pressure,voc)", () => {
  const res = parseCsvLine("125.4,98.2,210.7,26.3,58.0,955.6,125.4");
  assert.ok(res !== null, "linha oficial deveria ser parseada");
  assert.equal(res.format, "official");
  assert.equal(res.legacy, false);
  assert.equal(res.patch.t1, 125.4);
  assert.equal(res.patch.t2, 98.2);
  assert.equal(res.patch.t3, 210.7);
  assert.equal(res.patch.temp, 26.3);
  assert.equal(res.patch.hum, 58);
  assert.equal(res.patch.pressure, 955.6);
  assert.equal(res.patch.voc, 125.4);
});

test("parseCsvLine OFICIAL com pressure vazio = NÃO usar 1012 fallback", () => {
  const res = parseCsvLine("1,2,3,4,5,,7");
  assert.ok(res !== null);
  assert.equal(res.patch.pressure, null, "pressure vazia deve ser null, NÃO 1012");
  assert.equal(res.patch.t3, 3);
});

test("parseCsvLine OFICIAL campo NaN (abc no T2) = null nesse campo, resto válido", () => {
  const res = parseCsvLine("134.4,abc,210.7,28.1,52.0,955.59,125.4");
  assert.ok(res !== null);
  assert.equal(res.patch.t2, null, "T2 inválido deve ser null");
  assert.equal(res.patch.t1, 134.4);
  assert.equal(res.patch.t3, 210.7);
  assert.equal(res.patch.pressure, 955.59);
  assert.equal(res.patch.voc, 125.4);
});

test("parseCsvLine vazia = null", () => {
  assert.equal(parseCsvLine(""), null);
  assert.equal(parseCsvLine(",,,,,,,,"), null);
});

test("parseCsvLine LEGACY 5 e 6 campos temporariamente", () => {
  const r5 = parseCsvLine("1,2,3,4,5");
  assert.ok(r5 && r5.legacy === true);
  assert.equal(r5.patch.t1, 1);
  assert.equal(r5.patch.t2, 2);
  assert.equal(r5.patch.temp, 3);
  assert.equal(r5.patch.hum, 4);
  assert.equal(r5.patch.voc, 5);
  assert.equal(r5.patch.t3, undefined);

  const r6 = parseCsvLine("1,2,3,4,5,6");
  assert.ok(r6 && r6.legacy === true);
  assert.equal(r6.patch.t1, 1);
  assert.equal(r6.patch.t2, 2);
  assert.equal(r6.patch.t3, 3);
  assert.equal(r6.patch.temp, 4);
  assert.equal(r6.patch.hum, 5);
  assert.equal(r6.patch.voc, 6);
  assert.equal(r6.patch.pressure, undefined);
});

test("parseTextLine humano: T3, Pressão, Pressure, frames", () => {
  const t3 = parseTextLine("T3: 210.7");
  assert.equal(t3.kind, "value");
  assert.equal(t3.patch.t3, 210.7);

  const pPtBr = parseTextLine("Pressão: 955.6");
  assert.equal(pPtBr.patch.pressure, 955.6);

  const pEn = parseTextLine("Pressure: 1018.3");
  assert.equal(pEn.patch.pressure, 1018.3);

  assert.equal(parseTextLine("=== BME680 ===").kind, "startFrame");
  assert.equal(parseTextLine("-------------------").kind, "endFrame");
});

test("calcularQualidadeVOC faixas e indisponível", () => {
  assert.equal(calcularQualidadeVOC(Infinity).faixa, "indisponivel");
  assert.equal(calcularQualidadeVOC(null).faixa, "indisponivel");
  assert.equal(calcularQualidadeVOC(undefined).texto, "Sem leitura");
  assert.equal(calcularQualidadeVOC(150).faixa, "excelente");
  assert.equal(calcularQualidadeVOC(80).faixa, "boa");
  assert.equal(calcularQualidadeVOC(45).faixa, "moderada");
  assert.equal(calcularQualidadeVOC(10).faixa, "ruim");
});
