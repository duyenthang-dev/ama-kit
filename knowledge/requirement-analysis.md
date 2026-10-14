---
title: Phân tích requirement
topic: requirement
reviewed: 2026-10-15
sources:
  - https://www.istqb.org/certifications/certified-tester-foundation-level
  - https://en.wikipedia.org/wiki/MoSCoW_method
  - https://en.wikipedia.org/wiki/Five_whys
  - https://www.iso.org/standard/72089.html
---

# Phân tích requirement

Mục tiêu: trước khi viết test, hiểu đúng vấn đề, biết thiếu gì, và có câu hỏi cụ thể cho người có thể trả lời.

## 1. Hỏi từng câu một

Hỏi một câu, đợi trả lời, rồi mới hỏi câu tiếp. Một tin nhắn nhiều câu hỏi thường chỉ được trả lời câu đầu.
Bốn câu mở đầu, theo thứ tự:

1. **Việc gì đang vướng?** Người dùng đang bị chặn ở đâu, hôm nay họ làm thế nào.
2. **Kết quả nào người dùng chưa làm được?** Mô tả bằng kết quả, không bằng màn hình hay nút.
3. **Giới hạn nào không được phá?** Pháp lý, bảo mật, hiệu năng, tương thích ngược, hạn chót kỹ thuật.
4. **Nếu không làm thì chuyện gì tiếp tục hỏng?** Giúp xếp ưu tiên và phát hiện yêu cầu "có cũng được".

Khi issue mô tả **một giải pháp** ("thêm nút X", "đổi API Y"), hỏi "vì sao" cho tới khi chạm nhu cầu thật.
Thường giải pháp đổi khi nhu cầu đã rõ.

## 2. Xếp ưu tiên: Must, Should, Could, Won't

- **Must**: thiếu thì không phát hành được.
- **Should**: quan trọng, có cách tạm.
- **Could**: có thì tốt, bỏ được khi trễ.
- **Won't (lần này)**: ghi rõ để không ai mong đợi.

Ghi `moscow` cho từng tiêu chí trong `ac.json`.

## 3. Đọc đủ ba nguồn

| Nguồn | Thường đáng tin về | Thường thiếu |
|---|---|---|
| Issue Jira và tiêu chí | Phạm vi, quy tắc nghiệp vụ, ưu tiên | Trạng thái lỗi, chi tiết UI, phi chức năng |
| Page Confluence | Quy tắc, dữ liệu, luồng, tích hợp | Cập nhật (so version/ngày với issue) |
| Frame Figma | Bố cục, câu chữ, trạng thái được vẽ | Hành vi, kiểm tra dữ liệu, chuyển giữa các màn |

**Khi hai nguồn mâu thuẫn: ghi cả hai, không tự chọn, và hỏi.** Ghi thành một `GAP` và một câu hỏi `Q`,
nêu rõ nguồn nào nói gì. Nguồn mới hơn không mặc nhiên đúng.

## 4. Kiểm tra

- **Hành trình**: điểm vào → thao tác → kết quả, cả quay lại, hủy, deep link, app bị tắt rồi mở lại, hết phiên.
- **Biên**: độ dài, giá trị nhỏ nhất/lớn nhất, rỗng, trùng, ký tự đặc biệt, nhiều dữ liệu.
- **Lỗi**: mất mạng, server lỗi, timeout, bấm hai lần, dữ liệu không hợp lệ; có câu chữ lỗi chưa.
- **Trạng thái**: rỗng, đang tải, một phần dữ liệu, lần đầu và lần sau.
- **Phi chức năng**: thời gian phản hồi có số, khả năng truy cập, bảo mật và quyền, đa ngôn ngữ, log và theo dõi.
- **Từ ngữ thống nhất**: cùng một thứ phải cùng một tên ở Jira, Confluence và Figma. Lệch tên là dấu hiệu hiểu lệch.
- **Tiêu chí đo được**: xem [acceptance-criteria.md](acceptance-criteria.md).

## 5. Mức độ gap

- **high**: chặn việc build hoặc test một tiêu chí chính, hoặc hai nguồn nói ngược nhau về hành vi.
- **medium**: thiếu một trạng thái hay quy tắc nhưng có mặc định hợp lý.
- **low**: câu chữ, thẩm mỹ, làm rõ cho đẹp.

## 6. Kết luận mức sẵn sàng

- **Sẵn sàng**: mọi tiêu chí đo được, không có gap high.
- **Sẵn sàng kèm câu hỏi**: có tiêu chí mơ hồ hoặc gap medium, có thể bắt đầu với giả định đã ghi.
- **Chưa sẵn sàng**: một tiêu chí chính không đo được, hoặc có mâu thuẫn mức high.
