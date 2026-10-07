<?php
declare(strict_types=1);
if (!function_exists('nav_items')) require_once __DIR__ . '/../functions.php';
require_login();

$NAV_ACTIVE = $NAV_ACTIVE ?? '';
$PAGE_TITLE = $PAGE_TITLE ?? APP_NAME;

$expiringSoon = 0;
try {
    if (has_lic('expired')) {
        $expiringSoon = (int) db()->query(
            "SELECT COUNT(*) FROM `licenses` WHERE expired IS NOT NULL AND expired <> '' AND expired >= CURDATE() AND DATEDIFF(expired, CURDATE()) <= 7"
        )->fetchColumn();
    }
} catch (Throwable $e) {}
$flash = get_flash();
?>
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= e($PAGE_TITLE) ?> · <?= e(APP_NAME) ?></title>
<script>(function(){try{if(localStorage.getItem('kenzious-theme')==='sang')document.documentElement.setAttribute('data-theme','sang');}catch(e){}})();</script>
<link rel="icon" href="assets/favicon.png" sizes="any">
<link rel="stylesheet" href="assets/style.css?v=<?= @filemtime(__DIR__ . '/../assets/style.css') ?: time() ?>">
</head>
<body>
<header class="topbar">
    <div class="topbar-inner">
        <div class="brand-inline">
            <button class="nav-toggle" id="navToggle" aria-label="Menu" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <div class="brand-mark has-logo"><img src="assets/logo.png" alt="Kenzious" width="38" height="38"></div>
            <strong>Kenzious</strong>
        </div>
        <div class="user-menu">
            <button type="button" class="theme-btn" id="themeBtn" title="Chuyển Tối / Sáng" aria-label="Chuyển Tối / Sáng">
                <svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/></svg>
                <svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            </button>
            <span class="role-chip admin">Quản trị</span>
            <span class="uname">admin</span>
            <a href="logout.php">Đăng xuất</a>
        </div>
    </div>
</header>
<div class="layout">
    <div class="nav-overlay" id="navOverlay"></div>
    <aside class="sidebar" id="sidebar">
        <nav class="nav">
            <div class="nav-section">Quản lý</div>
            <?php foreach (nav_items() as $key => [$href, $label, $icon]): ?>
                <a href="<?= e($href) ?>" class="<?= $NAV_ACTIVE === $key ? 'active' : '' ?>">
                    <?= nav_icon($icon) ?>
                    <span><?= e($label) ?></span>
                    <?php if ($key === 'licenses' && $expiringSoon > 0): ?><span class="badge warning"><?= $expiringSoon ?></span><?php endif; ?>
                </a>
            <?php endforeach; ?>
        </nav>
        <div class="sidebar-foot"><span>Kenzious Reel · Admin</span></div>
    </aside>
    <main class="content">
        <div class="container">
            <?php if ($flash): ?><div class="alert <?= e($flash['type']) ?>"><?= e($flash['message']) ?></div><?php endif; ?>
