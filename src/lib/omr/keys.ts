// Đọc đáp án (file Excel/CSV, chữ/QR của web đảo đề) và danh sách lớp.
// Dịch sát lib/core/keys.dart + qr_key.dart + tabular.dart của app điện thoại (v1.5.3).

export type Part = "I" | "II" | "III";
/** Đáp án 1 mã đề: { I: {1: 'A'}, II: {1: 'DSDS'}, III: {1: '-0.9'} } */
export type KeyMap = Record<Part, Record<number, string>>;
export const PARTS: Part[] = ["I", "II", "III"];

export const newKey = (): KeyMap => ({ I: {}, II: {}, III: {} });

const qLabel = /^(?:c[aâ]u\s*)?(I{1,3})\s*[.\-_ ]\s*(\d+)$/iu;
const qNum = /^(?:c[aâ]u\s*)?(\d{1,3})(?:\.0)?$/iu;
const madeRe = /^\d{2,6}(?:\.0)?$/;
const digits = /^\d+$/;

export function numStr(v: string): string {
  v = v.trim();
  if (/^\d+\.0$/.test(v)) v = v.slice(0, -2);
  return v;
}

export function normMade(v: string): string {
  v = numStr(v);
  return digits.test(v) ? v.padStart(4, "0") : v;
}

export function normP2(v: string): string | null {
  let s = v.toUpperCase().replaceAll("Đ", "D").replaceAll("T", "D").replaceAll("F", "S");
  s = s.replace(/[^DS]/g, "");
  return s.length === 4 ? s : null;
}

export function normValue(part: Part, v: string): string | null {
  v = numStr(v);
  if (part === "I") {
    v = v.toUpperCase();
    return ["A", "B", "C", "D"].includes(v) ? v : null;
  }
  if (part === "II") return normP2(v);
  v = v.replaceAll(" ", "");
  return v ? v : null;
}

function sameKey(a: KeyMap, b: KeyMap): boolean {
  for (const p of PARTS) {
    const x = a[p], y = b[p];
    if (Object.keys(x).length !== Object.keys(y).length) return false;
    for (const [q, v] of Object.entries(x)) if (y[+q] !== v) return false;
  }
  return true;
}

export const keyCount = (k: KeyMap) =>
  Object.keys(k.I).length + Object.keys(k.II).length + Object.keys(k.III).length;

// ====================================================================== bảng tính -> lưới chuỗi
const CP1258_HIGH = [
  0x20ac, -1, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, -1, 0x2039, 0x0152, -1, -1, -1,
  -1, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, -1, 0x203a, 0x0153, -1, -1, 0x0178,
  0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xae, 0xaf,
  0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf,
  0xc0, 0xc1, 0xc2, 0x0102, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0x0300, 0xcd, 0xce, 0xcf,
  0x0110, 0xd1, 0x0309, 0xd3, 0xd4, 0x01a0, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0x01af, 0x0303, 0xdf,
  0xe0, 0xe1, 0xe2, 0x0103, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0x0301, 0xed, 0xee, 0xef,
  0x0111, 0xf1, 0x0323, 0xf3, 0xf4, 0x01a1, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0x01b0, 0x20ab, 0xff,
];

/** utf-8 (có/không BOM) -> cp1258 -> latin-1, như bản máy tính. */
export function decodeText(raw: Uint8Array): string {
  let b = raw;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    let s = "";
    for (const x of b) {
      if (x < 0x80) s += String.fromCharCode(x);
      else {
        const c = CP1258_HIGH[x - 0x80];
        if (c < 0) return new TextDecoder("latin1").decode(b);
        s += String.fromCharCode(c);
      }
    }
    return s.normalize("NFC");
  }
}

function splitLines(text: string): string[] {
  const out = text.split(/\r\n|[\n\r\x0B\x0C\x1C\x1D\x1E\x85\u2028\u2029]/);
  if (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let sb = "";
  let inQ = false, fieldStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { sb += '"'; i++; continue; }
        inQ = false;
      } else sb += ch;
    } else if (ch === '"' && fieldStart) inQ = true;
    else if (ch === delim) { out.push(sb); sb = ""; fieldStart = true; continue; }
    else sb += ch;
    fieldStart = false;
  }
  out.push(sb);
  return out;
}

