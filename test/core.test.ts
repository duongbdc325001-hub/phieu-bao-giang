// Port của test/core_test.dart (app v1.5.3): bản web phải cho kết quả y hệt bản điện thoại / máy tính.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  type KeyMap, decodeKeysText, encodeKeysText, keysFromGrids, loadKeys, loadStudents, newKey, readGrids, PARTS,
} from "@/lib/omr/keys";
import {
  type SheetRec, type Session, confirmId, configWarnings, dispAnswer, dropSheet, gradeAll, gradeSheet,
  idProblems, inKey, madeKey, maxScore, newSession, newSheet, normKeyP3, p3Equal, readyToGrade, sbdShown, validP3,
} from "@/lib/omr/session";
import { gradedImageName } from "@/lib/omr/export";

const fx = (n: string) => new Uint8Array(readFileSync(`test/fixtures/${n}`));
const pub = (n: string) => new Uint8Array(readFileSync(`public/omr/${n}`));
const loadKeyFile = async (name: string, bytes: Uint8Array) => keysFromGrids(name, await readGrids(name, bytes));
const enc = (s: string) => new TextEncoder().encode(s);
const plain = (m: Record<number, string>) => JSON.parse(JSON.stringify(m));

function mkSheet(s: Session | null, ans: Record<string, string>, made = "0001", sbd = "123456"): SheetRec {
  const tmp = s ?? newSession("x", "x");
  const sh = newSheet(tmp, "x.jpg");
  Object.assign(sh, { ok: true, sbd, made, answers: ans });
  return sh;
}

describe("Đọc file đáp án", () => {
  test("Mỗi mã đề 1 hàng (.xlsx) và 1 cột (.csv) ra cùng kết quả", async () => {
    const a = await loadKeyFile("dap_an_moi_ma_de_1_hang.xlsx", fx("dap_an_moi_ma_de_1_hang.xlsx"));
    const b = await loadKeyFile("dap_an_moi_ma_de_1_cot.csv", fx("dap_an_moi_ma_de_1_cot.csv"));
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(Object.keys(a.keys)).toEqual(["1110", "1112", "1114", "1116"]);
    expect(Object.keys(b.keys)).toEqual(["1110", "1112", "1114", "1116"]);
    for (const m of Object.keys(a.keys)) for (const p of PARTS) expect(a.keys[m][p]).toEqual(b.keys[m][p]);
    const k = a.keys["1110"];
    expect(Object.keys(k.I).length).toBe(12);
    expect(k.II[1]).toBe("DSDS");
    expect(k.III[5]).toBe("-0.9");
  });

  test("Câu đánh số liền: 16 mã đề, mã 1001 có I:12, II:2, III:4", async () => {
    const r = await loadKeyFile("dap_an_danh_so_lien.xlsx", fx("dap_an_danh_so_lien.xlsx"));
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.keys).length).toBe(16);
    const k = r.keys["1001"];
    expect([Object.keys(k.I).length, Object.keys(k.II).length, Object.keys(k.III).length]).toEqual([12, 2, 4]);
    expect(k.III[2]).toBe("-280");
  });

  test("Gộp nhiều file, báo trùng mã đề khác đáp án", async () => {
    const r = await loadKeys([
      { name: "a.csv", bytes: enc("Câu,1110\nI.1,A\nI.2,B\nI.3,C\n") },
      { name: "dap_an_moi_ma_de_1_cot.csv", bytes: fx("dap_an_moi_ma_de_1_cot.csv") },
    ]);
    expect(Object.keys(r.keys).length).toBe(4);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("Mã đề 1110 có 2 đáp án khác nhau");
  });

  test("Danh sách lớp", async () => {
    const st = await loadStudents("danh_sach_lop_mau.xlsx", fx("danh_sach_lop_mau.xlsx"));
    expect(st["30044444"]).toBe("Nguyễn Văn A");
    expect(Object.keys(st).length).toBe(2);
  });
});

