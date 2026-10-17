# Orca Workflow Protocol — Kenzious Reel V2

> Pipeline 2-agent: Reviewer + Soldier. Baton protocol, 2-Strike circuit breaker, structured rejection.

---

## Vai trò

### Reviewer

- Đọc toàn bộ codebase, đánh giá chất lượng, tìm bug, security gap
- Xuất REVIEW.md với task list xếp theo severity
- Chạy `npm run check` (lint + test) trước khi đánh giá
- Reject phải có bằng chứng (Structured Rejection)
- Xong → đổi BATON.json holder thành `"soldier"`

### Soldier

- Đọc REVIEW.md, pick task theo priority (🔴 trước)
- Code + fix + commit riêng từng task
- Chạy `npm run check` sau mỗi thay đổi
- Xong → đổi BATON.json holder thành `"reviewer"`

---

## Baton Protocol

File `BATON.json` ở root project. Chỉ agent có tên trùng `holder` mới được hành động.

### Luật

1. Đọc `BATON.json` trước khi làm bất cứ gì
2. `holder` = tên mình → ĐƯỢC CHẠY
3. `holder` ≠ tên mình → DỪNG, báo "Baton thuộc về [X]"
4. Xong việc → cập nhật `holder` sang agent tiếp theo, thêm entry vào `history`, commit
5. Không bao giờ tự lấy baton khi không phải lượt mình

### Format

```json
{
  "holder": "reviewer",
  "task": "tên task hiện tại",
  "acquired_at": "ISO 8601 timestamp",
  "status": "working | done | escalated",
  "history": [
    {
      "holder": "reviewer",
      "action": "acquired | passed | escalated",
      "task": "tên task",
      "at": "ISO 8601 timestamp"
    }
  ]
}
```

### Luồng baton

```
Reviewer acquired → làm xong → passed → Soldier
Soldier acquired → code xong → passed → Reviewer
Reviewer acquired → review code → passed hoặc escalated
```

---

## 2-Strike Circuit Breaker

Mỗi task có `strike_count`. Reviewer reject = +1 strike.

| Strike | Hành động |
|---|---|
| 0 | Task mới, Soldier chưa làm |
| 1 | Reviewer reject lần 1 → Soldier sửa, gửi review lần 2 |
| 2 | Reviewer reject lần 2 → **AUTO ESCALATE** → Boss man quyết |

### Khi escalate

- Soldier và Reviewer đều DỪNG task này
- Chuyển sang task tiếp trong REVIEW.md
- Thêm section `## Escalated Tasks` trong REVIEW.md
- Ghi rõ: task gì, Soldier sửa gì 2 lần, Reviewer reject vì sao 2 lần
- Đổi BATON status thành `"escalated"`
- Boss man đọc → quyết hướng

### Luật đếm strike

- Chỉ 🔴 BLOCKER và 🟡 MAJOR tính strike
- 🟢 NITPICK không tính strike, không block task
- Reset strike về 0 khi task PASS

---

## Structured Rejection

Reviewer reject task phải tuân theo format này. Reject không đúng format → Soldier bỏ qua.

### 3 mức severity

#### 🔴 BLOCKER — Code sai, crash, mất data

Bắt buộc cung cấp:
- File + line number
- Scenario gây lỗi
- Expected vs Actual
- Test case chứng minh
- Đề xuất fix

```markdown
**🔴 BLOCKER — [Mô tả ngắn]**
- **File:** path/to/file.js:LINE
- **Scenario:** [Mô tả bước tái hiện]
- **Expected:** [Kết quả đúng]
- **Actual:** [Kết quả sai]
- **Test case:**
  [code block chứng minh]
- **Đề xuất:** [Hướng fix]
```

#### 🟡 MAJOR — Logic sai, security gap, performance issue

Bắt buộc cung cấp:
- File + line number
- Mô tả scenario lỗi
- Đề xuất fix

```markdown
**🟡 MAJOR — [Mô tả ngắn]**
- **File:** path/to/file.js:LINE
- **Scenario:** [Khi nào xảy ra]
- **Impact:** [Ảnh hưởng gì]
- **Đề xuất:** [Hướng fix]
```

#### 🟢 NITPICK — Code style, naming, gợi ý cải thiện

Không bắt buộc. Soldier tự quyết có sửa hay không. Không tính strike.

```markdown
**🟢 NITPICK — [Mô tả ngắn]**
- **File:** path/to/file.js:LINE
- **Gợi ý:** [Đề xuất]
```

---

## REVIEW.md Format

Reviewer tạo REVIEW.md ở root với format:

```markdown
# Code Review — Kenzious Reel V2

**Reviewer:** [tên worktree]
**Date:** [ISO 8601]
**Commit reviewed:** [hash]

## Executive Summary (cho Boss Man)

[5-10 dòng tóm tắt: trạng thái project, vấn đề nghiêm trọng nhất, khuyến nghị]

## Điểm mạnh

- [Cái gì tốt, giữ lại]

## Task List

### TASK-001: [Tên task] 🔴
- **File:** path/to/file.js:LINE
- **Vấn đề:** [Mô tả]
- **Strike:** 0/2
- **Status:** pending | in_progress | done | rejected | escalated

### TASK-002: [Tên task] 🟡
...

## Khuyến nghị

- [Feature nào nên phát triển tiếp]
- [Feature nào nên ngưng]
- [Kiến trúc cần thay đổi gì]

## Escalated Tasks

[Section này chỉ xuất hiện khi có task bị escalate]
```

---

## Prompt Templates

### Reviewer prompt (paste vào Orca worktree)

```
You are the REVIEWER agent. Read WORKFLOW.md first — follow the Baton Protocol, Structured Rejection, and 2-Strike rules exactly.

1. Read BATON.json — if holder is not "reviewer", STOP and report.
2. Run `npm run check` to get current lint/test status.
3. Read the entire codebase: src/, renderer/js/, scripts/.
4. Create or update REVIEW.md with: Executive Summary, Strengths, Task List (ranked 🔴🟡🟢 with file:line), Recommendations.
5. Update BATON.json: holder → "soldier", add history entry.
6. Commit all changes.
```

### Soldier prompt (paste vào Orca worktree)

```
You are the SOLDIER agent. Read WORKFLOW.md first — follow the Baton Protocol and strike rules exactly.

1. Read BATON.json — if holder is not "soldier", STOP and report.
2. Read REVIEW.md — pick the top 3 highest-priority tasks (🔴 first).
3. For each task: fix the issue, run `npm run check`, commit separately with clear message.
4. Update task status in REVIEW.md (pending → done).
5. Update BATON.json: holder → "reviewer", add history entry.
6. Commit BATON.json + REVIEW.md changes.
```

---

## Quy trình đầy đủ

```
1. Boss man tạo worktree "reviewer" → paste reviewer prompt
2. Reviewer chạy → xuất REVIEW.md → đổi baton → commit
3. Boss man merge reviewer branch → main
4. Boss man tạo worktree "soldier" → paste soldier prompt
5. Soldier code → commit → đổi baton → commit
6. Boss man merge soldier branch → main
7. Nếu cần review lại → tạo worktree reviewer mới (cycle 2)
8. Task bị escalate → Boss man đọc REVIEW.md, quyết định
```