export function readCsv(raw: Uint8Array): string[][] {
  const text = decodeText(raw);
  const lines = splitLines(text);
  const first = lines[0] ?? "";
  let delim = ",", best = -1;
  for (const d of [",", ";", "\t"]) {
    const n = first.split(d).length - 1;
    if (n > best) { best = n; delim = d; }
  }
  return lines.map((l) => parseCsvLine(l, delim).map((c) => c.trim()));
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? `${v}` : `${v}`;
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
  if (o.richText) return o.richText.map((r) => r.text).join("").trim();
  if ("result" in o) return cellText(o.result);
  if (o.text != null) return String(o.text).trim();
  return String(v).trim();
}

export async function readXlsx(bytes: Uint8Array): Promise<string[][][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const grids: string[][][] = [];
  wb.eachSheet((ws) => {
    const g: string[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const out: string[] = [];
      for (let c = 1; c <= Math.max(ws.columnCount, row.cellCount); c++) out.push(cellText(row.getCell(c).value));
      while (out.length && out[out.length - 1] === "") out.pop();
      g.push(out);
    }
    grids.push(g);
  });
  return grids;
}

export async function readGrids(fileName: string, bytes: Uint8Array): Promise<string[][][]> {
  const low = fileName.toLowerCase();
  if (low.endsWith(".xlsx") || low.endsWith(".xlsm")) return readXlsx(bytes);
  if (low.endsWith(".csv") || low.endsWith(".txt")) return [readCsv(bytes)];
  return [];
}

// ====================================================================== file đáp án
export interface KeyFileResult { keys: Record<string, KeyMap>; errors: string[] }

/** Một bảng -> {mã đề: đáp án}. Tự nhận: mỗi mã đề 1 hàng / 1 cột / câu đánh số liền. */
export function keysFromGrids(fname: string, grids: string[][][]): KeyFileResult {
  const keys: Record<string, KeyMap> = {};
  const errors: string[] = [];
  for (let grid of grids) {
    grid = grid.filter((r) => r.some((c) => c !== ""));
    if (!grid.length) continue;
    // kiểu 1: hàng tiêu đề chứa nhãn câu
    let hdrI = -1;
    for (let i = 0; i < grid.length && i < 10; i++) {
      if (grid[i].filter((c) => qLabel.test(c)).length >= 3) { hdrI = i; break; }
    }
    if (hdrI >= 0) {
      const hdr = grid[hdrI];
      const cols = new Map<number, RegExpExecArray>();
      hdr.forEach((c, j) => { const m = qLabel.exec(c); if (m) cols.set(j, m); });
      let mcol = hdr.findIndex((c) => { const low = c.toLowerCase(); return low.includes("mã") || low.includes("ma de"); });
      if (mcol < 0) {
        const free = hdr.map((_, j) => j).filter((j) => !cols.has(j));
        if (!free.length) throw new Error("không tìm thấy cột mã đề");
        mcol = Math.min(...free);
      }
      for (const r of grid.slice(hdrI + 1)) {
        if (mcol >= r.length || !r[mcol]) continue;
        const made = normMade(r[mcol]);
        const d = (keys[made] ??= newKey());
        for (const [j, m] of cols) {
          if (j < r.length && r[j] !== "") {
            const part = m[1].toUpperCase() as Part;
            const q = parseInt(m[2]);
            const val = normValue(part, r[j]);
            if (val == null) errors.push(`${fname}: mã đề ${made} câu ${part}.${q} giá trị "${r[j]}" không hợp lệ`);
            else d[part][q] = val;
          }
        }
      }
      continue;
    }
    // kiểu 2: cột đầu là nhãn câu, hàng tiêu đề là mã đề
    const labRows = grid.map((r, i) => (r.length && qLabel.test(r[0]) ? i : -1)).filter((i) => i >= 0);
    if (labRows.length >= 3) {
      const hdr = labRows[0] > 0 ? grid[labRows[0] - 1] : grid[0];
      const mades = new Map<number, string>();
      for (let j = 1; j < hdr.length; j++) if (hdr[j]) mades.set(j, normMade(hdr[j]));
      for (const i of labRows) {
        const m = qLabel.exec(grid[i][0])!;
        const part = m[1].toUpperCase() as Part;
        const q = parseInt(m[2]);
        for (const [j, made] of mades) {
          if (j < grid[i].length && grid[i][j] !== "") {
            const val = normValue(part, grid[i][j]);
            if (val == null) errors.push(`${fname}: mã đề ${made} câu ${part}.${q} giá trị "${grid[i][j]}" không hợp lệ`);
            else (keys[made] ??= newKey())[part][q] = val;
          }
        }
      }
      continue;
    }
    // kiểu 3: câu đánh số liền
    const r3 = loadNumbered(grid, fname);
    Object.assign(keys, r3.keys);
    errors.push(...r3.errors);
  }
  return { keys, errors };
}

