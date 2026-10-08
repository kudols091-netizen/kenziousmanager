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

/* ---------- Actions ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = $_POST['act'] ?? '';
    try {
        if ($act === 'delete') {
            $pdo->prepare('DELETE FROM `licenses` WHERE id=?')->execute([(int)$_POST['id']]);
            flash('success', 'Đã xoá (kill) key — máy đang dùng sẽ tắt ở lần kiểm kế tiếp.');
        } elseif ($act === 'bulkdelete') {
            $ids = array_values(array_filter(array_map('intval', (array)($_POST['ids'] ?? []))));
            if ($ids) { $pdo->prepare('DELETE FROM `licenses` WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')')->execute($ids); }
            flash('success', 'Đã xoá ' . count($ids) . ' key.');
        } elseif ($act === 'reset' && $hasHwid) {
            $pdo->prepare("UPDATE `licenses` SET hwid='' WHERE id=?")->execute([(int)$_POST['id']]);
            flash('success', 'Đã reset máy — key dùng được trên máy mới.');
        } elseif ($act === 'sethwid' && $hasHwid) {
            $hwid = strtoupper(trim((string)($_POST['hwid'] ?? '')));
            $pdo->prepare('UPDATE `licenses` SET hwid=? WHERE id=?')->execute([$hwid, (int)$_POST['id']]);
            flash('success', $hwid === '' ? 'Đã xoá máy (để trống).' : 'Đã lưu HWID: ' . $hwid);
        } elseif ($act === 'extend' && $hasExpired) {
            $id = (int)$_POST['id']; $days = (int)($_POST['days'] ?? 0);
            if ($days === -1) { $exp = ''; $msg = 'Đã đặt VĨNH VIỄN.'; }
            else {
                $cur = $pdo->prepare('SELECT expired FROM `licenses` WHERE id=?'); $cur->execute([$id]);
                $curExp = trim((string)$cur->fetchColumn());
                $base = ($curExp !== '' && $curExp >= date('Y-m-d')) ? strtotime($curExp) : time(); // còn hạn thì cộng dồn, hết hạn thì từ hôm nay
                $exp = date('Y-m-d', $base + $days * 86400); $msg = "Đã gia hạn tới $exp.";
            }
            $pdo->prepare('UPDATE `licenses` SET expired=? WHERE id=?')->execute([$exp, $id]);
            flash('success', $msg);
        }
    } catch (Throwable $ex) { flash('danger', 'Lỗi: ' . $ex->getMessage()); }
    redirect('licenses.php' . (!empty($_POST['q']) ? '?q=' . urlencode((string)$_POST['q']) : ''));
}

/* ---------- List + search ---------- */
$q = trim((string)($_GET['q'] ?? ''));
$page = max(1, (int)($_GET['p'] ?? 1)); $per = 50; $off = ($page - 1) * $per;

$where = ''; $args = [];
if ($q !== '') {
    $parts = ['`key` LIKE ?']; $args[] = "%$q%";
    if ($hasHwid) { $parts[] = 'hwid LIKE ?'; $args[] = "%$q%"; }
    if ($hasNote) { $parts[] = 'note LIKE ?'; $args[] = "%$q%"; }
    $where = 'WHERE ' . implode(' OR ', $parts);
}
$cnt = $pdo->prepare("SELECT COUNT(*) FROM `licenses` $where"); $cnt->execute($args);
$totalRows = (int)$cnt->fetchColumn(); $pages = max(1, (int)ceil($totalRows / $per));

$sel = ['id', '`key`'];
foreach (['hwid' => $hasHwid, 'expired' => $hasExpired, 'note' => $hasNote, 'last_seen' => $hasSeen, 'last_ip' => $hasIp] as $c => $ok) if ($ok) $sel[] = "`$c`";
$st = $pdo->prepare('SELECT ' . implode(',', $sel) . " FROM `licenses` $where ORDER BY id DESC LIMIT $per OFFSET $off");
$st->execute($args);
$rows = $st->fetchAll(PDO::FETCH_ASSOC);

$csrf = csrf_token();
$NAV_ACTIVE = 'licenses';
$PAGE_TITLE = 'Quản lý license';
require __DIR__ . '/partials/header.php';
?>
<div class="page-head"><div><h1>Quản lý license</h1><p><?= number_format($totalRows) ?> key<?= $q !== '' ? ' khớp "' . e($q) . '"' : '' ?></p></div>
    <a class="btn primary" href="create.php">+ Tạo key</a>
</div>

