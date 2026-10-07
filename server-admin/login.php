<?php
declare(strict_types=1);
require_once __DIR__ . '/functions.php';

if (is_logged_in()) redirect('index.php');

$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $pass = (string)($_POST['pass'] ?? '');
    if (password_verify($pass, admin_pass_hash())) {
        session_regenerate_id(true);
        $_SESSION['admin_ok'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        redirect('index.php');
    }
    usleep(600000);
    $err = 'Sai mật khẩu.';
}
?>
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đăng nhập · <?= e(APP_NAME) ?></title>
<link rel="icon" href="assets/favicon.png" sizes="any">
<link rel="stylesheet" href="assets/style.css">
</head>
<body class="auth-page">
<form class="auth-card" method="post">
    <div class="brand">
        <div class="brand-mark has-logo" style="width:46px;height:46px;border-radius:13px"><img src="assets/logo.png" alt="" width="46" height="46" style="width:100%;height:100%;object-fit:contain"></div>
        <div>
            <h1>Kenzious Admin</h1>
            <p>Quản lý bản quyền Kenzious Reel</p>
        </div>
    </div>
    <?php if ($err): ?><div class="alert danger"><?= e($err) ?></div><?php endif; ?>
    <label>Mật khẩu admin</label>
    <input class="input" type="password" name="pass" autofocus autocomplete="current-password">
    <button class="btn primary full" type="submit">Đăng nhập</button>
</form>
</body>
</html>
