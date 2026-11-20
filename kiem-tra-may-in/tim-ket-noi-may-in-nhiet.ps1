<#
  TÌM & KẾT NỐI MÁY IN NHIỆT (máy in hoá đơn) – An Tâm
  Chạy bằng: TimKetNoiMayInNhiet.bat  (tự xin quyền Administrator)

  Việc script làm:
    1. Bật lại dịch vụ in Print Spooler nếu đang tắt.
    2. Tìm máy in hoá đơn đã cài:
       - tắt chế độ "Use Printer Offline", xoá lệnh in bị lỗi/kẹt
       - nếu máy in USB bị cắm sang cổng USB khác -> chuyển máy in sang cổng mới
       - nếu máy in LAN bị đổi địa chỉ IP -> tìm IP mới trong mạng và cập nhật
    3. Nếu chưa cài: tìm máy in nhiệt đang cắm USB hoặc trong mạng LAN (cổng 9100)
       và tự thêm máy in vào Windows.
    4. In thử 1 tờ (hỏi trước).
#>
param([switch]$KhongHoi)

# ============================ CẤU HÌNH ============================
$TenMayInHoaDon = ""                  # tên máy in hoá đơn nếu đã biết, có thể dùng * ; để "" = tự nhận diện
$TenMayInMoi    = "May in hoa don"    # tên đặt cho máy in khi script phải thêm mới
# ==================================================================

$MauTem = '(?i)label|\btem\b|nh[aã]n|barcode|m[aã] v[aạ]ch|zebra|\bz[dt]\d|\bg[kx]4\d|godex|\bg5[03]0\b|\bdt[24]\d|\btsc\b|ttp-|\bte[23]\d0|\bql-\d|dymo|xp-?(3\d\d|4\d\d|d\d|tt\d|dt\d|h\d)|\bht3\d0|gp-?(1\d{3}|3\d{3}|9\d{3})'
$MauHoaDon = '(?i)receipt|ipos|\bitp-?\d|h(o[aá]|ó[aá]?)\s*[dđ][oơ]n|\bpos\b|pos-?(58|80)|xp-?(58|76|80|a\d|c\d|e\d|k\d|n\d|q\d|t\d|v\d)|\bk(58|80)\b|\btm-?[tmhu]\d|\brp-?(58|80|3\d\d)|rongta|bixolon|\bsrp-|\btsp\d|\bct-s\d|\btp-?(58|80|8\d\d)|sewoo|\b(58|80) ?mm\b|thermal|\b(58|80)c?\b'
$MauMayInVanPhong = '(?i)\bhp\b|hewlett|laserjet|officejet|deskjet|canon|brother|ricoh|kyocera|xerox|lexmark|konica|sharp|samsung|fuji|toshiba e-studio|epson (l|wf|et|xp)-?\d'

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$FileScript = $MyInvocation.MyCommand.Path