describe("Chấm điểm (thang Bộ)", () => {
  const mk = () => {
    const s = newSession("t", "t");
    s.keys = {
      "0001": {
        I: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, "ABCD"[i % 4]])),
        II: { 1: "DDDD", 2: "SSSS" },
        III: { 1: "1.5", 2: "-0.9" },
      },
    };
    return s;
  };

  test("Đúng hết: 3,00 / 2,00 / 1,00 = 6,00", () => {
    const s = mk();
    const ans: Record<string, string> = {};
    for (let q = 1; q <= 12; q++) ans[`I.${q}`] = "ABCD"[(q - 1) % 4];
    for (const lt of "abcd") { ans[`II.1${lt}`] = "D"; ans[`II.2${lt}`] = "S"; }
    ans["III.1"] = "1,5"; ans["III.2"] = "-0,90";
    const g = gradeSheet(s, mkSheet(null, ans));
    expect([g.p1, g.p2, g.p3, g.tong]).toEqual([3, 2, 1, 6]);
  });

  test("Phần II: 1/2/3 ý đúng = 0,1/0,25/0,5 ; ô tô lỗi (*) Phần III không tính", () => {
    const g = gradeSheet(mk(), mkSheet(null, {
      "II.1a": "D", "II.1b": "S", "II.1c": "S", "II.1d": "S",
      "II.2a": "S", "II.2b": "S", "II.2c": "S", "II.2d": "D",
      "III.1": "1*5",
    }));
    expect(g.p2).toBe(0.6);
    expect(g.p3).toBe(0);
  });

  test("Thang 0,25/ý", () => {
    const s = mk();
    s.scale.p2 = "deu";
    expect(gradeSheet(s, mkSheet(null, { "II.1a": "D", "II.1b": "D", "II.1c": "S" })).p2).toBe(0.5);
  });
});

describe("Soát SBD / mã đề", () => {
  test("Trùng SBD + mã đề, mã đề lạ, SBD thiếu", () => {
    const s = newSession("t", "t");
    s.keys = { "0001": newKey() };
    const add = (sbd: string, made: string) => {
      const sh = newSheet(s, `f${sbd}${made}`);
      Object.assign(sh, { ok: true, sbd, made });
      return sh;
    };
    const a = add("1234", "0001"), b = add("1234", "0001"), c = add("12?4", "0002");
    expect(idProblems(s, a).map((p) => p.code)).toContain("trung");
    expect(confirmId(s, b).length).toBeGreaterThan(0);
    dropSheet(s, b);
    expect(confirmId(s, a)).toEqual([]);
    expect(idProblems(s, c).map((p) => p.code)).toEqual(expect.arrayContaining(["sbd", "made_lech"]));
    expect(readyToGrade(s)).toBe(false);
  });

  test("Bỏ qua soát SBD: chỉ chặn vì mã đề, SBD trống / trùng không chặn", () => {
    const s = newSession("t", "t");
    s.keys = { "0001": newKey() };
    s.skip_sbd = true;
    const add = (sbd: string, made: string) => {
      const sh = newSheet(s, `f${s.sheets.length}.jpg`);
      Object.assign(sh, { ok: true, sbd, made });
      return sh;
    };
    const a = add("??????", "0001"), b = add("??????", "0001"), c = add("12*4", "0001"), d = add("??????", "0009");
    for (const sh of [a, b, c]) expect(idProblems(s, sh)).toEqual([]);
    expect(idProblems(s, d).map((p) => p.code)).toEqual(["made_lech"]);
    dropSheet(s, d);
    expect(readyToGrade(s)).toBe(true);
    expect(sbdShown(s, a)).toBe("");
    expect(gradedImageName(a)).toBe("______" + "_0001_f0.jpg");
    s.skip_sbd = false;
    expect(idProblems(s, a).map((p) => p.code)).toContain("sbd");
  });
});

test("Phiếu 3 ô mã đề (Toán 12-4-6): mã 101 khớp đáp án 0101", () => {
  const s = newSession("t", "t");
  const k = newKey(); k.I[1] = "A";
  s.keys = { "0101": k, "0102": newKey() };
  expect(madeKey(s, "101")).toBe("0101");
  expect(madeKey(s, "0101")).toBe("0101");
  expect(madeKey(s, "103")).toBeUndefined();
  expect(madeKey(s, "1?1")).toBeUndefined();
  const sh = newSheet(s, "a.jpg");
  Object.assign(sh, { ok: true, sbd: "123", made: "101", answers: { "I.1": "A" } });
  expect(idProblems(s, sh).map((p) => p.code)).not.toContain("made_lech");
  expect(gradeSheet(s, sh).p1).toBe(0.25);
  expect(maxScore(s, "101")).toBe(0.25);
});

