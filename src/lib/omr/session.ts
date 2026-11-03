// Phiên chấm: soát lỗi + chấm điểm. Dịch sát lib/core/session.dart (app v1.5.3, = cham_core.py v14).
// Dữ liệu là object thuần (lưu thẳng vào IndexedDB / Supabase), các hàm bên dưới thao tác trên đó.
import { type KeyMap, type Part, newKey, PARTS } from "./keys";

export const reasonVi: Record<string, string> = {
  nghi_ngo: "Tô nhạt hoặc không rõ",
  nhieu_o: "Tô nhiều ô",
  net_la: "Có nét lạ (tẩy dở, gạch)",
  can_chinh_kem: "Vùng phiếu căn chỉnh kém",
  sai_dinh_dang: "Phần III: số không hợp lệ",
  o_trong_giua: "Phần III: có cột trống ở giữa",
  trong: "Cột để trống",
  trong_anh_1bit: "Trống trên ảnh đen trắng",
  so_anh_1bit: "Phần III trên ảnh đen trắng",
  vet_scan: "Vệt bụi máy scan",
  to_khong_kin: "Ô tô không kín / nét gạch",
  to_rat_nhat: "Tô rất nhạt",
  hai_o_sat_nhau: "Hai ô tô gần bằng nhau",
};

