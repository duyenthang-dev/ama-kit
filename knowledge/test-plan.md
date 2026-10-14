---
title: Test plan
topic: qe
reviewed: 2026-10-15
sources:
  - https://www.istqb.org/certifications/certified-tester-foundation-level
  - https://en.wikipedia.org/wiki/Test_plan
  - https://en.wikipedia.org/wiki/Traceability_matrix
---

# Test plan

## Ba chế độ tách biệt

| Chế độ | Khi nào | Làm gì |
|---|---|---|
| **Chỉ lấy dữ liệu** | Câu chỉ có mã issue hoặc URL, không nói làm gì | Lấy và tóm tắt nguồn, không viết plan |
| **Tạo mới** | Người dùng xin plan và chưa có plan | Viết plan theo bố cục dưới |
| **Review** | Người dùng đưa plan có sẵn | **Chấm trước** (theo bố cục và nguồn), **sửa sau** khi người dùng đồng ý |

Không trộn chế độ. Review không tự sửa; tạo mới không ghi đè plan cũ.

## Thiếu nguồn

Nếu không có tiêu chí chấp nhận, không có page hay frame cần thiết, ghi rõ **"chưa đủ ngữ cảnh"** ở mục bị ảnh hưởng
và nói thiếu gì. Không bịa để lấp chỗ trống.

## Thứ tự nguồn khi xung đột

1. Lời người dùng trong cuộc trò chuyện và tiêu chí chấp nhận trên issue
2. Page Confluence
3. Diff (thay đổi code, nếu có)

Ghi xung đột vào mục rủi ro kèm câu hỏi; nguồn thấp hơn không tự đè nguồn cao hơn.

## Bố cục

1. **Mục tiêu**: mỗi mục tiêu ứng với một tiêu chí (`AC-n`) hoặc một rủi ro cần chứng minh.
2. **Trong và ngoài phạm vi.**
3. **Môi trường**: build, môi trường, device và OS.
4. **Dữ liệu**: dữ liệu giả cần có, cách tạo và dọn.
5. **Thứ tự chạy**: smoke trước, rồi theo rủi ro.
6. **Điều kiện dừng**: khi nào dừng và báo (smoke fail, chặn bởi câu hỏi mở, môi trường hỏng); khi nào coi là xong.
7. **Rủi ro**: kèm cách giảm, ID câu hỏi liên quan.
8. **Test case**: bảng tóm tắt, chi tiết ở `test-cases.md`.

## Hai ma trận tách nhau

- **Mục tiêu → nguồn** (`traceability-objectives.md`): mỗi mục tiêu đến từ field, page hay frame nào.
- **Test case → mục tiêu** (`traceability-tests.md`): mỗi test case phủ mục tiêu nào; mục tiêu nào chưa được phủ.

Tách ra để một ma trận trả lời "vì sao test cái này", ma trận kia trả lời "đã test đủ chưa". `qe-workflow <KEY>` sinh cả hai từ `ac.json` và `test-cases.json`.
