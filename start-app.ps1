param(
  [int]$Port = 5500
)

$ErrorActionPreference = "Stop"
$Node = "C:\Users\andre\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$App = Join-Path $PSScriptRoot "server.js"

$env:PORT = $Port
Write-Host "Starting Colour Reaction Experiment on http://localhost:$Port"
Write-Host "Host:        http://localhost:$Port/?role=host"
Write-Host "Participant: http://localhost:$Port/?role=participant"
& $Node $App
