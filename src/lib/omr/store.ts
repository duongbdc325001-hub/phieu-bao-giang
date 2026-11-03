"use client";
// Lưu phiên chấm ngay trên máy (IndexedDB): chấm được cả khi mất mạng, mở lại vẫn còn.
// Ảnh phiếu đã nắn lưu riêng (Blob) để không làm phình dữ liệu phiên.
import type { Session } from "./session";

const DB = "cham-bai";
const VER = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

let dbP: Promise<IDBDatabase> | null = null;
const db = () => (dbP ??= open());

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? (req.result as T) : (undefined as T));
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export interface SessionSummary { id: string; name: string; updated: string; sheets: number; graded: boolean }

export async function listSessions(): Promise<SessionSummary[]> {
  const all = await tx<Session[]>("sessions", "readonly", (s) => s.getAll());
  return all
    .map((x) => ({ id: x.id, name: x.name, updated: x.updated, sheets: x.sheets.filter((s) => !s.dropped).length, graded: x.graded }))
    .sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

export const getSession = (id: string) => tx<Session | undefined>("sessions", "readonly", (s) => s.get(id));
export const putSession = (s: Session) => tx("sessions", "readwrite", (st) => st.put(JSON.parse(JSON.stringify(s))));

export async function deleteSession(id: string) {
  await tx("sessions", "readwrite", (s) => s.delete(id));
  await tx("images", "readwrite", (s) => s.delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`)));
}

const imgKey = (sid: string, sheetId: number) => `${sid}/${sheetId}`;
export const putImage = (sid: string, sheetId: number, jpg: Uint8Array) =>
  tx("images", "readwrite", (s) => s.put(new Blob([jpg as BlobPart], { type: "image/jpeg" }), imgKey(sid, sheetId)));
export const getImage = (sid: string, sheetId: number) => tx<Blob | undefined>("images", "readonly", (s) => s.get(imgKey(sid, sheetId)));

/** Xin trình duyệt giữ dữ liệu lâu dài (Safari hay tự xoá sau 7 ngày nếu không có). */
export async function persist() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* bỏ qua */ }
  // service worker riêng cho phần chấm bài (mở trang + chấm khi mất mạng); bỏ qua khi chạy dev
  try {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      await navigator.serviceWorker.register("/omr/sw.js", { scope: "/dashboard/cham-bai" });
  } catch { /* trình duyệt không hỗ trợ */ }
}
