# Providers

Nguồn chuẩn của kit là trung lập với provider: `registry/skills.yml`, `rules/`, `skills/`, `workflows/` và CLI trong `bin/`.
Mỗi provider chỉ có một adapter đọc các nguồn đó và chuyển sang định dạng của provider, rồi gọi cùng CLI.
Adapter không gọi Jira, Confluence, Figma hay Appium, và không viết lại API.

| Provider | Cách dùng |
|---|---|
| Claude Code | Dùng trực tiếp, không cần adapter: repo là một plugin (`.claude-plugin/`). Skill đọc từ `skills/` và `workflows/`. |
| Cursor | `node providers/cursor/adapt.js --out .cursor/rules` (hoặc `workflow adapt cursor --out <thư mục>`). |

## Cursor

- Mỗi rule thành `ama-rule-<id>.mdc`; rule `scope: always` có `alwaysApply: true`.
- Mỗi skill trong registry thành `ama-skill-<name>.mdc`, kèm trigger và lệnh CLI với đường dẫn tuyệt đối tới kit.
- Mọi file sinh có `generated: true` và `source: <file nguồn>`. **Sửa nguồn rồi chạy lại adapter**; không sửa file sinh.
- Thư mục sinh không commit (`.cursor/` đã có trong `.gitignore`).

## Thêm provider

Tạo `providers/<tên>/adapt.js`: đọc `loadRegistry()` và `loadRules()` từ `src/registry.js`, ghi file vào `--out`,
gắn `generated: true` và `source`. Thêm vào bảng trên và vào lệnh `workflow adapt`.
