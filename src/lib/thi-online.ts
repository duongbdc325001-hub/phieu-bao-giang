// Danh sách đề thi online đặt trong thư mục public/thi/.
// Thêm đề mới: chép file HTML vào public/thi/ rồi thêm một dòng vào DE_THI.
// Không ghi mã mở đáp án ở đây: file này nằm trong mã nguồn công khai của trang web.
export type DeThi = {
  file: string // tên file trong public/thi/
  title: string // tên đề hiển thị
  examId: string // EXAM_ID trong CFG của đề (cột "Mã đề" trên Google Sheet)
  minutes: number // thời gian làm bài
}

export const DE_THI: DeThi[] = [
  {
    file: 'VatLi_ThamKhao2027_thi_online.html',
    title: 'Đề tham khảo TN THPT 2027 · Môn Vật lí',
    examId: 'vatli-thamkhao-tnthpt2027',
    minutes: 50,
  },
]
