---
name: context-brief
description: Khi đang làm task A và cần hiểu dự án cùng các task liên quan, đọc đúng một vòng quanh A (issue cha, con, A chặn, chặn A, page Confluence gắn kèm) rồi viết bản tóm tắt ngữ cảnh. Chỉ đọc; không chấm tiêu chí, không viết test.
argument-hint: <PROJ-123>
---

# Tổng hợp ngữ cảnh

Issue A: `$ARGUMENTS` (trống thì hỏi mã issue).

Gọi CLI, không tự gọi REST. Skill này **chỉ đọc**: không comment, không sửa gì.
Tuân theo `${CLAUDE_PLUGIN_ROOT}/rules/agent-data-boundary.md`.

## Các bước

1. `node "${CLAUDE_PLUGIN_ROOT}/bin/context-brief.js" <KEY>`. Lệnh lấy đúng một vòng:
   issue cha, issue con, issue A chặn, issue chặn A, và page Confluence gắn trên các issue đó. Không kéo cả backlog,
   không đi tiếp liên kết của B, C, D. In thư mục và vai trò từng issue; `manifest.json` có `relations`.
2. Đọc `jira/<KEY>.md` của A trước, rồi từng issue liên quan, rồi `confluence/*.md`.
3. Viết `report/context-brief.md` trong thư mục đó, bằng ngôn ngữ người dùng đang dùng:

   - **A đang làm phần nào**: 2–4 câu, theo lời của issue.
   - **B/C/D giữ phần nào**: bảng `Issue | Quan hệ với A | Phần việc | Trạng thái`. Ranh giới giữa A và từng issue.
   - **Chỗ hai nguồn nói khác nhau**: issue với issue, issue với page. Ghi cả hai câu, nguồn của từng câu; không tự chọn.
   - **Phần có thể bỏ qua**: những gì trong các issue và page **không đụng tới A**, để người dùng khỏi đọc.
   - **Phụ thuộc và rủi ro**: A bị chặn bởi gì, A chặn ai, việc gì phải xong trước.
   - **Nguồn đã đọc**: danh sách issue và page (tiêu đề, version), cảnh báo khi lấy.

4. **Không** chấm tiêu chí chấp nhận và **không** viết test. Nếu người dùng muốn, gợi ý `/ama-kit:analyze-requirement <KEY>` làm bước sau.

5. Báo lại ngắn: A làm gì, ai giữ phần nào, 1–3 mâu thuẫn quan trọng nhất, đường dẫn tới `context-brief.md`.

Mã thoát 3: chuyển sang skill `setup`.