function classify(vals0: string[]): Part | null {
  const vals = vals0.map((v) => v.trim()).filter((v) => v !== "");
  if (!vals.length) return null;
  if (vals.every((v) => ["A", "B", "C", "D"].includes(v.toUpperCase()))) return "I";
  if (vals.every((v) => normP2(v) != null) && vals.every((v) => /^[ĐđDdSsTtFf]{4}$/.test(v))) return "II";
  return "III";
}

const total = (k: Record<string, KeyMap>) => Object.values(k).reduce((s, d) => s + keyCount(d), 0);

function loadNumbered(grid: string[][], fname: string): KeyFileResult {
  const build = (qrows: [number, Map<string, string>][]): KeyFileResult => {
    const keys: Record<string, KeyMap> = {};
    const errors: string[] = [];
    const cnt: Record<Part, number> = { I: 0, II: 0, III: 0 };
    const idx = qrows.map((_, i) => i).sort((a, b) => qrows[a][0] - qrows[b][0] || a - b);
    for (const i of idx) {
      const [qn, vals] = qrows[i];
      const part = classify([...vals.values()]);
      if (!part) continue;
      cnt[part]++;
      for (const [made, v] of vals) {
        if (v.trim() === "") continue;
        const val = normValue(part, v);
        if (val == null) errors.push(`${fname}: mã đề ${made} câu ${qn} giá trị "${v}" không hợp lệ`);
        else (keys[made] ??= newKey())[part][cnt[part]] = val;
      }
    }
    return { keys, errors };
  };

  let best: KeyFileResult = { keys: {}, errors: [] };
  const w = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const g = grid.map((r) => [...r, ...Array(w - r.length).fill("")]);
  // chiều 1: hàng tiêu đề là mã đề, cột đầu (có số câu) là câu
  for (let hi = 0; hi < g.length && hi < 12; hi++) {
    const hdr = g[hi];
    const mcols = new Map<number, string>();
    hdr.forEach((c, j) => { if (madeRe.test(c)) mcols.set(j, normMade(c)); });
    if (!mcols.size) continue;
    const minM = Math.min(...mcols.keys());
    for (let qc = 0; qc < minM; qc++) {
      const qrows: [number, Map<string, string>][] = [];
      for (const r of g.slice(hi + 1)) {
        const m = qNum.exec(r[qc]);
        if (m) {
          const vals = new Map<string, string>();
          for (const [j, made] of mcols) vals.set(made, r[j]);
          qrows.push([parseInt(m[1]), vals]);
        }
      }
      if (qrows.length >= 3 && qrows.length * mcols.size > 3 * Object.keys(best.keys).length) {
        const k = build(qrows);
        if (Object.keys(k.keys).length && total(k.keys) > total(best.keys)) best = k;
      }
    }
    if (Object.keys(best.keys).length) break;
  }
  if (Object.keys(best.keys).length) return best;
  // chiều 2: hàng tiêu đề là số câu, một cột là mã đề
  for (let hi = 0; hi < g.length && hi < 12; hi++) {
    const hdr = g[hi];
    const qcols = new Map<number, number>();
    hdr.forEach((c, j) => { const m = qNum.exec(c); if (m) qcols.set(j, parseInt(m[1])); });
    if (qcols.size < 3) continue;
    const minQ = Math.min(...qcols.keys());
    for (let mc = 0; mc < minQ; mc++) {
      const rows = g.slice(hi + 1).filter((r) => madeRe.test(r[mc]));
      if (rows.length) {
        const qrows: [number, Map<string, string>][] = [];
        for (const [j, qn] of qcols) {
          const vals = new Map<string, string>();
          for (const r of rows) vals.set(normMade(r[mc]), r[j]);
          qrows.push([qn, vals]);
        }
        return build(qrows);
      }
    }
  }
  return best;
}

