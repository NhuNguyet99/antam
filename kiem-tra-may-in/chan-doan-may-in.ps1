<#  CHẨN ĐOÁN MÁY IN – thu thập thông tin vào file chan-doan-may-in.txt trên Desktop  #>
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'chan-doan-may-in.txt'
function Muc($t) { "`r`n===== $t =====" }
function W($cls) { try { @(Get-CimInstance $cls -ErrorAction Stop) } catch { @() } }

$r = & {
    Muc 'WINDOWS'
    $os = W Win32_OperatingSystem | Select-Object -First 1
    "$($os.Caption) $($os.Version) $($os.OSArchitecture)"
    Muc 'PRINT SPOOLER'
    Get-Service Spooler | ForEach-Object { "$($_.Status) / $($_.StartType)" }

    Muc 'MÁY IN ĐÃ CÀI'
    W Win32_Printer | ForEach-Object { "- $($_.Name) | driver: $($_.DriverName) | cổng: $($_.PortName) | offline: $($_.WorkOffline) | status: $($_.PrinterStatus) / lỗi: $($_.DetectedErrorState)" }

    Muc 'DRIVER MÁY IN ĐÃ CÀI'
    try { Get-PrinterDriver | ForEach-Object { "- $($_.Name)" } } catch { 'không đọc được' }

    Muc 'CỔNG USB MÁY IN (USB001...)'
    $coMat = @{}; foreach ($d in W Win32_PnPEntity) { if ($d.DeviceID) { $coMat[([string]$d.DeviceID).ToUpper()] = 1 } }
    $goc = 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'
    if (Test-Path -LiteralPath $goc) {
        foreach ($k in Get-ChildItem -LiteralPath $goc -ErrorAction SilentlyContinue) {
            try {
                $inst = (Get-ItemProperty -LiteralPath $k.PSPath).DeviceInstance
                $ts = Get-ItemProperty -LiteralPath ($k.PSPath + '\#\Device Parameters')
                $cam = if ($inst -and $coMat.ContainsKey(([string]$inst).ToUpper())) { 'ĐANG CẮM' } else { 'không cắm' }
                '- {0}{1:D3} | {2} | {3} | {4}' -f $ts.'Base Name', [int]$ts.'Port Number', $ts.'Port Description', $cam, $inst
            } catch {}
        }
    } else { '(chưa từng có máy in USB nào được Windows nhận)' }

    Muc 'THIẾT BỊ BỊ LỖI / CHƯA CÓ DRIVER'
    W Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -and [int]$_.ConfigManagerErrorCode -ne 0 } |
        ForEach-Object { "- $($_.Name) | mã lỗi $($_.ConfigManagerErrorCode) | $($_.DeviceID)" }

    Muc 'TẤT CẢ THIẾT BỊ USB ĐANG CẮM'
    W Win32_PnPEntity | Where-Object { $_.DeviceID -match '^(USB|USBPRINT)\\' } |
        ForEach-Object { "- $($_.Name) | $($_.PNPClass) | $($_.Status) | $($_.DeviceID)" }

    Muc 'CỔNG COM'
    W Win32_PnPEntity | Where-Object { $_.Name -match '\(COM\d+\)' } | ForEach-Object { "- $($_.Name) | $($_.DeviceID)" }

    Muc 'MẠNG'
    try { Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' } | ForEach-Object { "- $($_.InterfaceAlias): $($_.IPAddress)/$($_.PrefixLength)" } } catch {}

    Muc 'LỖI CÀI ĐẶT GẦN ĐÂY (PrintService / driver)'
    try {
        Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1,2,3; StartTime = (Get-Date).AddDays(-2) } -MaxEvents 300 -ErrorAction Stop |
            Where-Object { $_.ProviderName -match 'Print|UserPnp|DriverFrameworks|Kernel-PnP' } | Select-Object -First 20 |
            ForEach-Object { "- $($_.TimeCreated.ToString('dd/MM HH:mm')) $($_.ProviderName): " + (($_.Message -split "`n")[0]) }
    } catch {}
}
$r | Out-File -FilePath $out -Encoding UTF8
$r | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host "Đã lưu vào: $out  – hãy chụp màn hình hoặc gửi file này." -ForegroundColor Green
Start-Process notepad.exe $out
