<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';

function e(int|string|null $v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function redirect(string $url): never { header('Location: ' . $url); exit; }

/* ---------- Auth (1 tài khoản admin, mật khẩu) ---------- */
function is_logged_in(): bool { return !empty($_SESSION['admin_ok']); }
function require_login(): void { if (!is_logged_in()) redirect('login.php'); }
function current_user(): string { return 'admin'; }

/* ---------- CSRF ---------- */
function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function verify_csrf(): void {
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) { http_response_code(419); exit('CSRF'); }
}

/* ---------- Flash ---------- */
function flash(string $type, string $message): void { $_SESSION['flash'] = ['type' => $type, 'message' => $message]; }
function get_flash(): ?array { $f = $_SESSION['flash'] ?? null; unset($_SESSION['flash']); return $f; }

/* ---------- Schema an toàn (chạy được với mọi cột thực tế) ---------- */
function table_columns(string $table): array {
    static $cache = [];
    if (!isset($cache[$table])) {
        try { $cache[$table] = array_column(db()->query('SHOW COLUMNS FROM `' . str_replace('`', '', $table) . '`')->fetchAll(PDO::FETCH_ASSOC), 'Field'); }
        catch (Throwable $e) { $cache[$table] = []; }
    }
    return $cache[$table];
}
function has_col(string $table, string $name): bool { return in_array($name, table_columns($table), true); }
function has_lic(string $name): bool { return has_col('licenses', $name); }
function col(array $row, string $key): string { return isset($row[$key]) ? (string)$row[$key] : ''; }

/* ---------- License helpers ---------- */
function gen_key(): string {
    $a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $g = '';
    for ($i = 0; $i < 15; $i++) { if ($i && $i % 5 === 0) $g .= '-'; $g .= $a[random_int(0, strlen($a) - 1)]; }
    return 'KZ-' . $g;
}
function valid_date(string $d): bool { $x = DateTime::createFromFormat('Y-m-d', $d); return $x !== false && $x->format('Y-m-d') === $d; }
/** '' hoặc NULL = vĩnh viễn. Số ngày còn lại (âm = đã hết hạn). */
function days_left(?string $expired): ?int {
    $expired = trim((string)$expired);
    if ($expired === '' || str_starts_with($expired, '0000')) return null; // lifetime
    $exp = DateTime::createFromFormat('Y-m-d', substr($expired, 0, 10));
    if ($exp === false) return null;
    $exp->setTime(0, 0, 0);
    return (int)(new DateTime('today'))->diff($exp)->format('%r%a');
}
/** [key_trạng_thái, badge_class, số_ngày|null] */
function license_status(array $lic, int $soon = 7): array {
    $left = days_left($lic['expired'] ?? '');
    $bound = trim((string)($lic['hwid'] ?? '')) !== '';
    if ($left === null) return ['lifetime', 'info', null];
    if ($left < 0) return ['expired', 'danger', $left];
    if ($left <= $soon) return ['expiring', 'warning', $left];
    if (!$bound) return ['unbound', 'muted', $left];
    return ['active', 'success', $left];
}
function status_label(string $k): string {
    return ['lifetime' => 'Vĩnh viễn', 'expired' => 'Hết hạn', 'expiring' => 'Sắp hết hạn', 'unbound' => 'Chưa bind', 'active' => 'Còn hạn'][$k] ?? $k;
}

/* ---------- Sidebar ---------- */
function nav_items(): array {
    return [
        'dashboard' => ['index.php',    'Tổng quan',       'grid'],
        'create'    => ['create.php',   'Tạo key',         'plus'],
        'licenses'  => ['licenses.php', 'Quản lý license', 'key'],
        'settings'  => ['settings.php', 'Cài đặt',         'gear'],
    ];
}
function nav_icon(string $name): string {
    $p = [
        'grid' => '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        'plus' => '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
        'key'  => '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5 20 3M17 6l2 2M14 9l2 2"/>',
        'gear' => '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    ];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' . ($p[$name] ?? '') . '</svg>';
}
