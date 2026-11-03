// Xuất kết quả: Excel 6 trang giống bản máy tính / điện thoại + mô tả vẽ ảnh đã chấm (lõi C++ omr_annotate).
import {
  type Session, type SheetRec, active, gradeAll, groupsFromAnswer, keyFor, maxScore, pyRound, pyRound2,
  studentName, tplOf, sbdDigits, madeDigits,
} from "./session";

const ORDER: Record<string, number> = { I: 0, II: 1, III: 2 };

export function questionColumns(s: Session): string[] {
  const all = new Set<string>();
  for (const made of Object.keys(s.keys)) {
    const k = keyFor(s, made)!;
    for (const q of Object.keys(k.I)) all.add(`I.${q}`);
    for (const q of Object.keys(k.II)) for (const lt of "abcd") all.add(`II.${q}${lt}`);
    for (const q of Object.keys(k.III)) all.add(`III.${q}`);
  }
  const num = (c: string) => parseInt(c.split(".")[1].replace(/\D/g, ""));
  return [...all].sort((a, b) => {
    const pa = ORDER[a.split(".")[0]], pb = ORDER[b.split(".")[0]];
    if (pa !== pb) return pa - pb;
    const na = num(a), nb = num(b);
    if (na !== nb) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Phiếu đang chấm, xếp theo (SBD, tên) như bản máy tính. */
export function sortedActive(s: Session): SheetRec[] {
  return active(s).sort((a, b) => (a.sbd < b.sbd ? -1 : a.sbd > b.sbd ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export interface Stats { n: number; dropped: number; mean: number | null; max: number | null; min: number | null; hist: number[] }

export function statsOf(s: Session): Stats {
  const sheets = active(s).filter((x) => x.grade);
  const tot = sheets.map((sh) => sh.grade!.tong);
  const hist = Array(10).fill(0);
  for (const x of tot) for (let lo = 0; lo < 10; lo++) if ((lo <= x && x < lo + 1) || (lo === 9 && x === 10)) hist[lo]++;
  return {
    n: sheets.length,
    dropped: s.sheets.length - active(s).length,
    mean: tot.length ? pyRound2(tot.reduce((a, b) => a + b, 0) / tot.length) : null,
    max: tot.length ? Math.max(...tot) : null,
    min: tot.length ? Math.min(...tot) : null,
    hist,
  };
}

/** Tên ảnh đã chấm: SBD_mãđề_têngốc.jpg */
export function gradedImageName(sh: SheetRec): string {
  const stem = sh.name.includes(".") ? sh.name.slice(0, sh.name.lastIndexOf(".")) : sh.name;
  return `${sh.sbd}_${sh.made}_${stem}.jpg`;
}

/** Mô tả vẽ (JSON cho omr_annotate): xanh lá đúng, đỏ sai, xanh dương = đáp án đúng. Màu BGR như OpenCV. */
export function gradedSpec(s: Session, sh: SheetRec, scale = 0.6): string {
  const t = tplOf(s, sh)!;
  const idx = new Map<string, number>();
  t.key.forEach((k, i) => { const id = `${k}|${t.value[i]}`; if (!idx.has(id)) idx.set(id, i); });
  const circles: number[][] = [];
  const green = [0, 170, 0], red = [0, 0, 220], blue = [220, 120, 0];
  const ring = (key: string, val: string, color: number[], w = 3, extra = 0) => {
    const i = idx.get(`${key}|${val}`);
    if (i == null) return;
    const r = Math.floor(t.r[i]) + 2 + extra;
    circles.push([Math.floor(sh.pos[i][0]), Math.floor(sh.pos[i][1]), r, ...color, w]);
  };
  for (const [k, d] of Object.entries(sh.grade!.detail)) {
    const [part, q] = k.split(".");
    const [a, key, ok] = d;
    if (part === "I" || part === "II") {
      const g = part === "I" ? `p1_q${q}` : `p2_q${q.slice(0, -1)}_${q.slice(-1)}`;
      if (a && a !== "*") ring(g, a, ok ? green : red);
      if (!ok) ring(g, key, blue, 2, 5);
    } else {
      const color = ok ? green : red;
      for (const [g, ch] of Object.entries(groupsFromAnswer(k, a, sh))) if (ch && ch !== "*") ring(g, ch, color);
    }
  }
  for (const [name, n] of [["sbd", sbdDigits(t)], ["made", madeDigits(t)]] as const) {
    const v = (name === "sbd" ? sh.sbd : sh.made).padStart(n, "?");
    for (let c = 0; c < v.length; c++) ring(`${name}_${c + 1}`, v[c], green, 2);
  }
  const g = sh.grade!;
  const f2 = (x: number) => x.toFixed(2);
  const txt = `SBD ${sh.sbd}  Ma de ${sh.made}  Diem ${f2(g.tong)}  (P1 ${f2(g.p1)} P2 ${f2(g.p2)} P3 ${f2(g.p3)})`;
  return JSON.stringify({ scale, quality: 85, circles, texts: [[50, 42, 1.0, 200, 0, 0, txt]] });
}

// ====================================================================== Excel
type Cell = string | number | null | { v: string | number; style: number };
// style: 1 tiêu đề, 2 đúng (xanh), 3 sai (đỏ), 4 sửa tay (vàng), 5 đậm
const FILL: Record<number, string> = { 1: "FF1F3A5F", 2: "FFC6EFCE", 3: "FFFFC7CE", 4: "FFFFE08A" };

/** Tạo file Excel kết quả (tự chấm nếu chưa chấm). */
export async function buildResultXlsx(s: Session): Promise<Uint8Array> {
  if (!s.graded) gradeAll(s);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, header: string[], rows: Cell[][], widths: Record<number, number> = {}) => {
    const ws = wb.addWorksheet(name);
    const hr = ws.addRow(header);
    hr.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL[1] } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    for (const r of rows) {
      const row = ws.addRow(r.map((c) => (c != null && typeof c === "object" ? c.v : c ?? "")));
      r.forEach((c, j) => {
        if (c == null || typeof c !== "object") return;
        const cell = row.getCell(j + 1);
        if (c.style === 5) cell.font = { bold: true };
        else if (FILL[c.style]) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL[c.style] } };
          cell.alignment = { horizontal: "center" };
        }
      });
    }
    for (const [i, w] of Object.entries(widths)) ws.getColumn(+i + 1).width = w;
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const sheets = sortedActive(s);
  sheet("Bang diem",
    ["STT", "SBD", "Họ tên", "Mã đề", "Phần I", "Phần II", "Phần III", "Tổng điểm", "Số câu đã sửa tay", "File ảnh"],
    sheets.map((sh, n) => {
      const g = sh.grade!;
      return [n + 1, sh.sbd, studentName(s, sh.sbd) ?? "", sh.made, g.p1, g.p2, g.p3, { v: g.tong, style: 5 },
        Object.keys(sh.edits).length, sh.name];
    }),
    { 0: 6, 1: 12, 2: 26, 3: 8, 4: 9, 5: 9, 6: 9, 7: 11, 8: 11, 9: 34 });

  const qcols = questionColumns(s);
  const w2: Record<number, number> = { 0: 12 };
  for (let j = 2; j < qcols.length + 2; j++) w2[j] = 6;
  sheet("Chi tiet", ["SBD", "Mã đề", ...qcols], sheets.map((sh) => {
    const det = sh.grade!.detail;
    return [sh.sbd, sh.made, ...qcols.map((k): Cell =>
      det[k] ? { v: det[k][0], style: k in sh.edits ? 4 : det[k][2] ? 2 : 3 } : "")];
  }), w2);

  sheet("Dap an", ["Mã đề", "Nguồn đáp án", ...qcols], Object.keys(s.keys).sort().map((made) => {
    const k = keyFor(s, made)!;
    const row: Cell[] = [made, s.key_source[made] ?? ""];
    for (const c of qcols) {
      const [part, q] = c.split(".");
      if (part === "II") {
        const v = k.II[parseInt(q.slice(0, -1))];
        row.push(v == null ? "" : v["abcd".indexOf(q.slice(-1))].replaceAll("D", "Đ"));
      } else row.push(k[part as "I" | "III"][parseInt(q)] ?? "");
    }
    return row;
  }));

  const st = statsOf(s);
  const r4: Cell[][] = [
    ["Số phiếu chấm", st.n], ["Phiếu bỏ", st.dropped], ["Điểm trung bình", st.mean ?? ""],
    ["Điểm cao nhất", st.max ?? ""], ["Điểm thấp nhất", st.min ?? ""],
    ["Số câu sửa tay", s.log.filter((l) => !["SBD", "MADE", "PHIEU"].includes(l.muc)).length],
    ["Thời điểm chấm", s.graded_at ?? ""], [], [{ v: "Khoảng điểm", style: 5 }, { v: "Số học sinh", style: 5 }],
  ];
  for (let lo = 0; lo < 10; lo++) r4.push([lo < 9 ? `${lo} – <${lo + 1}` : "9 – 10", st.hist[lo]]);
  r4.push([], [{ v: "Câu", style: 5 }, { v: "Tỉ lệ đúng (%)", style: 5 }]);
  for (const k of qcols) {
    const v = sheets.filter((sh) => sh.grade!.detail[k]).map((sh) => sh.grade!.detail[k][2]);
    if (v.length) r4.push([k, pyRound((100 * v.filter(Boolean).length) / v.length, 1)]);
  }
  const mx = [...new Set(Object.keys(s.keys).map((m) => maxScore(s, m)))];
  r4.push([], ["Điểm tối đa", mx.length === 1 ? mx[0] : mx.join(" / ")]);
  sheet("Thong ke", ["Chỉ số", "Giá trị"], r4, { 0: 22, 1: 18 });

  sheet("Nhat ky sua", ["Thời gian", "Phiếu", "Mục", "Giá trị cũ", "Giá trị mới", "Người sửa"],
    s.log.map((l) => [l.time, l.file, l.muc, l.cu, l.moi, l.nguoi]), { 0: 20, 1: 34, 2: 10, 3: 12, 4: 18, 5: 10 });

  const dropped = s.sheets.filter((x) => x.dropped);
  if (dropped.length)
    sheet("Phieu bo", ["Phiếu", "Lý do"], dropped.map((x) => [x.name, x.error ?? x.drop_reason ?? "Giáo viên bỏ phiếu"]), { 0: 34, 1: 30 });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
