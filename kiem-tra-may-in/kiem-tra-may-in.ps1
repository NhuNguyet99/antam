<#
  KIỂM TRA MÁY IN – An Tâm
  Tự động kiểm tra 2 máy in có đang kết nối với máy tính không:
    1) Máy in tem nhãn (mã vạch)
    2) Máy in hoá đơn (máy in nhiệt K80 / K58)

  Cách dùng (xem thêm HUONG-DAN.md):
    KiemTraMayIn.bat   – kiểm tra 1 lần, hiện kết quả
    CaiDatTuDong.bat   – tự kiểm tra mỗi khi bật máy và theo dõi liên tục,
                         báo ngay khi một máy in bị mất kết nối
    GoTuDong.bat       – tắt chế độ tự động
#>
[CmdletBinding()]
param(
    [switch]$Quiet,        # Chỉ hiện thông báo khi có máy in lỗi / mất kết nối
    [switch]$TheoDoi,      # Chạy nền, kiểm tra lặp lại mỗi $SoPhut phút
    [int]$SoPhut = 5,
    [int]$ChoGiay = 0,     # Chờ trước lần kiểm tra đầu (để Windows nhận USB khi vừa bật máy)
    [switch]$CaiDat,       # Tự chạy khi đăng nhập Windows (tạo lối tắt trong Startup)
    [switch]$GoCaiDat      # Bỏ tự chạy
)

# ============================ CẤU HÌNH ============================
# Nếu script nhận nhầm / không nhận ra máy in, điền đúng tên máy in như trong
# Settings > Printers & scanners (hoặc Control Panel > Devices and Printers).
# Có thể dùng dấu *, ví dụ: "*XP-365B*".  Để trống "" = tự nhận diện.
$TenMayInTem    = ""
$TenMayInHoaDon = ""
# ==================================================================

# Từ khoá nhận diện máy in tem nhãn (Xprinter XP-3xx/4xx, TSC, Zebra, Godex, Gprinter, Brother QL, ...)
$MauTem = '(?i)label|\btem\b|nh[aã]n|barcode|m[aã] v[aạ]ch|zebra|\bz[dt]\d|\bg[kx]4\d|godex|\bg5[03]0\b|\bdt[24]\d|\btsc\b|ttp-|\bte[23]\d0|\bql-\d|dymo|xp-?(3\d\d|4\d\d|d\d|tt\d|dt\d|h\d)|\bht3\d0|gp-?(1\d{3}|3\d{3}|9\d{3})'
# Từ khoá nhận diện máy in hoá đơn nhiệt (Xprinter XP-58/80/K/Q/N, Epson TM, Rongta, Bixolon, POS-80, K80...)
$MauHoaDon = '(?i)receipt|ipos|\bitp-?\d|h(o[aá]|ó[aá]?)\s*[dđ][oơ]n|\bpos\b|pos-?(58|80)|xp-?(58|76|80|a\d|c\d|e\d|k\d|n\d|q\d|t\d|v\d)|\bk(58|80)\b|\btm-?[tmhu]\d|\brp-?(58|80|3\d\d)|rongta|bixolon|\bsrp-|\btsp\d|\bct-s\d|\btp-?(58|80|8\d\d)|sewoo|\b(58|80) ?mm\b|thermal|\b(58|80)c?\b'
# Máy in ảo – bỏ qua
$MauAo = '(?i)pdf|xps|onenote|\bfax\b|anydesk|teamviewer|ultraviewer|snagit|send to|microsoft print|foxit'

$ThuMucScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$FileScript   = $MyInvocation.MyCommand.Path
$FileNhatKy   = Join-Path $ThuMucScript 'nhat-ky-may-in.log'
$TenLoiTat    = 'AnTam - Kiem tra may in.lnk'

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# ------------------------------------------------------------------
function Lay-WMI([string]$Lop) {
    try { return @(Get-CimInstance -ClassName $Lop -ErrorAction Stop) }
    catch {
        try { return @(Get-WmiObject -Class $Lop -ErrorAction Stop) } catch { return @() }
    }
}

