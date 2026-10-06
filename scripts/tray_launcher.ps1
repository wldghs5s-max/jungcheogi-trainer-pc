# Jungcheogi PC Trainer - Windows System Tray Launcher
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
"[$(Get-Date)] 1. Tray launcher script started" | Out-File $logFile -Encoding ascii

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    "[$(Get-Date)] 2. Assemblies loaded successfully" | Out-File $logFile -Append -Encoding ascii

    Set-Location $projectRoot
    "[$(Get-Date)] 3. Project root: $projectRoot" | Out-File $logFile -Append -Encoding ascii

    # Launch dev:all in background
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "cmd.exe"
    $startInfo.Arguments = "/c npm run dev:all"
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.CreateNoWindow = $true
    $startInfo.UseShellExecute = $false

    $serverProcess = [System.Diagnostics.Process]::Start($startInfo)
    "[$(Get-Date)] 4. Background server process started (PID: $($serverProcess.Id))" | Out-File $logFile -Append -Encoding ascii

    # Configure NotifyIcon
    $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
    $notifyIcon.Text = "Jungcheogi Trainer PC (Running)"
    $notifyIcon.Visible = $true

    # Context Menu
    $contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

    $menuTitle = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuTitle.Text = "Jungcheogi Trainer v1.2.0"
    $menuTitle.Enabled = $false
    $contextMenu.Items.Add($menuTitle) | Out-Null

    $contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

    # Open Web
    $menuOpenWeb = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuOpenWeb.Text = "Open Web App (localhost:5173)"
    $menuOpenWeb.add_Click({
        Start-Process "http://localhost:5173"
    })
    $contextMenu.Items.Add($menuOpenWeb) | Out-Null

    # Open GitHub
    $menuGithub = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuGithub.Text = "Check Mobile URL (GitHub)"
    $menuGithub.add_Click({
        Start-Process "https://github.com/wldghs5s-max/jungcheogi-trainer-pc"
    })
    $contextMenu.Items.Add($menuGithub) | Out-Null

    $contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

    # Exit
    $menuExit = New-Object System.Windows.Forms.ToolStripMenuItem
    $menuExit.Text = "Stop & Exit Platform"
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

    # Double click
    $notifyIcon.add_DoubleClick({
        Start-Process "http://localhost:5173"
    })

    # Balloon tip
    $notifyIcon.BalloonTipTitle = "Jungcheogi Trainer PC"
    $notifyIcon.BalloonTipText = "Platform is running in the background. Double-click to open."
    $notifyIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $notifyIcon.ShowBalloonTip(3000)

    # Auto open browser after 3 seconds
    $openTimer = New-Object System.Windows.Forms.Timer
    $openTimer.Interval = 3000
    $openTimer.add_Tick({
        $openTimer.Stop()
        $openTimer.Dispose()
        Start-Process "http://localhost:5173"
    })
    $openTimer.Start()

    "[$(Get-Date)] 5. Starting Application Run loop" | Out-File $logFile -Append -Encoding ascii
    [System.Windows.Forms.Application]::Run()
    "[$(Get-Date)] 6. Application Run loop exited" | Out-File $logFile -Append -Encoding ascii
} catch {
    "[$(Get-Date)] EXCEPTION CAUGHT: $($_.Exception.ToString())" | Out-File $logFile -Append -Encoding ascii
}
