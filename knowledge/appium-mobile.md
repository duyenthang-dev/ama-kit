---
title: Appium 2, WebdriverIO và BrowserStack
topic: tool
reviewed: 2026-10-15
sources:
  - https://appium.io/docs/en/latest/
  - https://www.w3.org/TR/webdriver2/
  - https://webdriver.io/docs/gettingstarted
  - https://www.browserstack.com/docs/app-automate
---

# Appium 2, WebdriverIO và BrowserStack

## Gọi API chính thức

- **Upload app**: BrowserStack App Automate REST `POST /app-automate/upload` (multipart) trả `bs://...`.
- **Mở session**: giao thức W3C WebDriver tới hub `https://hub-cloud.browserstack.com/wd/hub` với capability
  `platformName: Android`, `appium:automationName: UiAutomator2`, `appium:app: bs://...` và `bstack:options`
  (`deviceName`, `osVersion`, `projectName`, `buildName`, `sessionName`, `video`).
- **Kết quả session**: `GET /app-automate/sessions/{id}.json` trả trạng thái, `public_url` (trang session) và `video_url`.
- **Đánh dấu pass/fail**: `PUT /app-automate/sessions/{id}.json` với `status` và `reason`.
- Smoke có sẵn của kit nói thẳng giao thức WebDriver (không cần cài gì). Suite khác chạy bằng **WebdriverIO**
  (`mobile.wdioConfig`), kit truyền credential và app qua biến môi trường.

## Locator và độ ổn định

- Ưu tiên **accessibility id** (`content-desc` trên Android), rồi resource-id. Tránh XPath theo chữ hay vị trí.
- Chờ trạng thái phần tử có thời hạn, không `sleep` cố định.
- Mỗi test tự đưa app về trạng thái biết trước; test độc lập với nhau.
- Đặt tên test theo ID test case (`TC-1 ...`) để kết quả truy vết được.

## Lưu ý mobile

Gián đoạn (cuộc gọi, thông báo, app chạy nền), xoay màn hình, cỡ chữ động, mạng chậm hoặc mất, quyền
(lần đầu, từ chối, thu hồi), bàn phím che ô nhập, nút back, cài mới và nâng cấp.

## Báo cáo phải giữ

- Device và phiên bản OS, app (bs:// hoặc tên build), thời điểm chạy.
- Kết quả và lý do; **session URL**, **video**, **screenshot** khi có.
- Nếu không chạy: lý do cụ thể (chưa cấu hình, người dùng chưa đồng ý, không mở được session).
- Không dán log thô có thể chứa credential; kit che access key trong log.

Chưa hỗ trợ: iOS, nhiều device song song, tự sinh script Appium từ ảnh Figma.
