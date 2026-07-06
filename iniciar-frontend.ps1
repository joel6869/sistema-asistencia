Set-Location -LiteralPath $PSScriptRoot
Set-Location -LiteralPath ".\frontend"
& "C:\Program Files\nodejs\npm.cmd" run dev -- --host 0.0.0.0