test("Tên ảnh chấm và lưu/mở lại phiên", () => {
  const s = newSession("t", "Thử");
  const k = newKey(); k.I[1] = "A";
  s.keys = { "0001": k };
  const sh = newSheet(s, "a.jpg");
  Object.assign(sh, { ok: true, sbd: "1234", made: "0001", answers: { "I.1": "A" } });
  gradeAll(s);
  expect(gradedImageName(sh)).toBe("1234_0001_a.jpg");
  const s2: Session = JSON.parse(JSON.stringify(s));
  expect(s2.sheets[0].grade!.tong).toBe(0.25);
  expect(s2.keys["0001"].I[1]).toBe("A");
});

describe("QR đáp án + file mẫu của người dùng", async () => {
  const ref = await loadKeyFile("Phieu_Dap_An_Import.xlsx", fx("Phieu_Dap_An_Import.xlsx"));
  test("File “Câu I.1…” (1 hàng) và bảng ngang (1 cột) đọc được, giống nhau", async () => {
    const b = await loadKeyFile("dap-an-bang-ngang.csv", fx("dap-an-bang-ngang.csv"));
    expect(ref.errors).toEqual([]);
    expect(Object.keys(ref.keys)).toEqual(["1110", "1112", "1114", "1116"]);
    for (const m of Object.keys(ref.keys)) for (const p of PARTS) expect(b.keys[m][p]).toEqual(ref.keys[m][p]);
  });

  test("Chuỗi QR “1110:A,B,…|1112:…” ra đúng đáp án như file Excel", () => {
    const q = decodeKeysText(readFileSync("test/fixtures/qr_dap_an.txt", "utf8"));
    expect(Object.keys(q)).toEqual(["1110", "1112", "1114", "1116"]);
    for (const m of Object.keys(q)) for (const p of PARTS) expect(q[m][p]).toEqual(ref.keys[m][p]);
  });

  test("Tạo chữ đáp án ra đúng chuỗi gốc; chuỗi lỗi bị từ chối", () => {
    const back = decodeKeysText(encodeKeysText(ref.keys));
    for (const m of Object.keys(ref.keys)) for (const p of PARTS) expect(back[m][p]).toEqual(ref.keys[m][p]);
    expect(() => decodeKeysText("xin chao")).toThrow();
    expect(() => decodeKeysText("1110:A,B,X")).toThrow();
  });
});

test("Chữ đáp án của web đảo đề = file đáp án mẫu (Câu | 101 | 102 …)", async () => {
  const f = await loadKeyFile("dap-an.csv", fx("dap-an.csv"));
  expect(f.errors).toEqual([]);
  expect(Object.keys(f.keys)).toEqual(["0101", "0102", "0103", "0104"]);
  expect(Object.keys(f.keys["0101"].I).length).toBe(12);
  expect(f.keys["0101"].II[1]).toBe("SDSD");
  const q = decodeKeysText(readFileSync("test/fixtures/qr_web_dao_de.txt", "utf8"));
  expect(Object.keys(q)).toEqual(["0101", "0102", "0103", "0104"]);
  for (const m of Object.keys(q)) for (const p of PARTS) expect(q[m][p]).toEqual(f.keys[m][p]);
  const e = encodeKeysText(f.keys);
  expect(e.startsWith("ĐÁP ÁN - 4 MÃ ĐỀ")).toBe(true);
  expect(e).toContain("Mã 101:\nPhần I: 1D 2C 3D");
  expect(decodeKeysText(e)).toEqual(q);
});

