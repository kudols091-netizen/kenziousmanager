<?php
/**
 * Kenzious Admin — cấu hình.
 * Dùng lại $pdo của virals.kenzious.com (cùng DB `pinkagcc_kenzi_reel`, bảng `licenses`)
 * để KHÔNG nhân đôi mật khẩu DB. Nếu open_basedir chặn, sửa $KENZI_CONFIG cho đúng.
 */
declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) session_start();

const APP_NAME = 'Kenzious Admin';

// ===== Mật khẩu admin mặc định (đổi ở trang Cài đặt sẽ ghi đè vào _adminpass.php) =====
const ADMIN_PASS_DEFAULT = 'KzAdm-CjEqw7zrNLOM';

$KENZI_CONFIG = '/home/pinkagcc/virals.kenzious.com/config.php';
if (is_file($KENZI_CONFIG)) {
    require_once $KENZI_CONFIG;            // tạo $pdo (DB Kenzi)
}
if (!isset($pdo) || !($pdo instanceof PDO)) {
    http_response_code(500);
    exit('Không kết nối được DB Kenzi. Kiểm tra $KENZI_CONFIG trong config.php (open_basedir?).');
}
$GLOBALS['__kenzi_pdo'] = $pdo;

function db(): PDO { return $GLOBALS['__kenzi_pdo']; }

/** Hash mật khẩu admin hiện tại: ưu tiên _adminpass.php (do trang Cài đặt ghi), fallback mặc định. */
function admin_pass_hash(): string {
    $f = __DIR__ . '/_adminpass.php';
    if (is_file($f)) { $h = include $f; if (is_string($h) && $h !== '') return $h; }
    return password_hash(ADMIN_PASS_DEFAULT, PASSWORD_DEFAULT);
}
function admin_pass_save(string $plain): bool {
    $h = password_hash($plain, PASSWORD_DEFAULT);
    return (bool) file_put_contents(__DIR__ . '/_adminpass.php', "<?php return " . var_export($h, true) . ";\n");
}
