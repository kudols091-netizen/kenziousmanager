<?php
declare(strict_types=1);
require_once __DIR__ . '/functions.php';
require_login();

$pdo = db();
$hasExpired = has_lic('expired');
$hasHwid    = has_lic('hwid');
$hasSeen    = has_lic('last_seen');
$hasIp      = has_lic('last_ip');
$hasNote    = has_lic('note');

$total = (int)$pdo->query('SELECT COUNT(*) FROM `licenses`')->fetchColumn();
$expired = $expiring = 0;
if ($hasExpired) {
    $expired  = (int)$pdo->query("SELECT COUNT(*) FROM `licenses` WHERE expired IS NOT NULL AND expired<>'' AND expired < CURDATE()")->fetchColumn();
    $expiring = (int)$pdo->query("SELECT COUNT(*) FROM `licenses` WHERE expired IS NOT NULL AND expired<>'' AND expired >= CURDATE() AND DATEDIFF(expired,CURDATE())<=7")->fetchColumn();
}
$valid = $total - $expired;

$sel = ['id', '`key`'];
foreach (['hwid' => $hasHwid, 'expired' => $hasExpired, 'note' => $hasNote, 'last_seen' => $hasSeen, 'last_ip' => $hasIp] as $c => $ok) if ($ok) $sel[] = "`$c`";
$rows = $pdo->query('SELECT ' . implode(',', $sel) . ' FROM `licenses` ORDER BY id DESC LIMIT 12')->fetchAll(PDO::FETCH_ASSOC);

$NAV_ACTIVE = 'dashboard';
$PAGE_TITLE = 'Tổng quan';
require __DIR__ . '/partials/header.php';
?>
<div class="page-head">
    <div><h1>Tổng quan</h1><p>Quản lý bản quyền Kenzious Reel · dùng chung DB với Manager</p></div>
    <a class="btn primary" href="create.php"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> Tạo key</a>
</div>

<div class="stats">
    <div class="stat"><span>Tổng key</span><b><?= number_format($total) ?></b></div>
    <div class="stat"><span>Còn hạn</span><b><?= number_format($valid) ?></b></div>
    <div class="stat"><span>Sắp hết hạn (≤7 ngày)</span><b><?= number_format($expiring) ?></b></div>
    <div class="stat"><span>Hết hạn</span><b><?= number_format($expired) ?></b></div>
</div>

<div class="panel">
    <div class="panel-head responsive-head">
        <div><h2>Key gần đây</h2><p>12 key mới nhất</p></div>
        <a class="btn" href="licenses.php">Xem tất cả →</a>
    </div>
    <div class="table-wrap gon">
        <table>
            <thead><tr>
                <th>#</th><th>Key</th><?php if ($hasHwid): ?><th>Máy</th><?php endif; ?>
                <?php if ($hasExpired): ?><th>Trạng thái</th><?php endif; ?>
                <?php if ($hasNote): ?><th>Ghi chú</th><?php endif; ?>
                <?php if ($hasSeen): ?><th>Online gần nhất</th><?php endif; ?>
            </tr></thead>
            <tbody>
            <?php foreach ($rows as $r): [$sk, $bc] = license_status($r); ?>
                <tr>
                    <td><?= e($r['id']) ?></td>
                    <td class="cell-copy"><span class="mono"><?= e($r['key']) ?></span><button class="btn copy-btn" data-copy="<?= e($r['key']) ?>" title="Copy">⧉</button></td>
                    <?php if ($hasHwid): ?><td><?= trim((string)($r['hwid'] ?? '')) !== '' ? '<span class="mono">' . e($r['hwid']) . '</span>' : '<span class="badge muted">chưa bind</span>' ?></td><?php endif; ?>
                    <?php if ($hasExpired): ?><td><span class="badge <?= $bc ?>"><?= e(status_label($sk)) ?></span> <span class="sub"><?= e($r['expired'] ?? '') ?></span></td><?php endif; ?>
                    <?php if ($hasNote): ?><td><?= e($r['note'] ?? '') ?></td><?php endif; ?>
                    <?php if ($hasSeen): ?><td class="sub"><?= e($r['last_seen'] ?? '') ?></td><?php endif; ?>
                </tr>
            <?php endforeach; if (!$rows): ?><tr><td colspan="6"><div class="empty">Chưa có key nào. Bấm "Tạo key".</div></td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php require __DIR__ . '/partials/footer.php'; ?>
