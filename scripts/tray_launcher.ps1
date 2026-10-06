# 정처기 PC 학습 플랫폼 - 윈도우 시스템 트레이 런처
$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    if ($MyInvocation.MyCommand.Path) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    } else {
        $scriptDir = Join-Path (Get-Location).Path "scripts"
    }
}

$projectRoot = Split-Path -Parent $scriptDir
if (-not (Test-Path "$projectRoot\package.json")) {
    $projectRoot = (Get-Location).Path
}

$logFile = "$scriptDir\tray_debug.log"
"[$(Get-Date)] 1. Tray launcher script started" | Out-File $logFile -Encoding utf8

try {
    # 콘솔 창 자동 숨김 (ShowWindow SW_HIDE)
    $windowType = Add-Type -Name Window -Namespace Console -MemberDefinition '
    [DllImport("Kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    ' -PassThru
    $consolePtr = [Console.Window]::GetConsoleWindow()
    if ($consolePtr -ne [IntPtr]::Zero) {
        [Console.Window]::ShowWindow($consolePtr, 0)
    }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    "[$(Get-Date)] 2. Assemblies loaded successfully" | Out-File $logFile -Append -Encoding utf8

    Set-Location $projectRoot
    "[$(Get-Date)] 3. Project root: $projectRoot" | Out-File $logFile -Append -Encoding utf8

    # 백그라운드로 dev:all 실행 (서버 + 클라이언트 + 터널)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "cmd.exe"
    $startInfo.Arguments = "/c npm run dev:all"
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.CreateNoWindow = $true
    $startInfo.UseShellExecute = $false

    $serverProcess = [System.Diagnostics.Process]::Start($startInfo)
    "[$(Get-Date)] 4. Background server process started (PID: $($serverProcess.Id))" | Out-File $logFile -Append -Encoding utf8

    # 트레이 아이콘 설정
    $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
    $notifyIcon.Text = "정처기 PC 학습 플랫폼 (실행 중)"
    $notifyIcon.Visible = $true

    # 우클릭 컨텍스트 메뉴 구성
    $contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

    $menuTitle = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuTitle.Text = "정처기 PC 플랫폼 v1.2.0"
    $menuTitle.Enabled = $false
    $contextMenu.Items.Add($menuTitle) | Out-Null

    $contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

    # [웹 브라우저 열기]
    $menuOpenWeb = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuOpenWeb.Text = "🌐 로컬 학습 열기 (http://localhost:5173)"
    $menuOpenWeb.add_Click({
        Start-Process "http://localhost:5173"
    })
    $contextMenu.Items.Add($menuOpenWeb) | Out-Null

    # [모바일/외부 URL 확인 (GitHub)]
    $menuGithub = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuGithub.Text = "📱 모바일 접속 주소 확인 (GitHub)"
    $menuGithub.add_Click({
        Start-Process "https://github.com/wldghs5s-max/jungcheogi-trainer-pc"
    })
    $contextMenu.Items.Add($menuGithub) | Out-Null

    $contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

    # [전체 종료]
    $menuExit = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuExit.Text = "❌ 전체 종료 (서버/터널 중지)"
    $menuExit.add_Click({
        $notifyIcon.Visible = $false
        Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        if ($serverProcess -and !$serverProcess.HasExited) {
            taskkill /PID $serverProcess.Id /T /F 2>$null
        }
        $ports = @(5173, 8765)
        foreach ($p in $ports) {
            $pids = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
            foreach ($procId in $pids) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
        [System.Windows.Forms.Application]::Exit()
    })
    $contextMenu.Items.Add($menuExit) | Out-Null

    $notifyIcon.ContextMenuStrip = $contextMenu

    # 더블클릭 시 브라우저 바로 열기
    $notifyIcon.add_DoubleClick({
        Start-Process "http://localhost:5173"
    })

    # 풍선 도움말 알림
    $notifyIcon.BalloonTipTitle = "정처기 PC 플랫폼 실행됨"
    $notifyIcon.BalloonTipText = "백그라운드에서 실행 중입니다.`n더블클릭: 브라우저 열기`n우클릭: 모바일 주소 확인 및 종료"
    $notifyIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $notifyIcon.ShowBalloonTip(4000)

    # 시작 3초 후 브라우저 자동 오픈
    $openTimer = New-Object System.Windows.Forms.Timer
    $openTimer.Interval = 3000
    $openTimer.add_Tick({
        $openTimer.Stop()
        $openTimer.Dispose()
        Start-Process "http://localhost:5173"
    })
    $openTimer.Start()

    "[$(Get-Date)] 5. Starting Application Run loop" | Out-File $logFile -Append -Encoding utf8
    [System.Windows.Forms.Application]::Run()
    "[$(Get-Date)] 6. Application Run loop exited" | Out-File $logFile -Append -Encoding utf8
} catch {
    "[$(Get-Date)] EXCEPTION CAUGHT: $($_.Exception.ToString())" | Out-File $logFile -Append -Encoding utf8
}