# ---------- Tự xin quyền Administrator ----------
$laAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $laAdmin) {
    Write-Host 'Cần quyền Administrator để cài / sửa máy in. Đang mở cửa sổ mới, hãy bấm "Yes"...' -ForegroundColor Yellow
    try {
        $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $ts = "-NoProfile -ExecutionPolicy Bypass -File `"$FileScript`""
        if ($KhongHoi) { $ts += ' -KhongHoi' }
        Start-Process -FilePath $psExe -Verb RunAs -ArgumentList $ts
    } catch { Write-Host 'Không được cấp quyền Administrator – dừng lại.' -ForegroundColor Red }
    exit 0
}

# ---------- Tiện ích ----------
function Buoc($t)  { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Tot($t)   { Write-Host "   [OK] $t" -ForegroundColor Green }
function Sua($t)   { Write-Host "   [ĐÃ SỬA] $t" -ForegroundColor Yellow }
function Loi($t)   { Write-Host "   [LỖI] $t" -ForegroundColor Red }
function TinB($t)  { Write-Host "   $t" }
function Hoi($cauHoi) {
    if ($KhongHoi) { return $false }
    $tl = Read-Host "   $cauHoi (C = có / K = không)"
    return ($tl -match '^\s*[cCyY]')
}
function Ket-Thuc($ma) {
    Write-Host ''
    if (-not $KhongHoi) { [void](Read-Host 'Nhấn Enter để đóng') }
    exit $ma
}

function Test-Tcp([string]$DiaChi, [int]$Cong, [int]$ChoMs = 1500) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect($DiaChi, $Cong, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($ChoMs, $false)) { return $false }
        $c.EndConnect($iar); return $c.Connected
    } catch { return $false } finally { $c.Close() }
}

# Hỏi trạng thái ESC/POS (DLE EOT 1). Máy in hoá đơn nhiệt trả về 1 byte.
function La-ESCPOS([string]$Ip, [int]$Cong = 9100) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect($Ip, $Cong, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(1500, $false)) { return $false }
        $c.EndConnect($iar)
        $s = $c.GetStream(); $s.ReadTimeout = 1200
        $s.Write([byte[]](0x10, 0x04, 0x01), 0, 3); $s.Flush()
        $buf = New-Object byte[] 8
        $n = $s.Read($buf, 0, 8)
        return ($n -ge 1 -and (($buf[0] -band 0x93) -eq 0x12))
    } catch { return $false } finally { $c.Close() }
}

function Lay-Tieu-De-Web([string]$Ip) {
    try {
        $r = Invoke-WebRequest -Uri "http://$Ip/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $t = ''
        if ($r.Content -match '<title>([^<]*)</title>') { $t = $Matches[1] }
        return "$t $($r.Headers['Server'])".Trim()
    } catch { return '' }
}

# Cổng USB001, USB002... -> @{ Insts = thiết bị USB; MoTa = tên máy in do máy in tự báo }
function Lay-Cong-USB {
    $map = @{}
    $goc = 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'
    if (-not (Test-Path -LiteralPath $goc)) { return $map }
    foreach ($k in Get-ChildItem -LiteralPath $goc -ErrorAction SilentlyContinue) {
        try {
            $inst = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction Stop).DeviceInstance
            $ts   = Get-ItemProperty -LiteralPath ($k.PSPath + '\#\Device Parameters') -ErrorAction Stop
            $base = $ts.'Base Name'; if (-not $base) { $base = 'USB' }
            if ($inst -and $null -ne $ts.'Port Number') {
                $cong = ('{0}{1:D3}' -f $base, [int]$ts.'Port Number').ToUpper()
                if (-not $map.ContainsKey($cong)) { $map[$cong] = @{ Insts = @(); MoTa = '' } }
                $map[$cong].Insts += [string]$inst
                if ($ts.'Port Description') { $map[$cong].MoTa = [string]$ts.'Port Description' }
            }
        } catch {}
    }
    return $map
}

function Chon-Driver {
    $ds = @(Get-PrinterDriver -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    $hop = $ds | Where-Object { $_ -match $MauHoaDon -and $_ -notmatch $MauTem } | Select-Object -First 1
    if ($hop) { return $hop }
    $chung = 'Generic / Text Only'
    if ($ds -notcontains $chung) { try { Add-PrinterDriver -Name $chung -ErrorAction Stop } catch {} }
    if (Get-PrinterDriver -Name $chung -ErrorAction SilentlyContinue) {
        Loi 'Chưa có driver của hãng máy in nhiệt – tạm dùng driver "Generic / Text Only" (chỉ in được chữ không dấu).'
        TinB '   Nên cài driver của hãng (VD: Xprinter driver) rồi chạy lại script này.'
        return $chung
    }
    return $null
}

function Them-May-In([string]$Cong, [string]$Ip) {
    $drv = Chon-Driver
    if (-not $drv) { Loi 'Không có driver nào để cài máy in. Hãy cài driver của hãng máy in rồi chạy lại.'; return $null }
    if ($Ip) {
        $Cong = "IP_$Ip"
        if (-not (Get-PrinterPort -Name $Cong -ErrorAction SilentlyContinue)) {
            Add-PrinterPort -Name $Cong -PrinterHostAddress $Ip -PortNumber 9100 -ErrorAction Stop
        }
    }
    $ten = $TenMayInMoi; $i = 2
    while (Get-Printer -Name $ten -ErrorAction SilentlyContinue) { $ten = "$TenMayInMoi $i"; $i++ }
    Add-Printer -Name $ten -DriverName $drv -PortName $Cong -ErrorAction Stop
    Sua "Đã thêm máy in `"$ten`" (driver: $drv, cổng: $Cong)"
    return $ten
}

function Doi-Cong([string]$Ten, [string]$Cong, [string]$Ip) {
    if ($Ip) {
        $Cong = "IP_$Ip"
        if (-not (Get-PrinterPort -Name $Cong -ErrorAction SilentlyContinue)) {
            Add-PrinterPort -Name $Cong -PrinterHostAddress $Ip -PortNumber 9100 -ErrorAction Stop
        }
    }
    Set-Printer -Name $Ten -PortName $Cong -ErrorAction Stop
    Sua "Đã chuyển máy in `"$Ten`" sang cổng $Cong"
}

function Quet-LAN([string[]]$BoQua) {
    $ketQua = @()
    $ipMay = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
        $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' })
    foreach ($a in $ipMay) {
        $dau = ($a.IPAddress -split '\.')[0..2] -join '.'
        TinB "Đang quét mạng $dau.1 - $dau.254 (cổng 9100)..."
        $ds = foreach ($i in 1..254) {
            $ip = "$dau.$i"
            if ($ip -eq $a.IPAddress) { continue }
            $c = New-Object System.Net.Sockets.TcpClient
            try { [pscustomobject]@{ Ip = $ip; C = $c; Ar = $c.BeginConnect($ip, 9100, $null, $null) } } catch { $c.Close() }
        }
        Start-Sleep -Milliseconds 1500
        $mo = @(foreach ($x in $ds) { if ($x.Ar.IsCompleted -and $x.C.Connected) { $x.Ip }; try { $x.C.Close() } catch {} })
        foreach ($ip in $mo) {
            if ($BoQua -contains $ip) { continue }
            $web = Lay-Tieu-De-Web $ip
            if ($web -match $MauMayInVanPhong) { TinB "- $ip : máy in văn phòng ($web) – bỏ qua"; continue }
            if ($web -match $MauTem) { TinB "- $ip : máy in tem ($web) – bỏ qua"; continue }
            $escpos = La-ESCPOS $ip
            $mt = if ($escpos) { 'máy in hoá đơn nhiệt (ESC/POS)' } else { 'thiết bị in chưa rõ loại' }
            if ($web) { $mt += " – $web" }
            TinB "- $ip : $mt"
            $ketQua += [pscustomobject]@{ Ip = $ip; ChacChan = $escpos; MoTa = $mt }
        }
    }
    return @($ketQua | Sort-Object -Property @{ Expression = 'ChacChan'; Descending = $true })
}

# ============================ BẮT ĐẦU ============================
Write-Host 'TÌM & KẾT NỐI MÁY IN HOÁ ĐƠN (MÁY IN NHIỆT)' -ForegroundColor White
if (-not (Get-Command Get-Printer -ErrorAction SilentlyContinue)) {
    Loi 'Windows này quá cũ (cần Windows 8/10/11).'; Ket-Thuc 1
}

# 1. Print Spooler
Buoc '1. Dịch vụ in của Windows (Print Spooler)'
try {
    $sp = Get-Service -Name Spooler -ErrorAction Stop
    if ($sp.StartType -eq 'Disabled') { Set-Service -Name Spooler -StartupType Automatic; Sua 'Đã bật lại chế độ tự khởi động' }
    if ($sp.Status -ne 'Running') { Start-Service -Name Spooler; Start-Sleep 2; Sua 'Đã khởi động Print Spooler' }
    else { Tot 'Đang chạy' }
} catch { Loi "Không khởi động được Print Spooler: $($_.Exception.Message)"; Ket-Thuc 1 }

# 2. Thu thập thông tin
$w32     = @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue)
$congUsb = Lay-Cong-USB
$coMat   = @{}; foreach ($d in Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue) { if ($d.DeviceID) { $coMat[([string]$d.DeviceID).ToUpper()] = 1 } }
$tcp     = @{}; foreach ($t in Get-CimInstance Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue) { $tcp[([string]$t.Name).ToUpper()] = $t }
$usbDangCam = @($congUsb.Keys | Where-Object { @($congUsb[$_].Insts | Where-Object { $coMat.ContainsKey($_.ToUpper()) }).Count -gt 0 } | Sort-Object)

$hangNhiet = @($w32 | Where-Object {
    if ($TenMayInHoaDon) { $_.Name -like $TenMayInHoaDon }
    else { $s = "$($_.Name) $($_.DriverName)"; ($s -match $MauHoaDon) -and ($s -notmatch $MauTem) -and ($s -notmatch $MauMayInVanPhong) }
})
$congDangDung = @($w32 | ForEach-Object { ([string]$_.PortName).ToUpper() })

Buoc '2. Thiết bị máy in đang cắm USB'
if ($usbDangCam.Count -eq 0) { TinB '(không có)' }
foreach ($c in $usbDangCam) {
    $q = @($w32 | Where-Object { ([string]$_.PortName).ToUpper() -eq $c } | ForEach-Object { $_.Name })
    $dung = if ($q.Count) { "đang dùng bởi: $($q -join ', ')" } else { 'CHƯA có máy in nào trong Windows dùng cổng này' }
    TinB "- $c : $($congUsb[$c].MoTa)  ($dung)"
}

# Thiết bị đang cắm nhưng CHƯA có driver / bị lỗi driver
$chuaDriver = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object {
    $_.ConfigManagerErrorCode -and [int]$_.ConfigManagerErrorCode -ne 0 -and
    ("$($_.PNPClass) $($_.Name) $($_.DeviceID)" -match '(?i)printer|print|usbprint|pos|label|xprinter|unknown|không xác định|ch340|usb serial|usb-serial') })
foreach ($d in $chuaDriver) {
    Loi "Thiết bị `"$($d.Name)`" đang cắm nhưng lỗi/chưa có driver (mã $($d.ConfigManagerErrorCode)) – cần cài driver của hãng máy in"
}
$comUsb = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)(ch340|ch341|usb.?serial|prolific|cp210).*\(COM\d+\)' })
foreach ($d in $comUsb) { TinB "- Có thiết bị cổng COM qua USB: $($d.Name) – có thể là máy in nối bằng dây Serial/COM" }

