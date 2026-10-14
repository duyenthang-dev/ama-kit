---
name: figma
description: Tải PNG các frame Figma (từ config hoặc link có node-id) rồi xem và mô tả màn hình - câu chữ, trạng thái, bố cục - hoặc so với requirement. Dùng khi người dùng đưa link Figma hoặc hỏi thiết kế trông thế nào.
argument-hint: <link Figma có node-id | để trống để lấy frame trong config>
---

# Figma

Yêu cầu: `$ARGUMENTS`

Gọi CLI, không tự gọi REST: `node "${CLAUDE_PLUGIN_ROOT}/bin/figma.js" ...`.

1. Chọn đầu vào:
   - frame trong config: `node "${CLAUDE_PLUGIN_ROOT}/bin/figma.js" export --out <thư mục>`
   - link frame (có `?node-id=`): thêm `--url "<link>"` (lặp lại được)
   - file key và node: `--file <KEY> --nodes 12:34,56:78`
   Link không có `node-id` là cả file: nhờ người dùng chọn frame và "Copy link to selection".
2. Đặt `--out` trong thư mục tạm hoặc thư mục run, không trong mã nguồn. Mỗi dòng đầu ra: `node id ⇥ tên ⇥ file png`.
3. Mở từng PNG bằng công cụ Read và **nhìn ảnh**. Mô tả những gì thấy: tên màn, thành phần, câu chữ, trạng thái
   (lỗi, rỗng, đang tải, vô hiệu), chỗ bị cắt hay thiếu.
4. So với requirement: mỗi nhận xét ghi tên frame và node ID. Hành vi không suy từ ảnh tĩnh; thiếu thì là câu hỏi.

Không ghi URL ảnh tải về vào báo cáo (CLI không in chúng); chỉ dùng link `figma.com/design/...`.
Ảnh cache theo version file, `--force` chỉ khi người dùng nói thiết kế đã đổi. Gặp 429 thì đợi rồi thử lại một lần.
Mã thoát 3: chuyển sang skill `setup`.
