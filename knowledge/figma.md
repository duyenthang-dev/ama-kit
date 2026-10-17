---
title: Figma REST API
topic: tool
reviewed: 2026-10-15
sources:
  - https://www.figma.com/developers/api
  - https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens
---

# Figma REST API

## Gọi API chính thức

- **Xác thực**: personal access token trong header `X-Figma-Token` (`FIGMA_ACCESS_TOKEN`), scope đọc nội dung file là đủ.
- **Thông tin frame**: `GET /v1/files/{fileKey}/nodes?ids=...` trả tên, loại và `version` của file.
- **Xuất ảnh**: `GET /v1/images/{fileKey}?ids=...&format=png&scale=2` trả URL ảnh **ký sẵn, hết hạn**.
  Tải ảnh về ngay; **không ghi URL đó vào báo cáo** (chứa chữ ký truy cập).
- `fileKey` là phần sau `/design/` (hoặc `/file/`) trong URL. `node-id` trong URL dạng `12-34`, trong API dạng `12:34`.
- Giới hạn tần suất của Figma khá chặt với gói thấp. Kit cache ảnh theo `version` của file; chỉ tải lại khi file đổi.

## Frame nào

- Frame khai báo trong config (`figma.frames`): các màn hình luôn cần.
- Frame được link trong issue hoặc page **có `node-id`**. Link cả file (không `node-id`) bị bỏ qua kèm cảnh báo.
- Link tới **page** (CANVAS) hoặc **section** được mở rộng thành các màn hình bên trong (frame, component,
  instance), đi sâu tối đa 2 tầng section. Node chữ, nhóm trang trí bị bỏ. Số màn tối đa theo `limits.maxFrames`.
  Lấy link page/section: chọn page hoặc section trong Figma rồi copy URL (có `?node-id=`).

## Báo cáo phải giữ

- Tên frame, node ID và link `figma.com/design/<fileKey>/?node-id=...` (link này không chứa token).
- Version file đã xuất.
- Frame nào không xuất được và vì sao (rỗng, bị ẩn, đã xóa).

## Đọc ảnh

Mô tả những gì **thấy được**: tên màn hình, thành phần, câu chữ, trạng thái (lỗi, rỗng, đang tải, vô hiệu).
Không suy hành vi từ ảnh tĩnh; hành vi phải có trong issue hoặc page, nếu không thì là một câu hỏi.
