"use client";
// Nối phần ĐẢO ĐỀ (public/dao-de.html) với phần CHẤM BÀI.
// Trang đảo đề sau khi tạo mã đề sẽ lưu đáp án vào localStorage (khoá DAO_DE_KEY) rồi mở /dashboard/cham-bai;
// trang danh sách bài chấm đọc khoá đó, tạo bài chấm mới có sẵn đáp án và mở luôn.
import { decodeKeysText, type KeyMap, keyCount, newKey, normMade, normValue, type Part } from "./keys";
import { newSession } from "./session";
import { putSession } from "./store";

export const DAO_DE_KEY = "cham-bai:tu-dao-de";

/** Dữ liệu trang đảo đề gửi sang: tên file đề, các mã đề, đáp án từng mã (nhãn "I.1", "II.3", "III.2"…). */
export interface DaoDePayload {
  name: string;
  codes: string[];
  keys: { lab: string; val: string }[][];
  at?: number;
  /** giáo viên tích "Bỏ qua soát số báo danh khi chấm" ở trang đảo đề */
  skipSBD?: boolean;
}

const SEC: Record<string, Part> = { I: "I", II: "II", III: "III", "1": "I", "2": "II", "3": "III" };

/** Đáp án của đảo đề -> {mã đề: đáp án}. Đề không chia PHẦN thì tự nhận phần theo nội dung (như QR). */
export function keysFromDaoDe(p: DaoDePayload): { keys: Record<string, KeyMap>; errors: string[] } {
  const keys: Record<string, KeyMap> = {};
  const errors: string[] = [];
  p.codes.forEach((code, j) => {
    const made = normMade(String(code));
    const list = p.keys[j] ?? [];
    const k = newKey();
    const loose: string[] = [];
    for (const { lab, val } of list) {
      const m = /^\s*([IVX]+|\d)\s*\.\s*(\d+)\s*$/i.exec(String(lab));
      const part = m ? SEC[m[1].toUpperCase()] : undefined;
      if (!m || !part) { loose.push(String(val)); continue; }
      const v = normValue(part, String(val));
      if (v == null || (part === "III" && !/^-?\d+([.,]\d+)?$/.test(v))) { errors.push(`Mã đề ${made} câu ${part}.${m[2]}: đáp án "${val}" không hợp lệ`); continue; }
      k[part][parseInt(m[2])] = part === "III" ? v.replaceAll(",", ".") : v;
    }
    if (loose.length) {
      // đề không có "PHẦN I/II/III": chia phần theo giá trị (A-D / ĐSĐS / số) như chuỗi QR
      try {
        const q = decodeKeysText(`${made}:${loose.map((v) => v.replaceAll(",", ".").trim()).join(",")}`)[made];
        for (const part of ["I", "II", "III"] as Part[]) Object.assign(k[part], q[part]);
      } catch (e) { errors.push(`Mã đề ${made}: ${(e as Error).message}`); }
    }
    if (keyCount(k)) keys[made] = k;
  });
  return { keys, errors };
}

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

/** Tạo bài chấm mới (có thể kèm đáp án). Trả về id để mở trang chấm. */
export async function createSession(
  name: string, dapAn?: string | Record<string, KeyMap>, source = "Đảo đề", errors: string[] = [], skipSbd = false,
): Promise<string> {
  const s = newSession(uid(), name);
  if (skipSbd) s.skip_sbd = true;
  if (dapAn) {
    s.keys = typeof dapAn === "string" ? decodeKeysText(dapAn) : dapAn;
    for (const m of Object.keys(s.keys)) s.key_source[m] = source;
  }
  s.key_errors = errors;
  await putSession(s);
  return s.id;
}

/** Đọc (và xoá) đáp án trang đảo đề vừa gửi sang; quá 1 giờ thì bỏ qua. */
export function takeDaoDePayload(): DaoDePayload | null {
  try {
    const raw = localStorage.getItem(DAO_DE_KEY);
    if (!raw) return null;
    localStorage.removeItem(DAO_DE_KEY);
    const p = JSON.parse(raw) as DaoDePayload;
    if (!Array.isArray(p.codes) || !Array.isArray(p.keys)) return null;
    if (p.at && Date.now() - p.at > 3600_000) return null;
    return p;
  } catch {
    return null;
  }
}
