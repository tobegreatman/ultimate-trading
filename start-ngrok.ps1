# ===========================================================================
# Ultimate Trade - 外网访问启动脚本 (生产模式 + ngrok)
# 用法: .\start-ngrok.ps1
# 退出: Ctrl+C (会同时关闭公网隧道)
# ===========================================================================

# 用 Continue 而非 Stop：npm/node 会向 stderr 输出进度日志，
# Stop 模式下 PowerShell 5.1 会将其误判为终止错误 (NativeCommandError)
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "=== Ultimate Trade - 外网访问启动脚本 ===" -ForegroundColor Cyan

# -------------------- 1. 确保 @ngrok/ngrok 已安装 --------------------
Write-Host "`n[1/4] 检查 ngrok 包..." -ForegroundColor Yellow
$ngrokPkg = Test-Path "node_modules/@ngrok/ngrok"
if (-not $ngrokPkg) {
    Write-Host "    安装 @ngrok/ngrok..." -ForegroundColor Yellow
    npm install @ngrok/ngrok 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] @ngrok/ngrok 安装失败" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] @ngrok/ngrok 已就绪" -ForegroundColor Green

# -------------------- 2. 构建前端 --------------------
Write-Host "`n[2/4] 构建前端静态文件..." -ForegroundColor Yellow
# cmd /c 包装：让 cmd.exe 处理 stderr 重定向，避免 PowerShell 拦截
cmd /c "npm run build 2>&1" | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] 前端构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] 前端构建完成" -ForegroundColor Green

# -------------------- 3. 启动后端服务 (含静态文件托管) --------------------
Write-Host "`n[3/4] 启动后端服务..." -ForegroundColor Yellow

$conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[OK] 检测到服务已在运行 (端口 3001)，跳过启动" -ForegroundColor Green
} else {
    Write-Host "    启动 npm run server..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList "run", "server" -WorkingDirectory $ProjectRoot -WindowStyle Normal

    Write-Host "    等待服务启动..." -ForegroundColor Yellow
    $maxWait = 15
    $waited = 0
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 1
        $waited += 1
        $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
        if ($conn) { break }
        Write-Host "    等待中... ($waited s)" -ForegroundColor DarkGray
    }

    if (-not $conn) {
        Write-Host "[X] 服务启动超时" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] 服务已启动，端口: 3001" -ForegroundColor Green
}

# -------------------- 4. 启动 ngrok 隧道 --------------------
Write-Host "`n[4/4] 启动 ngrok 公网隧道..." -ForegroundColor Yellow
Write-Host @"
----------------------------------------
公网访问地址将在下方显示 (TUNNEL_URL: ...)
首次访问浏览器会显示 ngrok 警告页面，点击 "Visit Site" 即可
按 Ctrl+C 退出 (会关闭公网隧道，服务保持运行)
----------------------------------------
"@ -ForegroundColor Cyan

# 使用 @ngrok/ngrok Node.js 包，无需运行 ngrok.exe 可执行文件
# start-tunnel.cjs 内部已将 stderr 重定向到 stdout，避免 PowerShell 5.1 误判
cmd /c "node start-tunnel.cjs 2>&1"