export function nowStr(): string {
  const t = new Date();
  const two = (x: number) => `${x}`.padStart(2, "0");
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())} ${two(t.getHours())}:${two(t.getMinutes())}:${two(t.getSeconds())}`;
}

/** round() của Python (nửa về số chẵn trên giá trị nhị phân thật). */
export function pyRound(x: number, nd: number): number {
  const p = nd === 1 ? 10 : nd === 2 ? 100 : 1000;
  const y = x * p;
  const f = Math.floor(y);
  if (y - f === 0.5 && (f + 0.5) / p === x) return (f % 2 === 0 ? f : f + 1) / p;
  return parseFloat(x.toFixed(nd));
}
export const pyRound2 = (x: number) => pyRound(x, 2);

// ====================================================================== kiểu dữ liệu
export interface TplInfo {
  id: string; name: string;
  key: string[]; value: string[]; r: number[];
  warp_w: number; warp_h: number;
}

/** [đáp án HS, đáp án đúng, đúng?] */
export type QDetail = [string, string, boolean];
export interface Grade { p1: number; p2: number; p3: number; tong: number; detail: Record<string, QDetail> }

export interface SheetRec {
  id: number;
  name: string;           // tên hiển thị (vd Anh_093012_120.jpg)
  ok: boolean; dropped: boolean; id_done: boolean;
  q_done: Record<string, boolean>;
  edits: Record<string, string>;
  error: string | null; tpl: string | null; tpl_name: string | null; mode: string | null;
  drop_reason: string | null;
  rotation: number;
  sbd: string; made: string;
  answers: Record<string, string>;
  flags: string[];
  p3bad: Record<string, number[]>;
  thresholds: [number, number];
  pos: [number, number][];
  scores: number[];
  canh_bao: string[];
  p3cols_all: Record<string, string[]>;
  grade: Grade | null;
  added: string;
  /** đã có ảnh nắn trong kho ảnh (IndexedDB / Storage) */
  has_warped: boolean;
}

export interface LogEntry { time: string; file: string; muc: string; cu: string; moi: string; nguoi: string }

export interface Scale {
  p1: number;
  p2: "bgd" | "deu";
  p3: number;
  /** số câu tối đa mỗi phần (null = theo đáp án) */
  n: [number | null, number | null, number | null];
  /** điểm cả phần (null = theo điểm mỗi câu) */
  t: [number | null, number | null, number | null];
}

export interface Session {
  version: number;
  id: string; name: string; created: string; updated: string;
  keys: Record<string, KeyMap>;
  key_source: Record<string, string>;
  key_errors: string[];
  students: Record<string, string>;
  class_file: string | null;
  scale: Scale;
  sheets: SheetRec[];
  log: LogEntry[];
  graded: boolean; graded_at: string | null;
  tpls: Record<string, TplInfo>;
  next_id: number;
  /** bỏ qua soát SBD (chấm bằng điện thoại cá nhân, học sinh không cần tô SBD): chỉ soát mã đề */
  skip_sbd?: boolean;
}

export interface Problem { code: string; msg: string; blocking: boolean }
export interface QItem { sh: SheetRec; key: string; why: string }

export const defaultScale = (): Scale => ({ p1: 0.25, p2: "bgd", p3: 0.5, n: [null, null, null], t: [null, null, null] });

export function newSession(id: string, name: string): Session {
  const t = nowStr();
  return {
    version: 1, id, name, created: t, updated: t,
    keys: {}, key_source: {}, key_errors: [], students: {}, class_file: null,
    scale: defaultScale(), sheets: [], log: [], graded: false, graded_at: null, tpls: {}, next_id: 0,
  };
}

const P2_BGD: Record<number, number> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0 };

export const tplOf = (s: Session, sh: SheetRec) => (sh.tpl ? s.tpls[sh.tpl] : undefined);
export const active = (s: Session) => s.sheets.filter((x) => !x.dropped);

export function tplGroups(t: TplInfo): Record<string, number[]> {
  const g: Record<string, number[]> = {};
  t.key.forEach((k, i) => (g[k] ??= []).push(i));
  return g;
}
export const sbdDigits = (t: TplInfo) => Object.keys(tplGroups(t)).filter((k) => k.startsWith("sbd_")).length;
export const madeDigits = (t: TplInfo) => Object.keys(tplGroups(t)).filter((k) => k.startsWith("made_")).length;

export function studentName(s: Session, sbd: string): string | null {
  if (sbd in s.students) return s.students[sbd];
  const z = sbd.replace(/^0+/, "");
  for (const [k, v] of Object.entries(s.students)) if (k.replace(/^0+/, "") === z) return v;
  return null;
}

// ====================================================================== nạp kết quả lõi C++
export function newSheet(s: Session, name: string): SheetRec {
  const sh: SheetRec = {
    id: s.next_id++, name, ok: false, dropped: false, id_done: false, q_done: {}, edits: {},
    error: null, tpl: null, tpl_name: null, mode: null, drop_reason: null, rotation: 0,
    sbd: "", made: "", answers: {}, flags: [], p3bad: {}, thresholds: [0, 0], pos: [], scores: [],
    canh_bao: [], p3cols_all: {}, grade: null, added: nowStr(), has_warped: false,
  };
  s.sheets.push(sh);
  s.graded = false;
  return sh;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** js: JSON trả về từ omr_read. */
export function applyRead(s: Session, sh: SheetRec, js: any, hasWarped: boolean) {
  sh.q_done = {}; sh.edits = {}; sh.id_done = false; sh.grade = null;
  if (js.ok !== true) {
    sh.ok = false;
    sh.error = js.error ?? "Không đọc được phiếu";
    s.graded = false;
    return;
  }
  const tid: string = js.template_id;
  if (!s.tpls[tid]) {
    const bs = js.bubbles as any[];
    const ws = js.warped_size ?? [0, 0];
    s.tpls[tid] = {
      id: tid, name: js.template_name ?? tid,
      key: bs.map((b) => b.key), value: bs.map((b) => b.value), r: bs.map((b) => +b.r),
      warp_w: ws[0] | 0, warp_h: ws[1] | 0,
    };
  }
  const bs = js.bubbles as any[];
  Object.assign(sh, {
    ok: true, error: null, tpl: tid, tpl_name: js.template_name ?? tid, mode: js.mode ?? null,
    rotation: js.rotation ?? 0, sbd: js.sbd, made: js.made, answers: { ...js.answers },
    flags: [...js.flag_codes],
    p3bad: Object.fromEntries(Object.entries(js.p3bad ?? {}).map(([k, v]) => [`${k}`, (v as number[]).map((x) => x | 0)])),
    thresholds: [+js.thresholds.lo, +js.thresholds.hi],
    has_warped: hasWarped,
    pos: bs.map((b) => [+b.x, +b.y]),
    scores: bs.map((b) => +b.score),
    canh_bao: js.canh_bao ?? [],
  } satisfies Partial<SheetRec>);
  // cột Phần III gốc (để bấm chọn đúng cột kể cả khi có cột trống ở giữa)
  sh.p3cols_all = {};
  const t = s.tpls[tid];
  const groups = tplGroups(t);
  for (const [key, val] of Object.entries(sh.answers)) {
    if (!key.startsWith("III.")) continue;
    const cols: string[] = [];
    for (const g of groupsOf(key)) {
      const ids = groups[g];
      if (!ids?.length) { cols.push(""); continue; }
      let top = ids[0];
      for (const i of ids) if (sh.scores[i] > sh.scores[top]) top = i;
      const v = t.value[top];
      cols.push(val.includes(v) && sh.scores[top] >= sh.thresholds[1] ? v : "");
    }
    if (cols.join("") === val) sh.p3cols_all[key] = cols;
  }
  s.graded = false;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ====================================================================== soát SBD / mã đề
export function idProblems(s: Session, sh: SheetRec): Problem[] {
  if (!sh.ok && sh.error == null) return [{ code: "dang_doc", msg: "Đang đọc phiếu…", blocking: true }];
  if (!sh.ok) return [{ code: "loi", msg: `Không đọc được phiếu: ${sh.error}`, blocking: true }];
  const out: Problem[] = [];
  const { sbd, made } = sh;
  const bad = (x: string) => x.includes("?") || x.includes("*");
  const skip = !!s.skip_sbd;
  if (!skip) {
    if (bad(sbd)) out.push({ code: "sbd", msg: "SBD tô thiếu / tô 2 ô", blocking: true });
    else if (sh.flags.some((f) => f.startsWith("sbd_")) && !sh.id_done)
      out.push({ code: "sbd_mo", msg: "SBD tô nhạt, cần xác nhận", blocking: false });
  }
  if (bad(made)) out.push({ code: "made", msg: "Mã đề tô thiếu / tô 2 ô", blocking: true });
  else if (sh.flags.some((f) => f.startsWith("made_")) && !sh.id_done)
    out.push({ code: "made_mo", msg: "Mã đề tô nhạt, cần xác nhận", blocking: false });
  if (Object.keys(s.keys).length && !(made in s.keys) && !bad(made))
    out.push({ code: "made_lech", msg: `Mã đề ${made} không có trong đáp án`, blocking: true });
  // bỏ qua SBD: chỉ cảnh báo (không chặn) khi SBD đọc rõ mà trùng – thường là chụp lại cùng một phiếu
  const dup = active(s).filter((o) => o !== sh && o.ok && o.sbd === sbd && o.made === made);
  if (dup.length && (skip ? /^\d+$/.test(sbd) : !sbd.includes("?")))
    out.push({ code: "trung", msg: `Trùng SBD + mã đề với ${dup.map((o) => o.name).join(", ")}`, blocking: !skip });
  if (!skip && Object.keys(s.students).length && !sbd.includes("?") && studentName(s, sbd) == null)
    out.push({ code: "ngoai_ds", msg: "SBD không có trong danh sách lớp", blocking: false });
  return out;
}

/** SBD để hiển thị / xuất file: đang bỏ qua soát SBD mà SBD đọc không rõ thì để trống. */
export const sbdShown = (s: Session, sh: SheetRec) => (s.skip_sbd && /[^\d]/.test(sh.sbd) ? "" : sh.sbd);

export function idQueue(s: Session): [SheetRec, Problem[]][] {
  const q: [SheetRec, Problem[]][] = [];
  for (const sh of active(s)) {
    const pr = idProblems(s, sh);
    if (pr.length && (!sh.id_done || pr.some((p) => p.blocking))) q.push([sh, pr]);
  }
  return q;
}

function log(s: Session, sh: SheetRec, muc: string, cu: string, moi: string, nguoi = "GV") {
  s.log.push({ time: nowStr(), file: sh.name, muc, cu, moi, nguoi });
}

export function setId(s: Session, sh: SheetRec, v: { sbd?: string; made?: string }) {
  if (v.sbd != null && v.sbd !== sh.sbd) { log(s, sh, "SBD", sh.sbd, v.sbd); sh.sbd = v.sbd; }
  if (v.made != null && v.made !== sh.made) { log(s, sh, "MADE", sh.made, v.made); sh.made = v.made; }
  s.graded = false;
}

/** Trả về các lỗi chặn (rỗng = đã xác nhận). */
export function confirmId(s: Session, sh: SheetRec): string[] {
  const blocking = idProblems(s, sh).filter((p) => p.blocking).map((p) => p.msg);
  if (blocking.length) return blocking;
  sh.id_done = true;
  return [];
}

export function dropSheet(s: Session, sh: SheetRec, reason = "Bỏ phiếu") {
  sh.dropped = true; sh.drop_reason = reason;
  log(s, sh, "PHIEU", "", reason);
  s.graded = false;
}

export function restoreSheet(s: Session, sh: SheetRec) {
  sh.dropped = false; sh.drop_reason = null;
  log(s, sh, "PHIEU", "Bỏ phiếu", "Khôi phục");
  s.graded = false;
}

// ====================================================================== soát câu
export function keyFor(s: Session, made: string): KeyMap | undefined {
  const k = s.keys[made];
  if (!k || !s.scale.n.some((x) => x != null)) return k;
  const out = newKey();
  PARTS.forEach((p, i) => {
    const lim = s.scale.n[i];
    for (const [q, v] of Object.entries(k[p])) if (lim == null || +q <= lim) out[p][+q] = v;
  });
  return out;
}

export function partCount(s: Session, made: string, part: number): number {
  const lim = s.scale.n[part];
  if (lim != null) return lim;
  const k = keyFor(s, made);
  return k ? Object.keys(k[PARTS[part]]).length : 0;
}

export function perQuestion(s: Session, made: string, part: number): number {
  const tot = s.scale.t[part];
  if (tot != null) {
    const c = partCount(s, made, part);
    return c === 0 ? 0 : tot / c;
  }
  return part === 0 ? s.scale.p1 : part === 1 ? 1.0 : s.scale.p3;
}

export function maxScore(s: Session, made: string): number {
  let m = 0;
  for (let p = 0; p < 3; p++) m += partCount(s, made, p) * perQuestion(s, made, p);
  return pyRound2(m);
}

export function configWarnings(s: Session): string[] {
  const out: string[] = [];
  for (const made of Object.keys(s.keys).sort()) {
    PARTS.forEach((p, i) => {
      const lim = s.scale.n[i];
      if (lim == null) return;
      const miss: number[] = [];
      for (let q = 1; q <= lim; q++) if (!(q in s.keys[made][p])) miss.push(q);
      if (miss.length)
        out.push(`Mã đề ${made} thiếu đáp án Phần ${p} câu ${miss.length > 6 ? `${miss.slice(0, 6).join(", ")}…` : miss.join(", ")}`);
    });
  }
  return out;
}

export function inKey(s: Session, sh: SheetRec, key: string): boolean {
  const k = keyFor(s, sh.made);
  if (!k) return true;
  const dot = key.indexOf(".");
  const part = key.slice(0, dot) as Part;
  let q = key.slice(dot + 1);
  if (part === "II") q = q.slice(0, -1);
  return parseInt(q) in k[part];
}

const isQ = (key: string) => key.startsWith("I.") || key.startsWith("II.") || key.startsWith("III.");

export function qItems(s: Session): QItem[] {
  const out: QItem[] = [];
  for (const sh of active(s)) {
    if (!sh.ok) continue;
    for (const f of sh.flags) {
      const i = f.indexOf(":");
      const key = f.slice(0, i), why = f.slice(i + 1);
      if (isQ(key) && inKey(s, sh, key)) out.push({ sh, key, why: reasonVi[why] ?? why });
    }
  }
  return out;
}

export const qQueue = (s: Session) => qItems(s).filter((it) => it.sh.q_done[it.key] !== true);

export function setAnswer(s: Session, sh: SheetRec, key: string, value: string) {
  const old = sh.answers[key] ?? "";
  if (value !== old) {
    log(s, sh, key, old, value);
    sh.answers[key] = value;
    sh.edits[key] = value;
  }
  sh.q_done[key] = true;
  s.graded = false;
}

export const readyToGrade = (s: Session) => idQueue(s).length === 0 && qQueue(s).length === 0;

// ====================================================================== chấm điểm
const sortedQs = (m: Record<number, string>) => Object.keys(m).map(Number).sort((a, b) => a - b);

export function gradeSheet(s: Session, sh: SheetRec): Grade {
  const key = keyFor(s, sh.made)!;
  const ans = sh.answers;
  const q1 = perQuestion(s, sh.made, 0), q2 = perQuestion(s, sh.made, 1), q3 = perQuestion(s, sh.made, 2);
  let p1 = 0, p2 = 0, p3 = 0;
  const detail: Record<string, QDetail> = {};
  for (const q of sortedQs(key.I)) {
    const k = key.I[q];
    const a = ans[`I.${q}`] ?? "";
    const ok = a === k;
    if (ok) p1 += q1;
    detail[`I.${q}`] = [a, k, ok];
  }
  for (const q of sortedQs(key.II)) {
    const k = key.II[q];
    let right = 0;
    for (let j = 0; j < 4; j++) {
      const lt = "abcd"[j];
      const a = ans[`II.${q}${lt}`] ?? "";
      const ok = j < k.length && a === k[j];
      if (ok) right++;
      detail[`II.${q}${lt}`] = [a, j < k.length ? k[j] : "", ok];
    }
    p2 += s.scale.p2 === "bgd" ? P2_BGD[right] * q2 : (q2 / 4) * right;
  }
  for (const q of sortedQs(key.III)) {
    const k = key.III[q];
    const a = ans[`III.${q}`] ?? "";
    const ok = p3Equal(a, k);
    if (ok) p3 += q3;
    detail[`III.${q}`] = [a, k, ok];
  }
  p1 = pyRound2(p1); p2 = pyRound2(p2); p3 = pyRound2(p3);
  return { p1, p2, p3, tong: pyRound2(p1 + p2 + p3), detail };
}

export function gradeAll(s: Session) {
  if (!readyToGrade(s)) throw new Error("Còn phiếu / câu chưa soát xong");
  for (const sh of active(s)) sh.grade = gradeSheet(s, sh);
  s.graded = true;
  s.graded_at = nowStr();
}

// ====================================================================== tiện ích nhóm ô
/** 'I.5' -> ['p1_q5'] ; 'II.3c' -> ['p2_q3_c'] ; 'III.4' -> ['p3_q4_c1'..'c4'] */
export function groupsOf(key: string): string[] {
  if (key.startsWith("III.")) return [1, 2, 3, 4].map((c) => `p3_q${key.slice(4)}_c${c}`);
  if (key.startsWith("II.")) {
    const r = key.slice(3);
    return [`p2_q${r.slice(0, -1)}_${r.slice(-1)}`];
  }
  if (key.startsWith("I.")) return [`p1_q${key.slice(2)}`];
  return [];
}

export function answerFromGroups(key: string, sel: Record<string, string>): string {
  const gs = groupsOf(key);
  if (key.startsWith("III.")) return gs.map((g) => sel[g] ?? "").join("");
  return sel[gs[0]] ?? "";
}

export function groupsFromAnswer(key: string, value: string, sh?: SheetRec): Record<string, string> {
  const gs = groupsOf(key);
  if (key.startsWith("III.")) {
    let cols: string[] | undefined;
    if (sh && !(key in sh.edits)) cols = sh.p3cols_all[key];
    cols ??= [...value.split(""), ...Array(Math.max(0, 4 - value.length)).fill("")];
    return Object.fromEntries(gs.map((g, i) => [g, cols![i] ?? ""]));
  }
  return { [gs[0]]: value };
}

const num = (v: string) => {
  const t = v.replaceAll(",", ".").trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) ? parseFloat(t) : null;
};

export function p3Equal(a: string, k: string): boolean {
  if (!a || a.includes("*")) return false;
  const x = num(a), y = num(k);
  if (x != null && y != null) return Math.abs(x - y) < 1e-9;
  return a.replaceAll(",", ".") === k.replaceAll(",", ".");
}

export function dispAnswer(key: string, v: string): string {
  if (v === "*") return "Không chấm";
  if (key.startsWith("II.")) return v === "D" ? "Đ" : v || "—";
  return v || "—";
}

export function normInput(key: string, v: string): string | null {
  v = v.trim().toUpperCase();
  if (key.startsWith("II.")) {
    v = v.replaceAll("Đ", "D");
    return ["D", "S", ""].includes(v) ? v : null;
  }
  if (key.startsWith("I.")) return ["A", "B", "C", "D", ""].includes(v) ? v : null;
  v = v.replaceAll(".", ",");
  return v.length <= 4 && [...v].every((c) => "-,0123456789".includes(c)) ? v : null;
}

export const validP3 = (v: string) => v === "" || /^-?\d+(,\d+)?$/.test(v);
export const validSbd = (s: string, maxDigits: number) => /^\d+$/.test(s) && s.length >= 4 && s.length <= maxDigits;
export const validMade = (s: string, digits: number) => /^\d+$/.test(s) && s.length === digits;

/** Đáp án Phần III gõ tay: chấp nhận chấm/phẩy, tối đa 4 ký tự. Trả giá trị chuẩn (dấu phẩy) hoặc null. */
export function normKeyP3(v: string): string | null {
  const x = normInput("III.1", v.replaceAll(" ", ""));
  if (x == null || x === "" || !validP3(x)) return null;
  return x;
}
