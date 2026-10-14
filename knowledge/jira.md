---
title: Jira Cloud REST API v3
topic: tool
reviewed: 2026-10-15
sources:
  - https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
  - https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
  - https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/
---

# Jira Cloud REST API v3

## Gọi API chính thức

- **Xác thực**: Basic auth với email Atlassian và API token cá nhân (`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`).
  Site lấy từ `jira.site` hoặc `ATLASSIAN_SITE`.
- **Đọc issue**: `GET /rest/api/3/issue/{key}?expand=names&fields=*all`. `names` cho biết tên của từng `customfield_*`,
  nhờ đó kit dò được field tiêu chí chấp nhận.
- **Link ngoài** (page Confluence gắn vào issue): `GET /rest/api/3/issue/{key}/remotelink`.
- **Issue con**: `POST /rest/api/3/search/jql` với `parent = KEY`; sub-task cũng có trong field `subtasks`.
- **Comment**: `POST /rest/api/3/issue/{key}/comment` với thân dạng ADF.
- Mô tả, field rich text và comment dùng **ADF** (Atlassian Document Format, JSON), không phải Markdown. Kit chuyển hai chiều.
- 429 nghĩa là bị giới hạn tần suất: đợi theo `Retry-After` rồi thử lại.

## Báo cáo phải giữ

- Mã issue, summary, trạng thái, link `/browse/KEY`.
- Tiêu chí chấp nhận **nguyên văn** và **nguồn** (field `customfield_…` hay mục trong mô tả).
- Quan hệ: cha, con, chặn, bị chặn.
- Ngày cập nhật của issue, để biết phân tích dựa trên phiên bản nào.

## Không làm

- Không đổi trạng thái, người làm hay field (kit không có lệnh cho việc này).
- Không comment khi người dùng chưa xác nhận.
