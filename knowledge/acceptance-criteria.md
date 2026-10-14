---
title: Tiêu chí chấp nhận
topic: requirement
reviewed: 2026-10-15
sources:
  - https://cucumber.io/docs/gherkin/reference/
  - https://en.wikipedia.org/wiki/INVEST_(mnemonic)
  - https://www.nngroup.com/articles/response-times-3-important-limits/
---

# Tiêu chí chấp nhận

## Dạng câu

**Given** một điều kiện, **When** một thao tác, **Then** một kết quả. Mỗi tiêu chí một hành vi.
Cần thêm điều kiện thì dùng **And** trong cùng phần, nhưng không gộp hai hành vi vào một tiêu chí.

> Given tài khoản đã sai mật khẩu 4 lần, When nhập sai lần thứ 5, Then tài khoản bị khóa 15 phút và hiện "Tài khoản tạm khóa".

## Phủ đủ bốn loại

- **Đường chính**: người dùng làm đúng và đạt kết quả.
- **Biên**: ngay tại và ngay ngoài giới hạn.
- **Lỗi**: dữ liệu sai, hệ thống lỗi, không có quyền.
- **Phi chức năng**: thời gian, truy cập, bảo mật, khi chúng là một phần của yêu cầu.

## Bốn điều kiện của một tiêu chí tốt

1. **Nhìn thấy được**: kết quả quan sát được trên màn hình, API hoặc dữ liệu.
2. **Có mốc đúng sai**: hai người test cùng ra một kết luận.
3. **Một nghĩa**: không có "nhanh", "dễ dùng", "phù hợp", "v.v.".
4. **Làm được**: có thể dựng điều kiện và đo trong môi trường test.

**Ngưỡng thời gian phản hồi** phải hợp lệ: có số, đơn vị, phân vị và điều kiện đo
(vd. "p95 dưới 2 giây trên 4G với 1.000 bản ghi"). Khoảng 0,1 giây là cảm giác tức thì, khoảng 1 giây giữ
được mạch thao tác, quá 10 giây cần báo tiến độ.

**Mốc lịch không phải tiêu chí.** "Xong trước 30/10" là kế hoạch, không phải hành vi cần test.

## Giữ câu gốc

- `original`: câu gốc **nguyên văn** trên issue (hoặc page, frame). Không sửa chính tả, không dịch.
- `interpretation`: câu viết lại theo Given/When/Then, ghi rõ là **diễn giải**. Không có diễn giải thì bỏ trống.
- `source` + `sourceRef`: lấy từ đâu (field nào, mục nào trong mô tả, page nào, frame nào).
- Tiêu chí suy ra (không có trong nguồn nào) có `source: inferred` và `sourceRef` nói suy từ đâu.

## Gắn một tầng test

Mỗi tiêu chí gắn **một** tầng test chính (`testLevel`): `unit`, `integration`, `e2e`, `smoke` hoặc `manual`.
Chọn tầng thấp nhất bắt được lỗi. Xem [test-strategy.md](test-strategy.md).

## Dấu hiệu tiêu chí yếu (ghi vào `issues`)

- Từ mơ hồ: nhanh, dễ, trực quan, phù hợp, hỗ trợ, một số.
- Thiếu ai, thiếu điều kiện đầu, thiếu kết quả.
- Mô tả cách làm thay vì hành vi ("gọi endpoint /auth").
- Chỉ có đường chính.
- Nói "theo thiết kế" mà không chỉ frame nào.