describe("Cấu hình số câu / điểm từng phần", () => {
  const mk = () => {
    const s = newSession("t", "t");
    const k: KeyMap = newKey();
    for (let q = 1; q <= 32; q++) k.I[q] = "A";
    for (let q = 1; q <= 6; q++) k.II[q] = "DDDD";
    for (let q = 1; q <= 12; q++) k.III[q] = "1";
    s.keys = { "0001": k };
    return s;
  };
  const all = () => {
    const a: Record<string, string> = {};
    for (let q = 1; q <= 32; q++) a[`I.${q}`] = "A";
    for (let q = 1; q <= 6; q++) for (const l of "abcd") a[`II.${q}${l}`] = "D";
    for (let q = 1; q <= 12; q++) a[`III.${q}`] = "1";
    return mkSheet(null, a);
  };

  test("Mặc định: chấm mọi câu trong đáp án (toàn phiếu = 20 điểm)", () => {
    const s = mk();
    expect(maxScore(s, "0001")).toBe(20);
    expect(gradeSheet(s, all()).tong).toBe(20);
  });
  test("Điểm cả phần 3 – 4 – 3: toàn phiếu = 10 điểm", () => {
    const s = mk(); s.scale.t = [3, 4, 3];
    expect(maxScore(s, "0001")).toBe(10);
    const g = gradeSheet(s, all());
    expect([g.p1, g.p2, g.p3, g.tong]).toEqual([3, 4, 3, 10]);
  });
  test("Số câu 12 – 4 – 6: chỉ chấm các câu đầu (đề Bộ = 10 điểm)", () => {
    const s = mk(); s.scale.n = [12, 4, 6];
    expect(maxScore(s, "0001")).toBe(10);
    expect(gradeSheet(s, all()).tong).toBe(10);
    expect(inKey(s, all(), "I.13")).toBe(false);
    expect(inKey(s, all(), "I.12")).toBe(true);
  });
  test("Phần II theo Bộ được nhân theo điểm cả phần", () => {
    const s = mk(); s.scale.t = [null, 3, null];
    const sh = all();
    sh.answers["II.1a"] = "S"; sh.answers["II.2a"] = "S"; sh.answers["II.2b"] = "S";
    expect(gradeSheet(s, sh).p2).toBe(2.38);
  });
  test("Báo thiếu đáp án khi số câu lớn hơn đáp án", () => {
    const s = mk(); s.scale.n = [40, null, null];
    const w = configWarnings(s);
    expect(w.length).toBe(1);
    expect(w[0]).toContain("Phần I câu 33");
  });
});

test("File đáp án mẫu duy nhất (xlsx, csv) đọc đúng; số câu tuỳ ý", async () => {
  for (const f of ["Mau_dap_an.xlsx", "Mau_dap_an.csv"]) {
    const r = await loadKeyFile(f, pub(f));
    expect(r.errors, f).toEqual([]);
    expect(Object.keys(r.keys), f).toEqual(["0101", "0102", "0103", "0104"]);
    const k = r.keys["0103"];
    expect([Object.keys(k.I).length, Object.keys(k.II).length, Object.keys(k.III).length], f).toEqual([12, 4, 6]);
    expect(k.III[1], f).toBe("-54");
  }
  const csv = 'Câu,201,202,203\nI.1,A,B,C\nI.2,D,D,D\nI.3,B,,A\nII.1,ĐĐSS,DSDS,SSSS\nIII.1,"0,5",-2,12\nIII.2,3,4,5\n';
  const r = await loadKeyFile("x.csv", enc(csv));
  expect(r.errors).toEqual([]);
  expect(Object.keys(r.keys)).toEqual(["0201", "0202", "0203"]);
  expect(plain(r.keys["0202"].I)).toEqual({ 1: "B", 2: "D" });
  expect(r.keys["0201"].II[1]).toBe("DDSS");
  expect(plain(r.keys["0201"].III)).toEqual({ 1: "0,5", 2: "3" });
});

test("Câu tô nhiều ô bị đánh dấu không chấm (*) -> 0 điểm", () => {
  expect(p3Equal("*", "0,4")).toBe(false);
  expect(dispAnswer("III.1", "*")).toBe("Không chấm");
  expect(validP3("-,,4")).toBe(false);
  expect(validP3("-0,4")).toBe(true);
});

