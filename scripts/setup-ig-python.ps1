# Dung Python nhung (embeddable) cho Kenzious-Instagram server tai bin\python
# -> may nguoi dung KHONG can cai Python. Chay lai khi doi phien ban thu vien.
# Cach dung: powershell -ExecutionPolicy Bypass -File scripts\setup-ig-python.ps1
$ErrorActionPreference = 'Stop'
$PyVersion = '3.12.10'
$Root = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Root 'bin\python'
$Requirements = Join-Path (Split-Path -Parent $Root) 'Kenzious-instagram\requirements.txt'

if (-not (Test-Path $Requirements)) { throw "Khong thay $Requirements" }
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Force $Dest | Out-Null

$tmp = Join-Path $env:TEMP "kz-python-$PyVersion"
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp 'python-embed.zip'
Write-Host "[1/3] Tai Python $PyVersion embeddable..."
Invoke-WebRequest "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" -OutFile $zip -UseBasicParsing
Expand-Archive $zip -DestinationPath $Dest -Force

# Ban embed mac dinh tat site-packages -> bat lai de pip cai thu vien duoc
$pth = Get-ChildItem $Dest -Filter 'python*._pth' | Select-Object -First 1
(Get-Content $pth.FullName) -replace '^#\s*import site', 'import site' | Set-Content $pth.FullName -Encoding ascii
Add-Content $pth.FullName 'Lib\site-packages' -Encoding ascii

Write-Host '[2/3] Cai pip...'
$getPip = Join-Path $tmp 'get-pip.py'
Invoke-WebRequest 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip -UseBasicParsing
& "$Dest\python.exe" $getPip --no-warn-script-location
if ($LASTEXITCODE) { throw 'Cai pip that bai' }

Write-Host '[3/3] Cai thu vien cho Kenzious-Instagram...'
& "$Dest\python.exe" -m pip install --no-warn-script-location -r $Requirements
if ($LASTEXITCODE) { throw 'Cai thu vien that bai' }

# Bo cache cho goi nhe hon
Get-ChildItem $Dest -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Write-Host "[XONG] Python nhung: $Dest"
