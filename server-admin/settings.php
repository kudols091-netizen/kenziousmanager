<?php
declare(strict_types=1);
require_once __DIR__ . '/functions.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $cur = (string)($_POST['current'] ?? '');
    $new = (string)($_POST['new'] ?? '');
    $rep = (string)($_POST['repeat'] ?? '');
    if (!password_verify($cur, admin_pass_hash())) flash('danger', 'Mật khẩu hiện tại sai.');
    elseif (strlen($new) < 8) flash('danger', 'Mật khẩu mới phải từ 8 ký tự.');
    elseif ($new !== $rep) flash('danger', 'Nhập lại mật khẩu không khớp.');
    elseif (!admin_pass_save($new)) flash('danger', 'Không ghi được mật khẩu (quyền thư mục?).');
    else flash('success', 'Đã đổi mật khẩu admin.');
    redirect('settings.php');
}

$dbName = defined('DB_DATABASE') ? DB_DATABASE : '(không rõ)';
$NAV_ACTIVE = 'settings';
$PAGE_TITLE = 'Cài đặt';
require __DIR__ . '/partials/header.php';
?>
<div class="page-head"><div><h1>Cài đặt</h1><p>Tài khoản admin &amp; thông tin hệ thống</p></div></div>

<div class="grid-2">
    <div class="panel create-panel">
        <div class="panel-head"><h2>Đổi mật khẩu admin</h2></div>
        <form method="post">
            <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
            <label>Mật khẩu hiện tại</label>
            <input class="input" type="password" name="current" autocomplete="current-password">
            <label>Mật khẩu mới <small>(≥ 8 ký tự)</small></label>
            <input class="input" type="password" name="new" autocomplete="new-password">
            <label>Nhập lại mật khẩu mới</label>
            <input class="input" type="password" name="repeat" autocomplete="new-password">
            <button class="btn primary full" type="submit">Đổi mật khẩu</button>
        </form>
    </div>

    <div class="panel create-panel">
        <div class="panel-head"><h2>Hệ thống</h2></div>
        <table class="kv">
            <tr><td>Database</td><td><code><?= e($dbName) ?></code></td></tr>
            <tr><td>Bảng key</td><td><code>licenses</code></td></tr>
            <tr><td>API xác thực</td><td><code>virals.kenzious.com/api/license</code></td></tr>
            <tr><td>PHP</td><td><?= e(PHP_VERSION) ?></td></tr>
        </table>
        <div class="alert warn" style="margin-top:16px">Key ở đây dùng chung cho cả <b>Kenzious Reel</b> và <b>Kenzious Manager</b> (cùng bảng <code>licenses</code>).</div>
    </div>
</div>
<?php require __DIR__ . '/partials/footer.php'; ?>