<div class="panel">
    <div class="toolbar">
        <form class="search" method="get" style="flex:1">
            <input class="input" name="q" value="<?= e($q) ?>" placeholder="Tìm key / máy / ghi chú…">
            <button class="btn" type="submit">Tìm</button>
            <?php if ($q !== ''): ?><a class="btn" href="licenses.php">Xoá lọc</a><?php endif; ?>
        </form>
        <div class="toolbar-actions">
            <span class="muted-text sub">Đã chọn <b id="bulkCount">0</b></span>
            <form method="post" class="inline" onsubmit="return confirm('Xoá (kill) các key đã chọn?')" id="bulkForm">
                <input type="hidden" name="csrf" value="<?= e($csrf) ?>"><input type="hidden" name="act" value="bulkdelete"><input type="hidden" name="q" value="<?= e($q) ?>">
                <button class="btn danger-btn" id="bulkDelBtn" disabled>Kill đã chọn</button>
            </form>
        </div>
    </div>
    <div class="table-wrap">
        <table>
            <thead><tr>
                <th class="chk-col"><input type="checkbox" id="checkAll"></th>
                <th>#</th><th>Key</th>
                <?php if ($hasHwid): ?><th>Máy (HWID)</th><?php endif; ?>
                <?php if ($hasExpired): ?><th>Trạng thái</th><?php endif; ?>
                <?php if ($hasNote): ?><th>Ghi chú</th><?php endif; ?>
                <?php if ($hasSeen): ?><th>Online gần nhất</th><?php endif; ?>
                <?php if ($hasIp): ?><th>IP</th><?php endif; ?>
                <th>Thao tác</th>
            </tr></thead>
            <tbody>
            <?php foreach ($rows as $r): [$sk, $bc, $left] = license_status($r); $bound = $hasHwid && trim((string)($r['hwid'] ?? '')) !== ''; ?>
                <tr>
                    <td class="chk-col"><input type="checkbox" class="rowchk" form="bulkForm" name="ids[]" value="<?= e($r['id']) ?>"></td>
                    <td><?= e($r['id']) ?></td>
                    <td class="cell-copy"><span class="mono"><?= e($r['key']) ?></span><button class="btn copy-btn" data-copy="<?= e($r['key']) ?>" title="Copy">⧉</button></td>
                    <?php if ($hasHwid): ?><td>
                        <form method="post" class="cell-copy" style="gap:4px">
                            <input type="hidden" name="csrf" value="<?= e($csrf) ?>"><input type="hidden" name="act" value="sethwid"><input type="hidden" name="id" value="<?= e($r['id']) ?>"><input type="hidden" name="q" value="<?= e($q) ?>">
                            <input class="table-input mono" name="hwid" value="<?= e($r['hwid'] ?? '') ?>" placeholder="KZ-XXXX-XXXX-XXXX-XXXX" style="max-width:220px">
                            <button class="btn small primary" type="submit" title="Lưu HWID" onclick="return confirm('Lưu HWID này cho key #<?= e($r['id']) ?>?\n(để trống = gỡ bind)')">💾 Lưu</button>
                        </form>
                        <?php if (!$bound): ?><span class="sub">chưa bind</span><?php endif; ?>
                    </td><?php endif; ?>
                    <?php if ($hasExpired): ?><td><span class="badge <?= $bc ?>"><?= e(status_label($sk)) ?></span><?php if ($left !== null): ?> <span class="sub"><?= $left < 0 ? 'quá ' . abs($left) . 'n' : 'còn ' . $left . 'n' ?></span><?php endif; ?><div class="sub"><?= e($r['expired'] ?? '') ?></div></td><?php endif; ?>
                    <?php if ($hasNote): ?><td><?= e($r['note'] ?? '') ?></td><?php endif; ?>
                    <?php if ($hasSeen): ?><td class="sub"><?= e($r['last_seen'] ?? '') ?></td><?php endif; ?>
                    <?php if ($hasIp): ?><td class="sub mono"><?= e($r['last_ip'] ?? '') ?></td><?php endif; ?>
                    <td><div class="actions">
                        <?php if ($hasExpired): ?>
                        <div class="ext">
                            <button type="button" class="btn small ext-toggle">Gia hạn ▾</button>
                            <div class="ext-menu">
                                <?php foreach ([30 => '+30 ngày', 90 => '+90 ngày', 180 => '+180 ngày', 365 => '+1 năm', -1 => 'Vĩnh viễn'] as $d => $lbl): ?>
                                <form method="post"><input type="hidden" name="csrf" value="<?= e($csrf) ?>"><input type="hidden" name="act" value="extend"><input type="hidden" name="id" value="<?= e($r['id']) ?>"><input type="hidden" name="days" value="<?= $d ?>"><input type="hidden" name="q" value="<?= e($q) ?>"><button class="ext-item" type="submit"><?= $lbl ?></button></form>
                                <?php endforeach; ?>
                            </div>
                        </div>
                        <?php endif; ?>
                        <?php if ($bound): ?>
                        <form method="post" class="inline" onsubmit="return confirm('Reset máy cho key này?')"><input type="hidden" name="csrf" value="<?= e($csrf) ?>"><input type="hidden" name="act" value="reset"><input type="hidden" name="id" value="<?= e($r['id']) ?>"><input type="hidden" name="q" value="<?= e($q) ?>"><button class="btn small" type="submit">Reset máy</button></form>
                        <?php endif; ?>
                        <form method="post" class="inline" onsubmit="return confirm('XOÁ (kill) key này? Máy đang dùng sẽ tắt.')"><input type="hidden" name="csrf" value="<?= e($csrf) ?>"><input type="hidden" name="act" value="delete"><input type="hidden" name="id" value="<?= e($r['id']) ?>"><input type="hidden" name="q" value="<?= e($q) ?>"><button class="btn small danger-btn" type="submit">Kill</button></form>
                    </div></td>
                </tr>
            <?php endforeach; if (!$rows): ?><tr><td colspan="9"><div class="empty">Không có key nào.</div></td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
    <?php if ($pages > 1): ?>
    <div class="pagination">
        <?php for ($i = max(1, $page - 2); $i <= min($pages, $page + 2); $i++): ?>
            <a class="btn small <?= $i === $page ? 'primary' : '' ?>" href="?<?= http_build_query(array_filter(['q' => $q, 'p' => $i])) ?>"><?= $i ?></a>
        <?php endfor; ?>
    </div>
    <?php endif; ?>
</div>
<?php require __DIR__ . '/partials/footer.php'; ?>
