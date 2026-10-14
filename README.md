# ama-kit

**AMA = Ask Me Anything.** CLI cá nhân và bộ skill giúp hiểu ngữ cảnh một task, phân tích requirement và chạy QE mobile,
dựa trên Jira Cloud, Confluence Cloud, Figma và Appium 2 trên BrowserStack.

- Node 20 trở lên, `"type": "module"`, **không phụ thuộc** package nào (không cần `npm install` để chạy CLI).
- Credential chỉ lấy từ biến môi trường hoặc OS keychain. Không có cờ `--token`; không ghi token vào repo, log, báo cáo hay comment.
- Mọi lệnh có `--help` và `--dry-run` (không gọi API, không cần credential).
- Mã thoát: `0` xong, `1` lỗi API, `2` sai cách dùng, `3` thiếu biến môi trường (in tên biến, không in giá trị).
- Repo vừa là **Claude Code plugin** vừa dùng được với **Cursor** qua adapter.

## Cài đặt

### Dùng với Claude Code (gửi cho người khác)

```bash
claude plugin marketplace add <github-user>/ama-kit
claude plugin install ama-kit@ama
```

Trong Claude Code, chạy `/ama-kit:setup` để được hướng dẫn đặt biến môi trường và tạo config dự án.

### Dùng trực tiếp từ repo

```bash
git clone <repo> ama-kit && cd ama-kit
npm test                 # kiểm tra offline, không cần token
node bin/workflow.js doctor
```

Muốn gọi lệnh ở mọi nơi: `npm link` (tạo các lệnh `ama`, `jira`, `confluence`, `figma`, `mobile-test`,
`context-brief`, `analyze-requirement`, `qe-workflow`, `workflow`). Hoặc luôn gọi qua `ama <lệnh> ...`.

### Dùng với Cursor

```bash
node providers/cursor/adapt.js --out <project>/.cursor/rules
```

Xem [providers/README.md](providers/README.md).

## Credential

Chỉ tên biến nằm trong [.env.example](.env.example). Đặt giá trị bằng một trong hai cách:

```bash
# 1. biến môi trường (vd. trong ~/.zshrc)
export ATLASSIAN_SITE=your-site.atlassian.net
export ATLASSIAN_EMAIL=you@example.com
export ATLASSIAN_API_TOKEN=...      # https://id.atlassian.com/manage-profile/security/api-tokens
export FIGMA_ACCESS_TOKEN=...       # Figma → Settings → Security → Personal access tokens
export BROWSERSTACK_USERNAME=...
export BROWSERSTACK_ACCESS_KEY=...

# 2. macOS Keychain (lệnh hỏi giá trị, không để lại trong shell history)
security add-generic-password -s ama-kit -a ATLASSIAN_API_TOKEN -w
```

Linux: `secret-tool store --label=ama-kit service ama-kit account ATLASSIAN_API_TOKEN`.

## Config dự án

Mẫu: [config/project.example.yml](config/project.example.yml). Không chứa token.

- Trong project của bạn: `workflow init` tạo `.ama/project.yml`.
- Khi chạy từ repo kit: chép thành `config/project.yml` (đã gitignore).
- Hoặc chỉ định bằng `--config <file>` hay biến `AMA_PROJECT_CONFIG`.

Khóa chính: `project.key`, `jira.site`, `confluence.site`, `confluence.spaceKey`, `figma.fileKey`,
`figma.frames[{nodeId, name}]`, `mobile.platform`, `mobile.appPath`, `mobile.device.name`, `mobile.device.platformVersion`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `jira issue PROJ-123` | Markdown: summary, mô tả, tiêu chí chấp nhận (nguyên văn + nguồn), liên kết |
| `jira comment PROJ-123 --file report.md [--yes]` | Comment sau khi người dùng xác nhận; không đổi trạng thái issue |
| `confluence page <url-hoặc-id>` | Page sang Markdown; macro không đọc được bị bỏ kèm một dòng ghi chú |
| `figma export` | PNG các frame trong config (hoặc `--url`, `--nodes`); không ghi URL ảnh ký sẵn |
| `mobile-test run --suite smoke [--issue KEY] [--yes]` | Appium 2, một device Android trên BrowserStack; session URL, video, screenshot. Hỏi trước khi upload app hoặc mở session |
| `context-brief PROJ-123` | Đọc một vòng quanh issue: cha, con, A chặn, chặn A, page gắn kèm |
| `analyze-requirement PROJ-123` | Tạo `runs/<KEY>-<thời điểm>/` gồm issue, page, ảnh; skill viết `report/analysis.md` |
| `qe-workflow PROJ-123` | Kiểm schema, sinh test case và hai ma trận truy vết |
| `workflow skills \| rules \| adapt cursor --out <dir> \| validate \| init \| doctor \| status KEY` | Quản lý kit |

