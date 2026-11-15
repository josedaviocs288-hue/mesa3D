# Reutiliza as mesmas DLLs usadas pelo iniciador, sem reinstalar nada.
$ErrorActionPreference='Stop'
$raiz=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node=Join-Path $raiz '.mesa3d/node/node.exe'
if(-not (Test-Path $node) -or -not (Test-Path (Join-Path $raiz '.env'))){
  Write-Host '[Mesa3D] Execute Instalar-Mesa3D.bat primeiro.' -ForegroundColor Red
  exit 1
}
foreach($motor in @('openmvs','colmap')){
  $dir=Join-Path $raiz ('.mesa3d/'+$motor)
  if(Test-Path $dir){
    $dllDirs=Get-ChildItem -LiteralPath $dir -Recurse -Filter '*.dll' -File -ErrorAction SilentlyContinue | ForEach-Object {$_.DirectoryName} | Select-Object -Unique
    foreach($dllDir in $dllDirs){$env:Path="$dllDir;$env:Path"}
  }
}
Push-Location $raiz
try{
  & $node --env-file=.env tools/check-local-3d.mjs
  exit $LASTEXITCODE
}finally{Pop-Location}