test("Danh sách lớp mẫu (.xlsx, .csv) đọc được đủ 12 học sinh", async () => {
  for (const f of ["Mau_danh_sach_lop.xlsx", "Mau_danh_sach_lop.csv"]) {
    const st = await loadStudents(f, pub(f));
    expect(Object.keys(st).length, f).toBe(12);
    expect(st["12010001"], f).toBe("Nguyễn Văn An");
    expect(st["12010012"], f).toBe("Lý Thị Oanh");
  }
});

test("Đáp án nhập tay: chuẩn hoá Phần III, chấm đúng", () => {
  expect(normKeyP3("0.5")).toBe("0,5");
  expect(normKeyP3("-1,5")).toBe("-1,5");
  expect(normKeyP3("12")).toBe("12");
  expect(normKeyP3(" -2 ")).toBe("-2");
  expect(normKeyP3("1,2,3")).toBeNull();
  expect(normKeyP3("2-")).toBeNull();
  expect(normKeyP3("12345")).toBeNull();
  expect(normKeyP3("")).toBeNull();
  const k = newKey();
  k.I[1] = "B"; k.II[1] = "DSDS"; k.III[1] = normKeyP3("0.5")!;
  const ses = newSession("x", "x");
  ses.keys = { "0101": k };
  const back: Session = JSON.parse(JSON.stringify(ses));
  expect(back.keys["0101"].III[1]).toBe("0,5");
  const g = gradeSheet(back, mkSheet(null,
    { "I.1": "B", "II.1a": "D", "II.1b": "S", "II.1c": "D", "II.1d": "S", "III.1": "0,5" }, "0101"));
  expect([g.p1, g.p2, g.p3]).toEqual([0.25, 1, 0.5]);
});

describe("Nối đảo đề -> chấm bài", async () => {
  const { keysFromDaoDe } = await import("@/lib/omr/daoDe");
  test("Nhãn I.n / II.n / III.n của web đảo đề", () => {
    const r = keysFromDaoDe({
      name: "de", codes: ["101", "102"],
      keys: [
        [{ lab: "I.1", val: "D" }, { lab: "I.2", val: "c" }, { lab: "II.1", val: "ĐSĐS" }, { lab: "III.1", val: "0,5" }, { lab: "III.2", val: "-54" }],
        [{ lab: "I.1", val: "A" }, { lab: "I.2", val: "B" }, { lab: "II.1", val: "S Đ Đ S" }, { lab: "III.1", val: "12" }, { lab: "III.2", val: "?" }],
      ],
    });
    expect(Object.keys(r.keys)).toEqual(["0101", "0102"]);
    expect(plain(r.keys["0101"].I)).toEqual({ 1: "D", 2: "C" });
    expect(r.keys["0101"].II[1]).toBe("DSDS");
    expect(r.keys["0102"].II[1]).toBe("SDDS");
    expect(plain(r.keys["0101"].III)).toEqual({ 1: "0.5", 2: "-54" });
    expect(r.keys["0102"].III[1]).toBe("12");
    expect(r.errors).toEqual(['Mã đề 0102 câu III.2: đáp án "?" không hợp lệ']); // đảo đề ghi "?" khi đề thiếu đáp án
  });
  test("Đề không chia PHẦN: tự nhận phần theo giá trị", () => {
    const r = keysFromDaoDe({ name: "de", codes: ["1001"], keys: [[{ lab: "1", val: "A" }, { lab: "2", val: "B" }, { lab: "3", val: "ĐĐSS" }, { lab: "4", val: "2,5" }]] });
    expect(plain(r.keys["1001"].I)).toEqual({ 1: "A", 2: "B" });
    expect(r.keys["1001"].II[1]).toBe("DDSS");
    expect(r.keys["1001"].III[1]).toBe("2.5");
  });
  test("Chấm được với đáp án lấy từ đảo đề", () => {
    const { keys } = keysFromDaoDe({ name: "de", codes: ["101"], keys: [[{ lab: "I.1", val: "D" }, { lab: "III.1", val: "0,5" }]] });
    const s = newSession("t", "t"); s.keys = keys;
    const g = gradeSheet(s, mkSheet(null, { "I.1": "D", "III.1": "0,5" }, "0101"));
    expect(g.tong).toBe(0.75);
  });
});