function Test-Tcp([string]$DiaChi, [int]$Cong, [int]$ChoMs = 1500) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect($DiaChi, $Cong, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($ChoMs, $false)) { return $false }
        $c.EndConnect($iar)
        return $c.Connected
    } catch { return $false }
    finally { $c.Close() }
}

# Ánh xạ cổng USB001, USB002... -> thiết bị USB thật (DeviceInstance)
function Lay-Ban-Do-USB {
    $map = @{}
    $goc = 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'
    if (-not (Test-Path -LiteralPath $goc)) { return $map }
    foreach ($k in Get-ChildItem -LiteralPath $goc -ErrorAction SilentlyContinue) {
        try {
            $inst = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction Stop).DeviceInstance
            $ts   = Get-ItemProperty -LiteralPath ($k.PSPath + '\#\Device Parameters') -ErrorAction Stop
            $base = $ts.'Base Name'; if (-not $base) { $base = 'USB' }
            $so   = $ts.'Port Number'
            if ($inst -and $null -ne $so) {
                $cong = ('{0}{1:D3}' -f $base, [int]$so).ToUpper()
                if (-not $map.ContainsKey($cong)) { $map[$cong] = @() }
                $map[$cong] += [string]$inst
            }
        } catch {}
    }
    return $map
}

