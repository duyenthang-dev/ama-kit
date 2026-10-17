---
title: Luồng QE và schema artifact
topic: qe
reviewed: 2026-10-15
sources:
  - https://en.wikipedia.org/wiki/Traceability_matrix
  - https://www.istqb.org/certifications/certified-tester-foundation-level
---

# Luồng QE và schema artifact

```
context-brief KEY        (tùy chọn) hiểu task trong dự án     → runs/KEY-context-<t>/report/context-brief.md
analyze-requirement KEY  lấy issue, page, frame                → runs/KEY-<t>/{jira,confluence,figma}/
  skill analyze-requirement                                    → report/analysis.md, report/ac.json
skill qe: đọc nguồn, tự lên kế hoạch                          → report/qe-plan.json
  rồi làm các artifact đã chọn (tùy chọn)                     → test-strategy.md, test-plan.md, test-cases.json, mobile.md, summary.md
qe-workflow KEY          kiểm schema, sinh truy vết, đối chiếu kế hoạch → report/test-cases.md, traceability-*.md
mobile-test run --suite smoke --issue KEY --yes  (nếu kế hoạch có, sau xác nhận) → report/mobile.md
jira comment KEY --file report/summary.md --yes  (nếu kế hoạch có, sau xác nhận)
```

## report/ac.json

```json
{
  "issueKey": "PROJ-123",
  "acceptanceCriteria": [
    {
      "id": "AC-1",
      "original": "Câu gốc nguyên văn trên issue",
      "interpretation": "Given ... When ... Then ... (diễn giải, có thể bỏ trống)",
      "source": "jira | confluence | figma | user | inferred",
      "sourceRef": "field customfield_10050 | mục Acceptance criteria | page 'Login spec' v7 | frame Login 12:34",
      "quality": "testable | ambiguous | untestable",
      "issues": ["vì sao chưa đo được"],
      "moscow": "must | should | could | wont",
      "testLevel": "unit | integration | e2e | smoke | manual",
      "figmaNodes": ["12:34"]
    }
  ],
  "gaps": [{ "id": "GAP-1", "description": "...", "sources": ["jira", "figma"], "severity": "high | medium | low" }],
  "questions": [{ "id": "Q-1", "question": "...", "relatesTo": ["AC-2", "GAP-1"], "priority": "high | medium | low", "askWho": "PO | designer | dev" }]
}
```

## report/qe-plan.json

Không artifact QE nào bắt buộc. Agent đọc Jira, Confluence, Figma, analysis rồi chọn; mỗi lựa chọn có lý do.

```json
{
  "issueKey": "PROJ-123",
  "rationale": "Story web, chưa sẵn sàng: ưu tiên câu hỏi; test case nháp theo giả định",
  "deliverables": [
    { "file": "test-cases.json", "why": "phủ AC-1..AC-3 để dev ước lượng" },
    { "file": "summary.md", "why": "đưa câu hỏi chặn lên Jira" }
  ],
  "skipped": [
    { "file": "mobile.md", "why": "tính năng WebApp, không có app" },
    { "file": "test-strategy.md", "why": "story nhỏ, tầng test ghi ngay trong test case" }
  ]
}
```

Danh mục thường dùng: `test-strategy.md`, `test-plan.md`, `test-cases.json`, `mobile.md`, `summary.md`; được thêm file
khác trong `report/` (vd. `exploratory-charter.md`) nếu issue cần. `qe-workflow` báo lỗi (mã 2) khi thiếu `rationale`
hoặc thiếu `why`; liệt kê artifact đã chọn mà chưa có.

## report/test-cases.json

```json
{
  "issueKey": "PROJ-123",
  "testCases": [
    {
      "id": "TC-1",
      "title": "Đăng nhập với thông tin hợp lệ",
      "acIds": ["AC-1"],
      "level": "unit | integration | e2e | smoke | manual",
      "type": "positive | negative | boundary | permission | state | accessibility | performance",
      "priority": "P1 | P2 | P3",
      "preconditions": ["Có tài khoản test (factory user)"],
      "data": "factory: user hợp lệ (dữ liệu giả)",
      "steps": ["Mở app", "Nhập email và mật khẩu hợp lệ", "Bấm Đăng nhập"],
      "expected": ["Màn Home đúng frame 'Home' 56:78"],
      "figmaNodes": ["56:78"],
      "automation": { "status": "automated | candidate | manual", "ref": "test/specs/login.e2e.js#TC-1" }
    }
  ]
}
```

`qe-workflow KEY` báo lỗi (mã thoát 2) khi ID sai dạng, thiếu field bắt buộc, tham chiếu AC không tồn tại;
cảnh báo khi một AC chưa có test case hoặc test có vẻ dùng dữ liệu thật.

## report/summary.md (comment Jira)

Ngắn, dưới khoảng 3.000 ký tự: mức sẵn sàng, độ phủ ("N/M tiêu chí có test case, K tự động"), kết quả smoke
hoặc lý do chưa chạy, câu hỏi mở quan trọng (ID + một dòng), gap chặn. Không có đường dẫn file local, token, email.
