---
name: setup
description: Cài ama-kit trên máy - đặt biến môi trường hoặc keychain cho Atlassian, Figma, BrowserStack và tạo config dự án. Dùng khi mới cài kit, khi lệnh báo thiếu biến môi trường (mã thoát 3) hoặc khi cần kiểm tra kết nối.
---

# Cài đặt ama-kit

CLI của kit nằm ở `${CLAUDE_PLUGIN_ROOT}/bin/`. Chạy lệnh bằng `node "${CLAUDE_PLUGIN_ROOT}/bin/workflow.js" ...`.
Đọc và tuân theo `${CLAUDE_PLUGIN_ROOT}/rules/credential-protection.md`.

## Nguyên tắc

- Không bao giờ xin người dùng dán token vào chat, không tự ghi token vào file nào.
- Không đọc hay in shell profile, `.env` hay keychain của người dùng. `workflow doctor` chỉ hiện giá trị đã che.

## Các bước

1. **Node.** Chạy `node --version`. Cần Node 20 trở lên; nếu thiếu, hướng dẫn cài từ nodejs.org rồi dừng.

2. **Biến môi trường.** Đưa người dùng danh sách (chỉ những dịch vụ họ dùng):

   | Biến | Lấy ở đâu |
   |---|---|
   | `ATLASSIAN_SITE` | vd. `your-site.atlassian.net` (hoặc đặt `jira.site` trong config) |
   | `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` | https://id.atlassian.com/manage-profile/security/api-tokens |
   | `FIGMA_ACCESS_TOKEN` | Figma → Settings → Security → Personal access tokens (scope đọc file) |
   | `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY` | BrowserStack → Account → Access key (chỉ cần khi chạy mobile) |

   Họ tự đặt bằng một trong hai cách, trong terminal của họ:
   - file `.env`: chép `${CLAUDE_PLUGIN_ROOT}/.env.example` thành `~/.ama/.env` (hoặc `.ama/.env` của dự án) rồi người dùng tự điền. File phải nằm trong `.gitignore`, nếu không kit bỏ qua token trong đó. Không bao giờ điền giá trị vào `.env.example`;
   - thêm `export TÊN_BIẾN=...` vào shell profile (`~/.zshrc`), mở terminal mới rồi mở lại Claude Code;
   - macOS Keychain: `security add-generic-password -s ama-kit -a FIGMA_ACCESS_TOKEN -w` (lệnh sẽ hỏi giá trị).
     Linux: `secret-tool store --label=ama-kit service ama-kit account FIGMA_ACCESS_TOKEN`.

   Đợi người dùng báo xong.

3. **Kiểm tra.** Chạy `node "${CLAUDE_PLUGIN_ROOT}/bin/workflow.js" doctor` (thêm `--only jira,confluence,figma` nếu không dùng mobile).
   Giải thích từng dòng ✘: 401 là sai cặp email/token, 403 là thiếu quyền, không kết nối được là sai site.

4. **Config dự án.** Trong thư mục project người dùng làm việc, chạy `node "${CLAUDE_PLUGIN_ROOT}/bin/workflow.js" init`.
   Lệnh tạo `.ama/project.yml` từ mẫu và thêm `runs/` vào `.gitignore`. Giúp họ điền `project.key`, `jira.site`,
   `confluence.spaceKey`, `figma.fileKey`, `figma.frames` (mỗi frame `nodeId` và `name`), `mobile.appPath`, `mobile.device`.
   Config không chứa token.

5. **Xong.** Giới thiệu các lệnh chính: `/ama-kit:context-brief PROJ-123`, `/ama-kit:analyze-requirement PROJ-123`, `/ama-kit:qe PROJ-123`.