function Kiem-Tra-Ket-Noi($p, $UsbMap, $ThietBi, $TcpPorts) {
    $loi = @(); $canhBao = @(); $kieu = ''
    $cong = ([string]$p.PortName).Trim()
    $congHoa = $cong.ToUpper().TrimEnd(':')

    if ([string]$p.Name -match '^\\\\([^\\]+)\\') {
        $may = $Matches[1]
        $kieu = "Máy in chia sẻ từ máy tính $may"
        if (-not (Test-Tcp $may 445 1500)) { $loi += "Không kết nối được tới máy tính $may (máy đó tắt hoặc mất mạng)" }
    }
    elseif ($congHoa -match '^USB\d+$') {
        $kieu = "USB ($cong)"
        if ($UsbMap.ContainsKey($congHoa)) {
            $dangCam = @($UsbMap[$congHoa] | Where-Object { $ThietBi.ContainsKey($_.ToUpper()) })
            if ($dangCam.Count -eq 0) {
                $loi += "Không thấy máy in trên cổng $cong – cáp USB bị rút hoặc máy in chưa bật nguồn"
            } else {
                $tb = $ThietBi[$dangCam[0].ToUpper()]
                if ($tb.ConfigManagerErrorCode -and [int]$tb.ConfigManagerErrorCode -ne 0) {
                    $loi += "Thiết bị USB báo lỗi (mã $($tb.ConfigManagerErrorCode)) – thử rút ra cắm lại"
                }
            }
        } else {
            $canhBao += "Không xác định được thiết bị USB của cổng $cong (chỉ dựa vào trạng thái Windows)"
        }
    }
    elseif ($TcpPorts.ContainsKey($congHoa) -or $cong -match '(\d{1,3}(\.\d{1,3}){3})') {
        if ($TcpPorts.ContainsKey($congHoa)) {
            $tp = $TcpPorts[$congHoa]; $ip = [string]$tp.HostAddress
            if ([int]$tp.Protocol -eq 2) { $so = 515 } elseif ($tp.PortNumber) { $so = [int]$tp.PortNumber } else { $so = 9100 }
        } else { $ip = $Matches[1]; $so = 9100 }
        $kieu = "Mạng LAN ($ip`:$so)"
        if (-not (Test-Tcp $ip $so 2000)) {
            $loi += "Không kết nối được tới $ip cổng $so – kiểm tra dây mạng / nguồn máy in / địa chỉ IP"
        }
    }
    elseif ($congHoa -match '^COM\d+$') {
        $kieu = "Cổng COM ($cong)"
        $coms = @([System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object { $_.ToUpper() })
        if ($coms -notcontains $congHoa) { $loi += "Không thấy cổng $cong trên máy (cáp USB-COM bị rút?)" }
    }
    else { $kieu = $cong }

    if ($loi.Count -eq 0) {
        if ($p.WorkOffline -or [int]$p.PrinterStatus -eq 7 -or [int]$p.DetectedErrorState -eq 9) {
            $loi += 'Windows báo máy in đang Offline (chưa bật nguồn, mất kết nối, hoặc bị đặt "Use Printer Offline")'
        }
    }
    switch ([int]$p.DetectedErrorState) {
        3  { $canhBao += 'Sắp hết giấy' }
        4  { $loi += 'Hết giấy' }
        7  { $loi += 'Nắp máy in đang mở' }
        8  { $loi += 'Kẹt giấy' }
        10 { $canhBao += 'Máy in yêu cầu kiểm tra' }
    }
    return [pscustomobject]@{ Loi = $loi; CanhBao = $canhBao; Kieu = $kieu }
}

function Chay-Kiem-Tra {
    $kq = [pscustomobject]@{ ThoiGian = Get-Date; SpoolerOk = $true; DanhSach = @(); MayKhac = @(); TatCaOk = $true }

    $sp = Get-Service -Name Spooler -ErrorAction SilentlyContinue
    if (-not $sp -or $sp.Status -ne 'Running') { $kq.SpoolerOk = $false; $kq.TatCaOk = $false }

    $mayIn   = @(Lay-WMI 'Win32_Printer' | Where-Object { "$($_.Name) $($_.DriverName) $($_.PortName)" -notmatch $MauAo })
    $usbMap  = Lay-Ban-Do-USB
    $thietBi = @{}; foreach ($d in Lay-WMI 'Win32_PnPEntity') { if ($d.DeviceID) { $thietBi[([string]$d.DeviceID).ToUpper()] = $d } }
    $tcp     = @{}; foreach ($t in Lay-WMI 'Win32_TCPIPPrinterPort') { if ($t.Name) { $tcp[([string]$t.Name).ToUpper()] = $t } }

    $cacLoai = @(
        @{ Loai = 'Máy in tem nhãn';        Ten = $TenMayInTem;    Mau = $MauTem },
        @{ Loai = 'Máy in hoá đơn (nhiệt)'; Ten = $TenMayInHoaDon; Mau = $MauHoaDon }
    )
    $daDung = @{}
    foreach ($l in $cacLoai) {
        if ($l.Ten) { $ungVien = @($mayIn | Where-Object { $_.Name -like $l.Ten }) }
        else {
            $ungVien = @($mayIn | Where-Object {
                -not $daDung.ContainsKey($_.Name) -and ("$($_.Name) $($_.DriverName)" -match $l.Mau) })
        }
        $danhGia = @(foreach ($p in $ungVien) {
            $daDung[$p.Name] = 1
            $k = Kiem-Tra-Ket-Noi $p $usbMap $thietBi $tcp
            [pscustomobject]@{ May = $p; Ok = ($k.Loi.Count -eq 0); Loi = $k.Loi; CanhBao = $k.CanhBao; Kieu = $k.Kieu }
        })
        $tot  = @($danhGia | Where-Object { $_.Ok }) | Select-Object -First 1
        $chon = if ($tot) { $tot } else { $danhGia | Select-Object -First 1 }
        $muc  = [pscustomobject]@{ Loai = $l.Loai; TimThay = ($ungVien.Count -gt 0); Ok = [bool]$tot; Chon = $chon; TatCa = $danhGia }
        if (-not $muc.Ok) { $kq.TatCaOk = $false }
        $kq.DanhSach += $muc
    }
    $kq.MayKhac = @($mayIn | Where-Object { -not $daDung.ContainsKey($_.Name) } | ForEach-Object { $_.Name })
    return $kq
}

function Tao-Bao-Cao($kq) {
    $d = New-Object System.Collections.Generic.List[string]
    $d.Add("KIỂM TRA MÁY IN – " + $kq.ThoiGian.ToString('dd/MM/yyyy HH:mm'))
    $d.Add('')
    if (-not $kq.SpoolerOk) {
        $d.Add('[LỖI] Dịch vụ in của Windows (Print Spooler) đang tắt – khởi động lại máy tính.')
        $d.Add('')
    }
    foreach ($m in $kq.DanhSach) {
        if (-not $m.TimThay) {
            $d.Add("[THIẾU] $($m.Loai): không tìm thấy trên máy tính này (chưa cài driver hoặc tên không nhận ra)")
        } else {
            $nhan = if ($m.Ok) { '[OK]  ' } else { '[LỖI] ' }
            $d.Add("$nhan$($m.Loai): $($m.Chon.May.Name)")
            $d.Add("       Kết nối: $($m.Chon.Kieu)")
            foreach ($x in $m.Chon.Loi)     { $d.Add("       - $x") }
            foreach ($x in $m.Chon.CanhBao) { $d.Add("       (lưu ý) $x") }
            foreach ($khac in @($m.TatCa | Where-Object { $_ -ne $m.Chon })) {
                $tt = if ($khac.Ok) { 'kết nối' } else { 'không kết nối' }
                $d.Add("       + Cũng cài: $($khac.May.Name) – $tt")
            }
        }
        $d.Add('')
    }
    if (@($kq.DanhSach | Where-Object { -not $_.TimThay }).Count -gt 0 -and $kq.MayKhac.Count -gt 0) {
        $d.Add('Các máy in khác đang cài trên máy:')
        foreach ($n in $kq.MayKhac) { $d.Add("   • $n") }
        $d.Add('Nếu máy in của bạn nằm trong danh sách trên, mở file kiem-tra-may-in.ps1')
        $d.Add('và điền tên đó vào dòng $TenMayInTem hoặc $TenMayInHoaDon.')
        $d.Add('')
    }
    if ($kq.TatCaOk) { $d.Add('=> Cả 2 máy in đều đã kết nối.') }
    else { $d.Add('=> CÓ MÁY IN CHƯA KẾT NỐI. Kiểm tra nguồn điện, cáp USB/dây mạng rồi chạy lại.') }
    return $d
}

function Ghi-Nhat-Ky($kq) {
    try {
        $phan = foreach ($m in $kq.DanhSach) {
            if (-not $m.TimThay) { "$($m.Loai): THIẾU" }
            elseif ($m.Ok) { "$($m.Loai): OK ($($m.Chon.May.Name))" }
            else { "$($m.Loai): LỖI ($($m.Chon.May.Name) – $($m.Chon.Loi -join '; '))" }
        }
        $dong = $kq.ThoiGian.ToString('yyyy-MM-dd HH:mm:ss') + ' | ' + ($phan -join ' | ')
        Add-Content -LiteralPath $FileNhatKy -Value $dong -Encoding UTF8
    } catch {}
}

function In-Ra-Man-Hinh($dong) {
    foreach ($x in $dong) {
        $mau = 'Gray'
        if ($x -like '`[OK`]*' -or $x -like '=> Cả 2*') { $mau = 'Green' }
        elseif ($x -like '`[LỖI`]*' -or $x -like '`[THIẾU`]*' -or $x -like '=> CÓ*' -or $x -like '       - *') { $mau = 'Red' }
        elseif ($x -like '*(lưu ý)*') { $mau = 'Yellow' }
        Write-Host $x -ForegroundColor $mau
    }
}

function Hien-Thong-Bao([string]$NoiDung, [bool]$CoLoi) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $icon = if ($CoLoi) { [System.Windows.Forms.MessageBoxIcon]::Warning } else { [System.Windows.Forms.MessageBoxIcon]::Information }
        $chu  = New-Object System.Windows.Forms.Form
        $chu.TopMost = $true
        [void][System.Windows.Forms.MessageBox]::Show($chu, $NoiDung, 'Kiểm tra máy in', [System.Windows.Forms.MessageBoxButtons]::OK, $icon)
        $chu.Dispose()
    } catch {}
}

