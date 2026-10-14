---
name: mobile-test
description: Chạy smoke test Android bằng Appium 2 trên BrowserStack (một device), trả session URL, video và screenshot, và phân loại lỗi. Dùng khi người dùng muốn upload APK, chạy smoke, hoặc hỏi vì sao một session fail.
argument-hint: [run --suite smoke | upload <apk> | check] [--issue PROJ-123]
---

# Mobile test

Yêu cầu: `$ARGUMENTS`

Gọi CLI, không tự gọi REST: `node "${CLAUDE_PLUGIN_ROOT}/bin/mobile-test.js" ...`. Tuân theo
`${CLAUDE_PLUGIN_ROOT}/rules/confirm-before-write.md`. Đọc `${CLAUDE_PLUGIN_ROOT}/knowledge/appium-mobile.md` khi cần viết hoặc sửa test.

## Lệnh

- `check`: kiểm credential, xem gói và số session song song.
- `upload <file.apk>`: upload app, in `bs://...`.
- `run --suite smoke [--issue <KEY>]`: upload app (nếu là file local), mở một session trên device trong config,
  chờ màn hình đầu, chụp màn hình, đóng session, ghi `report/mobile.md` vào run của issue.

## Luôn hỏi trước khi upload app hoặc mở session

1. Chạy lệnh **không** `--yes`: CLI in kế hoạch (app, device, suite) và dừng.
2. Nói với người dùng việc này tốn phút device cloud, hỏi có chạy không.
3. Chỉ khi họ đồng ý rõ ràng mới chạy lại với `--yes`.

## Đọc kết quả

- Mã thoát 0: PASS. Mã 1: FAIL hoặc lỗi API. `report/mobile.md` có session URL, video, screenshot khi có.
- Xem screenshot (Read) và trang session. Phân loại:
  - **lỗi sản phẩm**: app sai (màn sai, crash trong code app, câu chữ sai);
  - **lỗi test**: locator cũ, thiếu chờ, dữ liệu test sai;
  - **lỗi môi trường**: không mở được session, app upload hết hạn, mạng, hết quota.
- Smoke một device chỉ chứng minh đường chính mở được; nói rõ điều đó khi báo kết quả.
- Không chạy được: ghi lý do cụ thể (chưa cấu hình, người dùng chưa đồng ý, không mở được session).

Suite khác ngoài smoke cần WebdriverIO: đặt `mobile.wdioConfig` trong config; mẫu ở `${CLAUDE_PLUGIN_ROOT}/config/wdio/`.
Mã thoát 3: chuyển sang skill `setup`.