export interface KeysLoad {
  keys: Record<string, KeyMap>;
  source: Record<string, string>;
  errors: string[];
  files: string[];
}

/** Nhiều file đáp án -> gộp lại, báo trùng mã đề khác đáp án. */
export async function loadKeys(files0: { name: string; bytes: Uint8Array }[]): Promise<KeysLoad> {
  const files = files0
    .filter((f) => !f.name.startsWith("~$") && /\.(xlsx|xlsm|csv)$/i.test(f.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const keys: Record<string, KeyMap> = {};
  const source: Record<string, string> = {};
  const errors: string[] = [];
  for (const { name, bytes } of files) {
    let r: KeyFileResult;
    try {
      r = keysFromGrids(name, await readGrids(name, bytes));
    } catch (e) {
      errors.push(`${name}: không đọc được (${(e as Error).message})`);
      continue;
    }
    errors.push(...r.errors);
    mergeKeys(keys, source, errors, r.keys, name);
  }
  return { keys, source, errors, files: files.map((f) => f.name) };
}

export function mergeKeys(
  keys: Record<string, KeyMap>, source: Record<string, string>, errors: string[],
  add: Record<string, KeyMap>, name: string,
) {
  for (const [made, d] of Object.entries(add)) {
    if (keys[made] && !sameKey(keys[made], d)) {
      errors.push(`Mã đề ${made} có 2 đáp án khác nhau: ${source[made]} và ${name}`);
      continue;
    }
    keys[made] = d;
    source[made] = name;
  }
}

/** Danh sách lớp -> {SBD: họ tên}. */
export async function loadStudents(fname: string, bytes: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const grid of await readGrids(fname, bytes)) {
    for (let i = 0; i < grid.length && i < 15; i++) {
      const low = grid[i].map((c) => c.toLowerCase());
      let js = -1, jn = -1;
      low.forEach((c, j) => {
        if (js < 0 && (c.includes("sbd") || c.includes("số báo danh") || c.includes("so bao danh"))) js = j;
        if (jn < 0 && (c.includes("tên") || c.includes("ten"))) jn = j;
      });
      if (js >= 0) {
        for (const rr of grid.slice(i + 1)) {
          if (js < rr.length && digits.test(numStr(rr[js]))) out[numStr(rr[js])] = jn >= 0 && jn < rr.length ? rr[jn] : "";
        }
        break;
      }
    }
  }
  return out;
}

// ====================================================================== QR / chữ của web đảo đề
const p2re = /^[ĐđDdSsTtFf]{4}$/;
const p3re = /^-?\d+([.,]\d+)?$/;

function fixMojibake(t: string): string {
  if (!t.includes("Ä") && !t.includes("Ã") && !t.includes("áº")) return t;
  try {
    const bytes = Uint8Array.from([...t].map((c) => c.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return t;
  }
}

const madeHead = /M[ãÃaA]\s*(?:đ[ềeÊ]\s*)?(\d{1,6})\s*:/giu;
const partHead = /Ph[ầâaẦÂA]n\s*(III|II|I)\s*:/giu;

function decodeText2(t: string): Record<string, KeyMap> {
  const out: Record<string, KeyMap> = {};
  const heads = [...t.matchAll(madeHead)];
  heads.forEach((h, i) => {
    const made = normMade(h[1]);
    const body = t.slice(h.index! + h[0].length, i + 1 < heads.length ? heads[i + 1].index : t.length);
    const k = newKey();
    const parts = [...body.matchAll(partHead)];
    parts.forEach((p, j) => {
      const part = p[1].toUpperCase() as Part;
      const seg = body.slice(p.index! + p[0].length, j + 1 < parts.length ? parts[j + 1].index : body.length).trim();
      for (const tok of seg.split(/[\s;,]+/).filter(Boolean)) {
        const m = (part === "III" ? /^(\d+)[=:]([^=]+)$/u : /^(\d+)[.:)=]?(.+)$/u).exec(tok);
        const v = m ? normValue(part, m[2]) : null;
        if (!m || v == null || (part === "III" && !p3re.test(v))) {
          throw new Error(`Mã đề ${made} Phần ${part}: "${tok}" không hợp lệ`);
        }
        k[part][parseInt(m[1])] = part === "III" ? v.replaceAll(",", ".") : v;
      }
    });
    if (!keyCount(k)) throw new Error(`Mã đề ${made} không có đáp án`);
    out[made] = k;
  });
  if (!Object.keys(out).length) throw new Error("QR không có mã đề nào");
  return out;
}

/** Chữ QR / chữ dán từ web đảo đề -> {mã đề: đáp án}. Ném lỗi nếu không phải đáp án. */
export function decodeKeysText(text: string): Record<string, KeyMap> {
  const t = fixMojibake(text).trim();
  madeHead.lastIndex = 0; partHead.lastIndex = 0;
  if (new RegExp(madeHead.source, "iu").test(t) && new RegExp(partHead.source, "iu").test(t)) return decodeText2(t);
  const out: Record<string, KeyMap> = {};
  for (const group of t.split("|")) {
    const g = group.trim();
    if (!g) continue;
    const c = g.indexOf(":");
    if (c <= 0) throw new Error(`QR không đúng dạng "mã đề:đáp án" (${g})`);
    const made = normMade(g.slice(0, c));
    if (!/^\d{1,6}$/.test(made)) throw new Error(`Mã đề không hợp lệ: ${g.slice(0, c)}`);
    const k = newKey();
    const cnt: Record<Part, number> = { I: 0, II: 0, III: 0 };
    for (const v0 of g.slice(c + 1).split(",")) {
      const v = v0.trim();
      if (!v) continue;
      let part: Part;
      if (["A", "B", "C", "D"].includes(v.toUpperCase())) part = "I";
      else if (p2re.test(v)) part = "II";
      else if (p3re.test(v)) part = "III";
      else throw new Error(`Mã đề ${made}: giá trị "${v}" không hợp lệ`);
      cnt[part]++;
      k[part][cnt[part]] = part === "III" ? v.replaceAll(",", ".") : normValue(part, v)!;
    }
    if (!keyCount(k)) throw new Error(`Mã đề ${made} không có đáp án`);
    out[made] = k;
  }
  if (!Object.keys(out).length) throw new Error("QR không có mã đề nào");
  return out;
}

/** Đáp án -> chữ dạng web đảo đề (để hiển thị / tạo QR). */
export function encodeKeysText(keys: Record<string, KeyMap>): string {
  const groups = Object.keys(keys).sort().map((made) => {
    const k = keys[made];
    const line = (p: Part, f: (q: number, v: string) => string) =>
      `Phần ${p}: ${Object.keys(k[p]).map(Number).sort((a, b) => a - b).map((q) => f(q, k[p][q])).join(" ")}`;
    const shown = made.length === 4 && made.startsWith("0") ? made.slice(1) : made;
    return [
      `Mã ${shown}:`,
      ...(Object.keys(k.I).length ? [line("I", (q, v) => `${q}${v}`)] : []),
      ...(Object.keys(k.II).length ? [line("II", (q, v) => `${q}${v.replaceAll("D", "Đ")}`)] : []),
      ...(Object.keys(k.III).length ? [line("III", (q, v) => `${q}=${v.replaceAll(",", ".")}`)] : []),
    ].join("\n");
  });
  return `ĐÁP ÁN - ${groups.length} MÃ ĐỀ\n\n${groups.join("\n\n")}`;
}
