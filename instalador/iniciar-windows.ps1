$ErrorActionPreference='Stop'
$raiz=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node=Join-Path $raiz '.mesa3d/node/node.exe'
$logDir=Join-Path $raiz 'data'
$site='http://127.0.0.1:8080/acesso.html'
function Online {
  try {
    $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 2
    return ($r.ok -eq $true)
  } catch {return $false}
}
try {
  if(-not (Test-Path $node)){throw 'A instalacao ainda nao foi concluida. Execute Instalar-Mesa3D.bat primeiro.'}
  if(-not (Test-Path (Join-Path $raiz '.env'))){throw 'Arquivo de configuracao nao encontrado. Execute o instalador novamente.'}
  if(-not (Test-Path (Join-Path $raiz 'node_modules/express'))){throw 'Bibliotecas ausentes. Execute o instalador novamente.'}
  # Localiza DLLs de programas 3D baixados pelo instalador (inclusive reinicios futuros).
  foreach($motor in @('openmvs','colmap')) {
    $rootMotor=Join-Path $raiz ('.mesa3d/'+$motor)
    if(Test-Path $rootMotor){
      $dllDirs=Get-ChildItem -LiteralPath $rootMotor -Recurse -Filter '*.dll' -File -ErrorAction SilentlyContinue | ForEach-Object {$_.DirectoryName} | Select-Object -Unique
      foreach($dllDir in $dllDirs){$env:Path="$dllDir;$env:Path"}
    }
  }
  if(-not (Online)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $stdout=Join-Path $logDir 'servidor-saida.log'
    $stderr=Join-Path $logDir 'servidor-erros.log'
    if(Test-Path $stdout){Remove-Item $stdout -Force}
    if(Test-Path $stderr){Remove-Item $stderr -Force}
    $p=Start-Process -FilePath $node -ArgumentList @('--env-file=.env','server.js') -WorkingDirectory $raiz -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $online=$false
    for($i=0;$i -lt 35;$i++){
      Start-Sleep -Milliseconds 600
      if(Online){$online=$true;break}
      if($p.HasExited){break}
    }
    if(-not $online){
      $diagnostico=''
      if(Test-Path $stderr){$diagnostico=(Get-Content $stderr -Tail 12 | Out-String)}
      throw "O servidor nao iniciou corretamente. Veja data/servidor-erros.log. $diagnostico"
    }
  }
  Write-Host 'Mesa3D aberto no navegador. Funciona localmente, sem hospedagem.' -ForegroundColor Green
  if(Test-Path (Join-Path $raiz 'ACESSO-LOCAL.txt')){
    Start-Process -FilePath 'notepad.exe' -ArgumentList ('"'+(Join-Path $raiz 'ACESSO-LOCAL.txt')+'"')
  }
  Start-Process $site
} catch {
  Write-Host "Nao foi possivel iniciar: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
