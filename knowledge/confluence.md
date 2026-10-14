---
title: Confluence Cloud REST API v2
topic: tool
reviewed: 2026-10-15
sources:
  - https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
  - https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
---

# Confluence Cloud REST API v2

## Gọi API chính thức

- Cùng credential với Jira (Basic auth, email + API token).
- **Đọc page**: `GET /wiki/api/v2/pages/{id}?body-format=atlas_doc_format` (thân dạng ADF, kit dùng chung bộ chuyển với Jira).
  Page không có ADF thì lấy `body-format=storage` (XHTML).
- Page ID nằm trong URL `/wiki/spaces/<space>/pages/<id>/...` hoặc `viewpage.action?pageId=<id>`.
  Link rút gọn `/wiki/x/...` được giải bằng redirect.
- **Macro** (bảng động, Jira query, include...) thường không có nội dung đọc được qua API. Kit bỏ macro và ghi
  một dòng "Đã bỏ macro ...". Nếu câu trả lời có thể phụ thuộc vào macro đó, nói rõ với người dùng.

## Ưu tiên page gắn trong issue

Khi phân tích một issue, page đáng tin nhất là page **được gắn trực tiếp** vào issue (remote link, URL trong mô tả hoặc AC).
Không tìm kiếm cả space để đoán page liên quan.

## Báo cáo phải giữ

- Tiêu đề page, page ID, **version** và link: spec thay đổi theo thời gian, cần biết đã đọc bản nào.
- Page được gắn trên issue nào.
- Macro nào đã bị bỏ.

## Không làm

- Kit không sửa page. Nếu cần đổi spec, đưa nội dung đề xuất để người dùng tự cập nhật.
