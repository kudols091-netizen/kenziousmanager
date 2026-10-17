# Orca Workflow Protocol — Kenzious Reel V2

> Pipeline 2-agent: Reviewer + Soldier. Baton protocol, 2-Strike circuit breaker, structured rejection.

---

## Model Assignment

| Vai trò | Agent (Orca) | Model | Lý do |
|---|---|---|---|
| **Reviewer** | Antigravity (Gemini) | Gemini Ultra | Context window lớn, đọc toàn bộ codebase một lần, phân tích kiến trúc |
| **Soldier** | Claude | Claude Opus 4.6 (Max 5x) | Reasoning + coding mạnh nhất, follow instruction chính xác, commit sạch |

---

## Vai trò

### Reviewer (Gemini Ultra via Antigravity)

- Đọc toàn bộ codebase, đánh giá chất lượng, tìm bug, security gap
- Xuất REVIEW.md với task list xếp theo severity
- Chạy `npm run check` (lint + test) trước khi đánh giá
- Reject phải có bằng chứng (Structured Rejection)
- Xong → đổi BATON.json holder thành `"soldier"`

### Soldier (Claude Opus 4.6)

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

## Boss Man Report — BÁO CÁO CHO BOSS MAN

**QUAN TRỌNG:** Mọi output (REVIEW.md, report, thông báo) phải viết bằng **tiếng Việt**.

Sau khi Soldier fix xong, Soldier PHẢI tạo section `## Báo Cáo Test Cho Boss Man` ở cuối REVIEW.md với format:

```markdown
## Báo Cáo Test Cho Boss Man

### Tóm tắt
- Đã fix: [số] task ([liệt kê TASK-XXX])
- Lint: [kết quả]
- Smoke test: [PASS/FAIL]

### Việc cần test thủ công

#### TASK-XXX: [Tên task]
**Trước khi fix:** [Mô tả lỗi cũ — chuyện gì xảy ra]
**Đã sửa:** [Mô tả fix — sửa gì, ở đâu]
**Cách test:**
1. [Bước 1 — cụ thể: mở tab nào, bấm nút gì]
2. [Bước 2 — nhập gì, chọn gì]
3. [Bước 3 — kết quả mong đợi]
**Kết quả đúng:** [Mô tả chi tiết kết quả đúng khi fix hoạt động]
**Nếu vẫn lỗi:** [Mô tả triệu chứng lỗi — để boss man biết fix chưa đúng]

#### TASK-YYY: [Tên task tiếp theo]
...

### Quyết định của Boss Man
- [ ] Tất cả PASS → merge vào main, dispatch Soldier vòng tiếp
- [ ] Có task FAIL → ghi feedback bên dưới, dispatch Soldier sửa lại
- [ ] Cần thêm ý kiến → ghi vào Escalated Tasks

### Feedback (Boss Man ghi ở đây)
[Boss man ghi feedback nếu task FAIL hoặc cần điều chỉnh]
```

**Luật cho Reviewer:**
- Executive Summary viết bằng tiếng Việt
- Task list mô tả bằng tiếng Việt (tên biến/hàm giữ nguyên tiếng Anh)
- Khuyến nghị viết bằng tiếng Việt

**Luật cho Soldier:**
- Commit message bằng tiếng Anh (chuẩn git)
- Báo Cáo Test bằng tiếng Việt, chi tiết từng bước
- Mỗi task fix phải có mục "Cách test" với bước cụ thể

---

## Prompt Templates

### Reviewer prompt (paste vào Orca worktree)

```
You are the REVIEWER agent. Read WORKFLOW.md first — follow the Baton Protocol, Structured Rejection, and 2-Strike rules exactly. ALL output in REVIEW.md must be written in Vietnamese (except code identifiers).

1. Read BATON.json — if holder is not "reviewer", STOP and report.
2. Read CLAUDE.md to understand the project.
3. Run `npm run check` to get current lint/test status.
4. Read the entire codebase: src/, renderer/js/, scripts/.
5. Create or update REVIEW.md with: Executive Summary (tiếng Việt), Strengths, Task List (ranked 🔴🟡🟢 with file:line, mô tả bằng tiếng Việt), Recommendations (tiếng Việt).
6. Update BATON.json: holder → "soldier", add history entry.
7. Commit all changes.
```

### Soldier prompt (paste vào Orca worktree)

```
You are the SOLDIER agent. Read WORKFLOW.md first — follow the Baton Protocol and strike rules exactly.

1. Read BATON.json — if holder is not "soldier", STOP and report.
2. Read REVIEW.md — pick the top 3 highest-priority tasks (🔴 first).
3. For each task: fix the issue, run `npm run check`, commit separately.
4. Update task status in REVIEW.md (pending → done).
5. Create section "Báo Cáo Test Cho Boss Man" at the end of REVIEW.md — write in Vietnamese, include: tóm tắt, từng task đã fix với "Cách test" chi tiết (mở tab nào, bấm nút gì, kết quả mong đợi), và checklist quyết định cho Boss Man.
6. Update BATON.json: holder → "reviewer", add history entry.
7. Commit BATON.json + REVIEW.md changes.
```

---

## Quy trình đầy đủ

```
1. Boss man tạo worktree "reviewer" → paste reviewer prompt
2. Reviewer chạy → xuất REVIEW.md (tiếng Việt) → đổi baton → commit
3. Boss man merge reviewer branch → main
4. Boss man tạo worktree "soldier" → paste soldier prompt
5. Soldier code → commit → viết Báo Cáo Test (tiếng Việt) → đổi baton → commit
6. Boss man merge soldier branch → main
7. Boss man đọc "Báo Cáo Test Cho Boss Man" → test từng bước → tick PASS/FAIL
8. PASS tất cả → dispatch vòng tiếp
9. Có FAIL → ghi feedback → dispatch Soldier sửa lại
10. Task bị escalate → Boss man đọc REVIEW.md, quyết định
```
