---
id: credential-protection
title: Bảo vệ credential
scope: always
triggers:
  - token
  - api key
  - mật khẩu
  - biến môi trường
  - đăng nhập
---

# Bảo vệ credential

1. Credential chỉ đọc từ biến môi trường hoặc OS keychain (service `ama-kit`):
   `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, `FIGMA_ACCESS_TOKEN`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`.
2. Không bao giờ yêu cầu người dùng dán token vào chat. Nếu họ dán, đừng lặp lại giá trị đó; khuyên họ thu hồi token và tạo token mới.
3. Không truyền token qua dòng lệnh. CLI từ chối `--token`, `--password`, `--api-token`, `--access-key`, `--secret` (mã thoát 2).
4. Không ghi token vào repo, file config, log, báo cáo, comment hay prompt. `.env.example` chỉ chứa tên biến với giá trị rỗng.
5. Khi thiếu biến, CLI in **tên** biến (mã thoát 3), không in giá trị. Làm theo skill `setup`.
6. Không đọc hoặc in file chứa bí mật của người dùng (shell profile, keychain dump, `.env`) để "kiểm tra". Dùng `workflow doctor`, lệnh này chỉ hiện giá trị đã che.
