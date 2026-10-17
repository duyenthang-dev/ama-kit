---
name: qe
description: Đọc hiểu Jira, Confluence, Figma và bản phân tích của một issue, tự lên kế hoạch QE phù hợp (test case, strategy, plan, smoke, tóm tắt - cái nào cần mới làm), sinh truy vết và comment tóm tắt lên Jira sau khi xác nhận. Dùng sau analyze-requirement, hoặc khi người dùng xin test plan, test case hay tóm tắt QE cho một issue.
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

1. **Đọc hiểu trước, chưa viết gì.** Run mới nhất của issue phải có `report/ac.json` và `report/analysis.md`; chưa có thì
   chạy workflow `analyze-requirement` trước. Đọc **cả nguồn gốc**, không chỉ bản phân tích: `jira/issue.md`, mọi file
   `confluence/`, nhìn PNG trong `figma/` (`manifest.json` cho biết frame nào). Cần thêm ngữ cảnh (issue cha, task liên quan,
   page khác) thì dùng skill `context-brief`. Thiếu nguồn cho phần nào thì ghi "chưa đủ ngữ cảnh", không bịa.

2. **Tự lên kế hoạch QE → `report/qe-plan.json`.** Không có artifact nào bắt buộc. Chọn theo issue, ví dụ:
   - Loại và cỡ việc: bug nhỏ có thể chỉ cần vài test case hồi quy + summary; story lớn, nhiều rủi ro mới cần strategy và plan.
   - Mức sẵn sàng: "Chưa sẵn sàng" thì ưu tiên câu hỏi và gap trong summary; test case chỉ là nháp theo giả định (hoặc bỏ).
   - Nền tảng: tính năng web/backend thì bỏ smoke mobile; chỉ chọn `mobile.md` khi có app (`mobile.appPath`) và luồng trên app.
   - Người dùng nói rõ muốn gì thì làm đúng phần đó.
   Mỗi artifact chọn hoặc bỏ đều có `why` một dòng. Báo kế hoạch cho người dùng bằng 2–4 dòng rồi làm tiếp
   (người dùng phản đối thì sửa kế hoạch). Schema và danh mục: knowledge/qe-workflow.md.

3. **Làm các artifact đã chọn**, theo phương pháp trong knowledge:
   - `test-strategy.md`: tầng test cho từng tiêu chí (quy tắc nghiệp vụ ở unit, hợp đồng ở integration, luồng app ở e2e hoặc
     smoke), rủi ro và ưu tiên, dữ liệu giả, môi trường. Luồng dễ mất dữ liệu: thêm biên, lỗi và một case từ chối quyền.
     Không đặt ngưỡng phần trăm coverage.
   - `test-plan.md`: mục tiêu, trong và ngoài phạm vi, môi trường, dữ liệu, thứ tự chạy, điều kiện dừng, rủi ro, test case.
     Xung đột nguồn: lời người dùng và AC, rồi page, rồi diff.
   - `test-cases.json`: tiêu chí mơ hồ thì viết theo giả định và ghi giả định vào `preconditions` kèm ID câu hỏi.
     `figmaNodes` cho mọi kỳ vọng UI. `automation.ref` chỉ cho test có thật trong repo. Tiêu chí nào cố ý không có case thì
     nói lý do trong summary hoặc strategy.
   - `mobile.md`: chạy `node "${CLAUDE_PLUGIN_ROOT}/bin/mobile-test.js" run --suite smoke --issue <KEY>` **không** `--yes` để
     thấy kế hoạch, nói rõ tốn phút device cloud, hỏi; đồng ý mới chạy lại với `--yes`.
   - `summary.md` (sẽ thành comment, dưới khoảng 3.000 ký tự): kết luận sẵn sàng, độ phủ nếu có test case, smoke nếu có,
     câu hỏi mở và gap chặn (ID + một dòng). Không đường dẫn file local, không token, không email.

4. **Kiểm tra.** `node "${CLAUDE_PLUGIN_ROOT}/bin/qe-workflow.js" <KEY>`: kiểm schema ac.json, test-cases.json (nếu có),
   qe-plan.json, sinh truy vết, và đối chiếu artifact với kế hoạch. Sửa mọi dòng ✘.

5. **Comment** (chỉ khi kế hoạch có summary.md). `node "${CLAUDE_PLUGIN_ROOT}/bin/jira.js" comment <KEY> --file <run>/report/summary.md` (xem trước), cho người dùng
   xem, hỏi. Chỉ khi họ đồng ý mới chạy lại với `--yes`, rồi đưa link comment. Không đổi trạng thái issue.

6. **Báo lại**: kế hoạch đã chọn (và cái đã bỏ), độ phủ và số P1 nếu có test case, smoke nếu có, link comment nếu đã gửi.
