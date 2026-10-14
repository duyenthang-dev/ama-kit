---
name: qe
description: Từ run đã phân tích của một issue - viết chiến lược test, test plan, test case truy vết tới tiêu chí và frame Figma, sinh hai ma trận truy vết, chạy smoke Appium (nếu người dùng đồng ý) và comment tóm tắt lên Jira sau khi xác nhận. Dùng sau analyze-requirement, hoặc khi người dùng xin test plan, test case hay tóm tắt QE cho một issue.
argument-hint: <PROJ-123>
---

# QE workflow

Issue: `$ARGUMENTS` (trống thì hỏi mã issue).

Gọi CLI, không tự gọi REST. Tuân theo `${CLAUDE_PLUGIN_ROOT}/rules/confirm-before-write.md` và
`${CLAUDE_PLUGIN_ROOT}/rules/agent-data-boundary.md`. Phương pháp: `${CLAUDE_PLUGIN_ROOT}/knowledge/test-strategy.md`,
`${CLAUDE_PLUGIN_ROOT}/knowledge/test-plan.md`; schema: `${CLAUDE_PLUGIN_ROOT}/knowledge/qe-workflow.md`.

## Chọn chế độ (knowledge/test-plan.md)

- Người dùng chỉ đưa mã issue hoặc URL, không nói làm gì: **chỉ lấy dữ liệu** và tóm tắt trạng thái run
  (`node "${CLAUDE_PLUGIN_ROOT}/bin/workflow.js" status <KEY>`), rồi hỏi họ muốn tạo mới hay review.
- **Tạo mới**: làm các bước dưới.
- **Review** plan có sẵn: chấm trước theo bố cục và nguồn, liệt kê chỗ cần sửa; chỉ sửa khi người dùng đồng ý.

## Các bước (tạo mới)

1. **Nạp phân tích.** Run mới nhất của issue phải có `report/ac.json` và `report/analysis.md`.
   Chưa có thì chạy workflow `analyze-requirement` trước. Đọc `analysis.md`, `ac.json`, `manifest.json`; xem lại PNG khi viết case UI.
   Thiếu nguồn cho một phần thì ghi "chưa đủ ngữ cảnh" ở phần đó, không bịa.

2. **`report/test-strategy.md`**: tầng test cho từng tiêu chí (quy tắc nghiệp vụ ở unit, hợp đồng ở integration, luồng app ở
   e2e hoặc smoke), rủi ro và ưu tiên, dữ liệu giả (fixture/factory/mock), device. Luồng dễ mất dữ liệu: thêm biên, lỗi và
   một case từ chối quyền. Không đặt ngưỡng phần trăm coverage.

3. **`report/test-plan.md`** theo bố cục: mục tiêu, trong và ngoài phạm vi, môi trường, dữ liệu, thứ tự chạy, điều kiện dừng,
   rủi ro, test case. Xung đột nguồn: lời người dùng và AC, rồi page, rồi diff.

4. **`report/test-cases.json`**: mỗi tiêu chí ít nhất một case; tiêu chí mơ hồ thì viết theo giả định đã nêu và ghi giả định
   vào `preconditions` kèm ID câu hỏi. `figmaNodes` cho mọi kỳ vọng UI. `automation.ref` chỉ cho test có thật trong repo.

5. **Truy vết.** `node "${CLAUDE_PLUGIN_ROOT}/bin/qe-workflow.js" <KEY>` kiểm schema và sinh `test-cases.md`,
   `traceability-objectives.md` (mục tiêu → nguồn), `traceability-tests.md` (test case → mục tiêu). Sửa tới khi hợp lệ;
   mọi tiêu chí chưa phủ phải được phủ hoặc giải thích trong strategy.

6. **Smoke (tùy chọn).** Nếu config có `mobile.appPath`: chạy
   `node "${CLAUDE_PLUGIN_ROOT}/bin/mobile-test.js" run --suite smoke --issue <KEY>` **không** `--yes` để thấy kế hoạch, nói rõ
   tốn phút device cloud, hỏi. Đồng ý thì chạy lại với `--yes`; kết quả ở `report/mobile.md`. Không chạy thì tự viết
   `report/mobile.md` với một dòng lý do cụ thể.

7. **`report/summary.md`** (sẽ thành comment, dưới khoảng 3.000 ký tự): kết luận sẵn sàng, độ phủ
   ("N/M tiêu chí có test case, K tự động"), kết quả smoke hoặc lý do chưa chạy, câu hỏi mở và gap chặn (ID + một dòng).
   Không đường dẫn file local, không token, không email.

8. **Comment.** `node "${CLAUDE_PLUGIN_ROOT}/bin/jira.js" comment <KEY> --file <run>/report/summary.md` (xem trước), cho người dùng
   xem, hỏi. Chỉ khi họ đồng ý mới chạy lại với `--yes`, rồi đưa link comment. Không đổi trạng thái issue.

9. **Báo lại**: độ phủ, số P1, kết quả smoke, link comment (nếu đã gửi), danh sách file trong `report/`.
