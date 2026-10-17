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

Hoặc từ repo đã clone trên máy, một lệnh (cài mới hoặc cập nhật, tạo `~/.ama/.env` nếu chưa có):

```bash
npm run claude:install            # = node scripts/install-claude.js
node scripts/install-claude.js --check      # cài xong thử kết nối Jira/Confluence/Figma
node scripts/install-claude.js --dry-run    # chỉ in các bước
npm run claude:uninstall
```

Plugin chạy từ bản copy trong cache của Claude Code, nên sửa code kit xong phải chạy lại `npm run claude:install`.

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

Hoặc đặt bằng file (tiện cho máy cá nhân):

```bash
mkdir -p ~/.ama && cp .env.example ~/.ama/.env   # dùng chung mọi dự án; hoặc <project>/.ama/.env cho riêng dự án
# rồi điền giá trị vào ~/.ama/.env — KHÔNG điền vào .env.example (file đó được commit)
```

Thứ tự ưu tiên: biến môi trường → `.ama/.env` của dự án → `~/.ama/.env` → `.env` ở gốc kit → keychain.
Cài dạng plugin Claude Code thì dùng `~/.ama/.env` (plugin chạy từ bản copy trong cache, không thấy `.env` ở repo kit). Kit chỉ đọc token từ `.env`
khi git bỏ qua file đó (có trong `.gitignore`, hoặc nằm ngoài repo); nếu không, token bị bỏ qua kèm cảnh báo.
`ATLASSIAN_SITE` cũng có thể bỏ trống nếu config dự án đã có `jira.site`.

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
| `qe-workflow PROJ-123` | Kiểm schema, sinh test case và hai ma trận truy vết, đối chiếu với kế hoạch QE (`qe-plan.json`) |
| `workflow skills \| rules \| adapt cursor --out <dir> \| validate \| init \| doctor \| status KEY` | Quản lý kit |

## Skill (Claude Code)

Không cần gõ slash command: plugin có hook `SessionStart` (`hooks/hooks.json` → `scripts/session-context.js`). Mở Claude Code
trong project có `.ama/project.yml`, hook nạp sẵn vào phiên: dự án nào, việc nào dùng skill nào, quy tắc bắt buộc, mục lục
knowledge và các run gần nhất (~800 token, không đọc credential, không gọi mạng). Cứ nói tự nhiên, vd. "phân tích SCRUM-11".

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
/ama-kit:qe PROJ-123          → đọc nguồn, tự lên kế hoạch (qe-plan.json), chỉ làm artifact cần thiết → comment Jira
```

Agent đọc các artifact trong `runs/` khi cần phân tích lỗi. Schema: [knowledge/qe-workflow.md](knowledge/qe-workflow.md).

## Cấu trúc

```
.claude-plugin/       manifest plugin và marketplace cho Claude Code
hooks/                hook SessionStart: nạp tóm tắt kit vào đầu phiên
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