# 3. Kiểm tra / sửa máy in hoá đơn đã cài
Buoc '3. Máy in hoá đơn đã cài trong Windows'
$tenOk = $null; $canSua = @()
if ($hangNhiet.Count -eq 0) { TinB 'Chưa thấy máy in hoá đơn nào được cài.' }
foreach ($p in $hangNhiet) {
    $ten = $p.Name; $cong = ([string]$p.PortName).ToUpper().TrimEnd(':')
    TinB "* $ten  (cổng $($p.PortName), driver $($p.DriverName))"
    if ($p.WorkOffline) {
        try { $p | Set-CimInstance -Property @{ WorkOffline = $false } -ErrorAction Stop; Sua 'Đã tắt chế độ "Use Printer Offline"' } catch {}
    }
    try {
        $ket = @(Get-PrintJob -PrinterName $ten -ErrorAction Stop | Where-Object { "$($_.JobStatus)" -match 'Error|Offline|Blocked' })
        if ($ket.Count) { $ket | Remove-PrintJob -ErrorAction SilentlyContinue; Sua "Đã xoá $($ket.Count) lệnh in bị kẹt" }
    } catch {}

    if ($cong -match '^USB\d+$') {
        if ($usbDangCam -contains $cong) { Tot "Đang kết nối qua USB ($cong)"; if (-not $tenOk) { $tenOk = $ten } }
        else { Loi "Không thấy máy in trên cổng $cong"; $canSua += [pscustomobject]@{ Ten = $ten; Kieu = 'USB' } }
    }
    elseif ($tcp.ContainsKey($cong)) {
        $ip = [string]$tcp[$cong].HostAddress
        $so = if ($tcp[$cong].PortNumber) { [int]$tcp[$cong].PortNumber } else { 9100 }
        if (Test-Tcp $ip $so 2000) { Tot "Đang kết nối qua mạng LAN ($ip)"; if (-not $tenOk) { $tenOk = $ten } }
        else { Loi "Không kết nối được tới $ip"; $canSua += [pscustomobject]@{ Ten = $ten; Kieu = 'LAN' } }
    }
    else { TinB "  Cổng $($p.PortName): script không tự kiểm tra được loại cổng này." }
}

