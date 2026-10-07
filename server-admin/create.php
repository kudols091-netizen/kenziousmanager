<?php
declare(strict_types=1);
require_once __DIR__ . '/functions.php';
require_login();

$pdo = db();
$hasExpired = has_lic('expired');
$hasHwid    = has_lic('hwid');
$hasNote    = has_lic('note');

function insert_key(PDO $pdo, string $key, string $expired, string $note, bool $hasExpired, bool $hasHwid, bool $hasNote): void {
    $f = ['`key`']; $p = ['?']; $v = [$key];
    if ($hasExpired) { $f[] = 'expired'; $p[] = '?'; $v[] = $expired; }
    if ($hasHwid)    { $f[] = 'hwid';    $p[] = '?'; $v[] = ''; }
    if ($hasNote && $note !== '') { $f[] = 'note'; $p[] = '?'; $v[] = $note; }
    $pdo->prepare('INSERT INTO `licenses` (' . implode(',', $f) . ') VALUES (' . implode(',', $p) . ')')->execute($v);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $lifetime = !empty($_POST['lifetime']);
    $expired = '';
    if ($hasExpired && !$lifetime) {
        $expired = trim((string)($_POST['expired'] ?? ''));
        if ($expired === '' || !valid_date($expired)) { flash('danger', 'Ngày hết hạn không hợp lệ (hoặc tích Vĩnh viễn).'); redirect('create.php'); }
    }
    $note = $hasNote ? trim((string)($_POST['note'] ?? '')) : '';
    try {
        if (($_POST['mode'] ?? '') === 'bulk') {
            $n = max(1, min(200, (int)($_POST['count'] ?? 1)));
            $pdo->beginTransaction();
            $keys = [];
            for ($i = 0; $i < $n; $i++) { $k = gen_key(); insert_key($pdo, $k, $expired, $note, $hasExpired, $hasHwid, $hasNote); $keys[] = $k; }
            $pdo->commit();
            $_SESSION['created_keys'] = $keys;
            flash('success', "Đã tạo $n key.");
        } else {
            $key = trim((string)($_POST['key'] ?? '')); if ($key === '') $key = gen_key();
            insert_key($pdo, $key, $expired, $note, $hasExpired, $hasHwid, $hasNote);
            $_SESSION['created_keys'] = [$key];
            flash('success', 'Đã tạo key: ' . $key);
        }
    } catch (Throwable $ex) { flash('danger', 'Lỗi: ' . $ex->getMessage()); }
    redirect('create.php');
}

$created = $_SESSION['created_keys'] ?? []; unset($_SESSION['created_keys']);
$NAV_ACTIVE = 'create';
$PAGE_TITLE = 'Tạo key';
require __DIR__ . '/partials/header.php';
?>
<div class="page-head"><div><h1>Tạo key</h1><p>Tạo mã bản quyền mới (để trống máy — tự bind khi khách kích hoạt)</p></div></div>

<?php if ($created): ?>
<div class="panel create-panel" style="margin-bottom:18px">
    <div class="panel-head"><h2>✅ Key vừa tạo (<?= count($created) ?>)</h2></div>
    <div class="table-wrap gon" style="max-height:260px">
        <table><tbody>
        <?php foreach ($created as $k): ?>
            <tr><td class="cell-copy"><span class="mono"><?= e($k) ?></span><button class="btn copy-btn" data-copy="<?= e($k) ?>" title="Copy">⧉ Copy</button></td></tr>
        <?php endforeach; ?>
        </tbody></table>
    </div>
    <?php if (count($created) > 1): ?><button class="btn" style="margin-top:12px" data-copy="<?= e(implode("\n", $created)) ?>" onclick="this.classList.add('copy-btn')">⧉ Copy tất cả</button><?php endif; ?>
</div>
<?php endif; ?>

<div class="grid-2">
    <div class="panel create-panel">
        <div class="panel-head"><h2>Tạo 1 key</h2></div>
        <form method="post">
            <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
            <input type="hidden" name="mode" value="single">
            <label>Mã key <small>(để trống = tự sinh)</small></label>
            <input class="input mono" name="key" placeholder="KZ-XXXXX-XXXXX-XXXXX">
            <?php if ($hasNote): ?><label>Ghi chú <small>(tên khách / Zalo…)</small></label><input class="input" name="note" placeholder="VD: Anh Tú - Zalo 09xx"><?php endif; ?>
            <?php if ($hasExpired): ?>
            <label>Ngày hết hạn</label>
            <input class="input" type="date" name="expired" id="createExpired">
            <div class="quick-days">
                <button type="button" class="chip" data-days="30">+30 ngày</button>
                <button type="button" class="chip" data-days="90">+90 ngày</button>
                <button type="button" class="chip" data-days="180">+180 ngày</button>
                <button type="button" class="chip" data-days="365">+1 năm</button>
            </div>
            <label class="check"><input type="checkbox" name="lifetime" value="1"> Vĩnh viễn (bỏ qua ngày hết hạn)</label>
            <?php endif; ?>
            <button class="btn primary full" type="submit">+ Tạo key</button>
        </form>
    </div>

    <div class="panel create-panel">
        <div class="panel-head"><h2>Tạo hàng loạt</h2><p>Sinh nhiều key tự động cùng hạn</p></div>
        <form method="post">
            <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
            <input type="hidden" name="mode" value="bulk">
            <label>Số lượng <small>(1–200)</small></label>
            <input class="input" type="number" name="count" min="1" max="200" value="10">
            <?php if ($hasNote): ?><label>Ghi chú chung</label><input class="input" name="note" placeholder="VD: Lô bán sỉ 10/2026"><?php endif; ?>
            <?php if ($hasExpired): ?>
            <label>Ngày hết hạn</label>
            <input class="input" type="date" name="expired">
            <label class="check"><input type="checkbox" name="lifetime" value="1"> Vĩnh viễn</label>
            <?php endif; ?>
            <button class="btn primary full" type="submit">+ Tạo hàng loạt</button>
        </form>
    </div>
</div>
<?php require __DIR__ . '/partials/footer.php'; ?>