## Skill (Claude Code)

| Skill | Dùng khi |
|---|---|
| `/ama-kit:context-brief PROJ-123` | Đang làm task A, cần hiểu dự án và các task B, C, D liên quan (chỉ đọc) |
| `/ama-kit:analyze-requirement PROJ-123` | Phân tích requirement: tiêu chí, gap, câu hỏi mở |
| `/ama-kit:qe PROJ-123` | Chiến lược, test plan, test case, truy vết, smoke, comment tóm tắt |
| `/ama-kit:jira`, `/ama-kit:confluence`, `/ama-kit:figma`, `/ama-kit:mobile-test` | Việc lẻ với từng công cụ |
| `/ama-kit:setup` | Cài đặt, thiếu biến môi trường, kiểm tra kết nối |

Luồng thường dùng:

```
context-brief PROJ-123        (tùy chọn) hiểu task trong bối cảnh dự án
analyze-requirement PROJ-123  → runs/PROJ-123-<thời điểm>/report/analysis.md, ac.json
qe-workflow PROJ-123          → test-strategy, test-plan, test-cases, traceability-*, mobile, summary → comment Jira
```

Agent đọc các artifact trong `runs/` khi cần phân tích lỗi. Schema: [knowledge/qe-workflow.md](knowledge/qe-workflow.md).

## Cấu trúc

```
.claude-plugin/       manifest plugin và marketplace cho Claude Code
bin/                  mỗi lệnh một file (+ ama.js gọi chung)
src/                  args, config, credentials, errors, registry, root, run-layout, yaml, redact, ...
src/clients/          chỗ duy nhất gọi API: jira, confluence, figma, browserstack, cloud-provider, webdriver
src/commands/         logic từng lệnh
registry/skills.yml   danh mục skill: name, description, triggers, entrypoint, skillPath, capabilities, inputs, outputs
rules/                bảo vệ credential, xác nhận trước khi ghi, giới hạn dữ liệu đưa cho agent
knowledge/            bài thực hành (frontmatter title, topic, reviewed, sources https)
skills/, workflows/   SKILL.md thuần, bảo agent gọi CLI, không tự gọi REST
providers/cursor/     adapter sinh file Cursor (generated: true, source)
scripts/              validate-governance.js
config/               project.example.yml, mẫu WebdriverIO
test/                 node:test, HTTP giả, không cần token thật
```

## Device cloud

`src/clients/cloud-provider.js` định nghĩa interface `CloudProvider` (`uploadApp`, `startSession`, ...). BrowserStack implement
interface đó; đổi provider (vd. Sauce Labs) chỉ cần thêm một file trong `src/clients/` mà không viết lại lệnh.
Smoke có sẵn nói thẳng giao thức WebDriver của Appium 2. Suite khác chạy bằng WebdriverIO (`mobile.wdioConfig`, mẫu ở `config/wdio/`).

## Kiểm tra

```bash
npm test                            # unit, CLI, e2e với HTTP giả, adapter, validator
node scripts/validate-governance.js # hoặc: workflow validate
```

Validator kiểm field bắt buộc của registry, entrypoint và SKILL.md tồn tại, trigger không trùng, metadata knowledge,
link tương đối, config mẫu, `.env.example`, token lọt vào repo, và **chuỗi cấm**. Danh sách chuỗi cấm (tên hệ thống,
domain nội bộ không được lọt vào repo) đặt ở `config/banned-terms.txt` (đã gitignore, mỗi dòng một chuỗi) hoặc biến
`AMA_BANNED_TERMS`. Không ghi danh sách này vào repo, vì chính nó sẽ làm lộ các tên đó.

## Phát hành

Tăng `version` trong `.claude-plugin/plugin.json` và `package.json`, push. Người dùng cập nhật bằng
`claude plugin marketplace update ama`.

## Chưa làm

Web UI, iOS, nhiều device song song, tự sinh script Appium từ ảnh Figma, tự đổi trạng thái Jira.