# Máy in nhiệt đang cắm USB nhưng được cài dưới một tên script không nhận ra
if (-not $tenOk) {
    foreach ($c in $usbDangCam) {
        if ($congUsb[$c].MoTa -match $MauHoaDon -and $congUsb[$c].MoTa -notmatch $MauTem) {
            $q = $w32 | Where-Object { ([string]$_.PortName).ToUpper() -eq $c } | Select-Object -First 1
            if ($q) {
                Tot "Máy in nhiệt $($congUsb[$c].MoTa) đang kết nối ($c) – trong Windows tên là `"$($q.Name)`""
                if ($q.WorkOffline) { try { $q | Set-CimInstance -Property @{ WorkOffline = $false } -ErrorAction Stop; Sua 'Đã tắt "Use Printer Offline"' } catch {} }
                $tenOk = $q.Name; break
            }
        }
    }
}

# 4. Tìm máy in nhiệt mới (USB / LAN) nếu cần
if (-not $tenOk) {
    Buoc '4. Tìm máy in nhiệt đang cắm USB'
    $usbMoi = @($usbDangCam | Where-Object {
        $moTa = $congUsb[$_].MoTa
        ($congDangDung -notcontains $_) -and ($moTa -notmatch $MauTem) -and ($moTa -notmatch $MauMayInVanPhong)
    } | Sort-Object { if ($congUsb[$_].MoTa -match $MauHoaDon) { 0 } else { 1 } })

    $chonUsb = $null
    foreach ($c in $usbMoi) {
        $moTa = $congUsb[$c].MoTa
        if ($moTa -match $MauHoaDon) { TinB "Tìm thấy máy in nhiệt: $moTa ($c)"; $chonUsb = $c; break }
        if (Hoi "Thiết bị in USB `"$moTa`" ($c) chưa rõ loại. Đây có phải máy in hoá đơn không?") { $chonUsb = $c; break }
    }
    if (-not $chonUsb -and $usbMoi.Count -eq 0) { TinB 'Không thấy máy in nhiệt mới cắm USB.' }

    if ($chonUsb) {
        try {
            $suaUsb = $canSua | Where-Object { $_.Kieu -eq 'USB' } | Select-Object -First 1
            if (-not $suaUsb) { $suaUsb = $canSua | Select-Object -First 1 }
            if ($suaUsb) { Doi-Cong $suaUsb.Ten $chonUsb $null; $tenOk = $suaUsb.Ten }
            else { $tenOk = Them-May-In $chonUsb $null }
        } catch { Loi "Không cài được: $($_.Exception.Message)" }
    }

    if (-not $tenOk) {
        Buoc '5. Tìm máy in nhiệt trong mạng LAN'
        $ipDaDung = @($w32 | ForEach-Object { $c = ([string]$_.PortName).ToUpper(); if ($tcp.ContainsKey($c)) { [string]$tcp[$c].HostAddress } })
        # IP của máy in hoá đơn đang lỗi không bỏ qua (có thể chính nó)
        $lan = Quet-LAN $ipDaDung
        $chon = $lan | Where-Object { $_.ChacChan } | Select-Object -First 1
        if (-not $chon) {
            foreach ($x in $lan) { if (Hoi "Thiết bị $($x.Ip) ($($x.MoTa)) có phải máy in hoá đơn không?") { $chon = $x; break } }
        }
        if ($chon) {
            try {
                $suaLan = $canSua | Where-Object { $_.Kieu -eq 'LAN' } | Select-Object -First 1
                if (-not $suaLan) { $suaLan = $canSua | Select-Object -First 1 }
                if ($suaLan) { Doi-Cong $suaLan.Ten $null $chon.Ip; $tenOk = $suaLan.Ten }
                else { $tenOk = Them-May-In $null $chon.Ip }
            } catch { Loi "Không cài được: $($_.Exception.Message)" }
        } elseif ($lan.Count -eq 0) { TinB 'Không tìm thấy máy in nhiệt nào trong mạng LAN.' }
    }
}

# 6. Kết quả
Buoc 'KẾT QUẢ'
if (-not $tenOk) {
    Loi 'KHÔNG tìm thấy máy in hoá đơn đang kết nối.'
    TinB 'Hãy kiểm tra:'
    TinB ' - Máy in đã bật nguồn (đèn sáng), có giấy, đóng nắp.'
    TinB ' - Cáp USB cắm chắc 2 đầu; thử đổi sang lỗ USB khác hoặc dây khác.'
    TinB ' - Máy in LAN: dây mạng cắm vào cùng modem/switch với máy tính.'
    TinB ' - Máy in kết nối USB nhưng Windows hiện thành cổng COM (CH340...): cần cài driver của hãng.'
    TinB 'Sau đó chạy lại TimKetNoiMayInNhiet.bat.'
    Ket-Thuc 1
}
Tot "Máy in hoá đơn sẵn sàng: $tenOk"
if (Hoi 'In thử 1 tờ?') {
    try {
        $noiDung = @('AN TAM', 'IN THU MAY IN HOA DON', (Get-Date).ToString('dd/MM/yyyy HH:mm'), "May in: $tenOk", '--------------------------------', 'Ket noi thanh cong!', '', '', '')
        $noiDung | Out-Printer -Name $tenOk
        Tot 'Đã gửi lệnh in thử.'
    } catch { Loi "In thử thất bại: $($_.Exception.Message)" }
}
Ket-Thuc 0