function Dung-Ban-Theo-Doi {
    Lay-WMI 'Win32_Process' | Where-Object {
        $_.Name -match 'powershell' -and $_.ProcessId -ne $PID -and
        $_.CommandLine -like '*kiem-tra-may-in.ps1*' -and $_.CommandLine -like '*-TheoDoi*'
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ============================ CHẠY ============================
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$thamSoNen = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$FileScript`" -TheoDoi -SoPhut $SoPhut"

if ($CaiDat) {
    $loiTat = Join-Path ([Environment]::GetFolderPath('Startup')) $TenLoiTat
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($loiTat)
    $sc.TargetPath       = $psExe
    $sc.Arguments        = "$thamSoNen -ChoGiay 60"
    $sc.WorkingDirectory = $ThuMucScript
    $sc.WindowStyle      = 7
    $sc.Description      = 'Tự kiểm tra máy in tem nhãn và máy in hoá đơn'
    $sc.Save()
    Dung-Ban-Theo-Doi
    Start-Process -FilePath $psExe -ArgumentList $thamSoNen -WindowStyle Hidden
    Write-Host 'ĐÃ BẬT TỰ ĐỘNG KIỂM TRA MÁY IN.' -ForegroundColor Green
    Write-Host "- Mỗi khi bật máy tính sẽ tự kiểm tra, sau đó kiểm tra lại mỗi $SoPhut phút."
    Write-Host '- Chỉ hiện cảnh báo khi có máy in bị mất kết nối, và báo lại khi đã kết nối lại.'
    Write-Host "- Nhật ký: $FileNhatKy"
    Write-Host '- Lưu ý: đừng đổi tên / di chuyển thư mục này, nếu đổi thì chạy lại CaiDatTuDong.bat.'
    exit 0
}

if ($GoCaiDat) {
    $loiTat = Join-Path ([Environment]::GetFolderPath('Startup')) $TenLoiTat
    if (Test-Path -LiteralPath $loiTat) { Remove-Item -LiteralPath $loiTat -Force }
    Dung-Ban-Theo-Doi
    Write-Host 'Đã tắt tự động kiểm tra máy in.' -ForegroundColor Yellow
    exit 0
}

if ($ChoGiay -gt 0) { Start-Sleep -Seconds $ChoGiay }

if ($TheoDoi) {
    $mutex = New-Object System.Threading.Mutex($false, 'Local\AnTam_KiemTraMayIn')
    try { $duocChay = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $duocChay = $true }
    if (-not $duocChay) { exit 0 }   # đã có một bản đang chạy
    $truoc = $null
    while ($true) {
        $kq = Chay-Kiem-Tra
        $khoa = (@($kq.DanhSach | ForEach-Object { "$($_.Loai)=$($_.Ok)" }) + "spooler=$($kq.SpoolerOk)") -join ';'
        if ($khoa -ne $truoc) {
            Ghi-Nhat-Ky $kq
            $baoCao = (Tao-Bao-Cao $kq) -join "`r`n"
            if (-not $kq.TatCaOk) { Hien-Thong-Bao $baoCao $true }
            elseif ($null -ne $truoc) { Hien-Thong-Bao ("Máy in đã kết nối lại.`r`n`r`n" + $baoCao) $false }
            $truoc = $khoa
        }
        Start-Sleep -Seconds ([Math]::Max(1, $SoPhut) * 60)
    }
}

$kq = Chay-Kiem-Tra
Ghi-Nhat-Ky $kq
$dong = Tao-Bao-Cao $kq
if ($Quiet) {
    if (-not $kq.TatCaOk) { Hien-Thong-Bao ($dong -join "`r`n") $true }
} else {
    In-Ra-Man-Hinh $dong
}
if ($kq.TatCaOk) { exit 0 } else { exit 1 }
