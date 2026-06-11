# PowerShell automated builder helper for AeroPOS Custom OS ISO

Write-Host "=== [1/3] Building AeroPOS OS Compiler Docker Image ===" -ForegroundColor Cyan
docker build -t aeropos-os-builder ./os-builder

Write-Host "=== [2/3] Generating aeropos-kiosk.iso ===" -ForegroundColor Cyan
if (!(Test-Path -Path "./output")) {
    New-Item -ItemType Directory -Path "./output" | Out-Null
}

docker run --privileged `
  -v "${PWD}/output:/output" `
  -v "${PWD}:/app" `
  aeropos-os-builder

Write-Host "=== [3/3] Build Completed! ===" -ForegroundColor Green
Write-Host "Your bootable ISO file is saved at: ${PWD}\output\aeropos-kiosk.iso" -ForegroundColor Yellow
Write-Host "You can now mount this ISO file in Oracle VM VirtualBox settings to boot it!" -ForegroundColor Cyan
Read-Host -Prompt "Press Enter to close this window..."
