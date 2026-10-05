$dest = "dist\Kenzious-Reel-v2-Portable.zip"
if (Test-Path $dest) {
    Remove-Item -Force $dest
}

# Dam bao khong sot du lieu ca nhan, tai khoan, cookie hay key trong thu muc dong goi
$unpackedData = "dist\win-unpacked\resources\data"
if (Test-Path $unpackedData) {
    $cleanFiles = @("license.dat", "accounts.json", "post_history.json", "publish_queue.json", "cookies.json", "auth_cookies.json", "destinations_store.json", "publisher_data.json")
    foreach ($f in $cleanFiles) {
        $target = Join-Path $unpackedData $f
        if (Test-Path $target) { Remove-Item -Force $target }
    }
}

Write-Host "Dang nen thu muc dist\win-unpacked thanh $dest bang tar..." -ForegroundColor Cyan
& tar.exe -a -c -f $dest -C "dist\win-unpacked" *
if (Test-Path $dest) {
    $sizeMb = [math]::Round((Get-Item $dest).Length / 1MB, 2)
    Write-Host "-> Da nen thanh cong! File: $dest ($sizeMb MB)" -ForegroundColor Green
} else {
    Write-Error "Nen that bai!"
}
