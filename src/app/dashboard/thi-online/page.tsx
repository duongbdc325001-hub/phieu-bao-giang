'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import QRCode from 'qrcode'
import { Copy, Check, ExternalLink, QrCode, RotateCcw, Download } from 'lucide-react'
import { DE_THI, type DeThi } from '@/lib/thi-online'

function DeCard({ de, origin }: { de: DeThi; origin: string }) {
  const link = `${origin}/thi/${de.file}`
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState('')
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    if (!origin) return
    QRCode.toDataURL(link, { width: 480, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [link, origin])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Sao chép link này:', link)
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer'

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-xs space-y-3">
      <div>
        <h2 className="text-base font-black text-slate-900 leading-tight">{de.title}</h2>
        <p className="text-xs text-slate-500 mt-1">
          Mã đề: <span className="font-mono font-semibold text-slate-700">{de.examId}</span> · {de.minutes} phút
        </p>
      </div>

      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <span className="text-xs text-slate-700 truncate flex-1 font-mono">{link}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={copy} className={`${btn} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700`}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Đã sao chép' : 'Sao chép link cho học sinh'}
        </button>
        <button
          onClick={() => setShowQr((v) => !v)}
          className={`${btn} bg-white text-slate-700 border-slate-300 hover:bg-slate-50`}
        >
          <QrCode className="w-3.5 h-3.5" /> {showQr ? 'Ẩn mã QR' : 'Mã QR'}
        </button>
        <a href={link} target="_blank" rel="noreferrer" className={`${btn} bg-white text-slate-700 border-slate-300 hover:bg-slate-50`}>
          <ExternalLink className="w-3.5 h-3.5" /> Mở đề
        </a>
        <a
          href={`${link}#reset`}
          target="_blank"
          rel="noreferrer"
          className={`${btn} bg-white text-amber-700 border-amber-300 hover:bg-amber-50`}
          title="Xoá bài làm đã lưu trên máy này để giáo viên làm thử lại"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Làm thử lại (GV)
        </a>
      </div>

      {showQr && qr && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`Mã QR ${de.title}`} className="w-56 h-56 border border-slate-200 rounded-lg" />
          <a href={qr} download={`QR_${de.examId}.png`} className={`${btn} bg-white text-slate-700 border-slate-300 hover:bg-slate-50`}>
            <Download className="w-3.5 h-3.5" /> Tải ảnh QR
          </a>
        </div>
      )}
    </div>
  )
}

export default function ThiOnlinePage() {
  // Lấy địa chỉ web đang chạy (vd https://phieu-bao-giang.vercel.app) để ghép link đề
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans pb-8">
      <div className="border-b pb-3">
        <h1 className="text-2xl font-black text-slate-900 leading-tight">Thi online</h1>
        <p className="text-xs text-slate-500">
          Gửi link hoặc mã QR cho học sinh. Học sinh mở là làm được, không cần đăng nhập. Kết quả tự gửi về Google Sheet.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {DE_THI.map((de) => (
          <DeCard key={de.file} de={de} origin={origin} />
        ))}
      </div>

      <p className="text-[11px] text-slate-500">
        Nút &quot;Làm thử lại (GV)&quot; chỉ dành cho giáo viên: nó xoá bài đã làm trên máy đang dùng. Không gửi link có
        #reset cho học sinh.
      </p>
    </div>
  )
}
