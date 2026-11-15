# Mesa3D - Instalador de primeiro uso Windows x64, sem exigir conta de administrador.
# Baixa Node.js oficial, dependencias npm e motor OpenMVS CPU de release oficial.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pacotes = Join-Path $raiz '.mesa3d'
$temporarios = Join-Path $pacotes 'downloads'
$nodeDir = Join-Path $pacotes 'node'
$mvsDir = Join-Path $pacotes 'openmvs'
$colmapDir = Join-Path $pacotes 'colmap'
New-Item -ItemType Directory -Path $temporarios -Force | Out-Null
$headers = @{ 'User-Agent' = 'Mesa3D-Instalador'; 'Accept' = 'application/vnd.github+json' }

function Aviso([string]$mensagem) { Write-Host "[Mesa3D] $mensagem" -ForegroundColor Cyan }
function Baixar([string]$url,[string]$destino) {
  if ($url -notmatch '^https://') { throw "Download nao seguro: $url" }
  Aviso "Baixando: $(Split-Path $destino -Leaf)"
  Invoke-WebRequest -Uri $url -OutFile $destino -UseBasicParsing -MaximumRedirection 8
  if ((Get-Item $destino).Length -lt 512) { throw "Arquivo nao foi baixado corretamente: $destino" }
}
function ConferirHash([string]$arquivo,[string]$esperado) {
  $real = (Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($real -ne $esperado.ToLowerInvariant()) { Remove-Item $arquivo -Force;throw "SHA256 incorreto: $(Split-Path $arquivo -Leaf)" }
}
function Extrair([string]$arquivo,[string]$destino) {
  if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
  New-Item -ItemType Directory -Path $destino -Force | Out-Null
  if ($arquivo -match '\.zip$') { Expand-Archive -LiteralPath $arquivo -DestinationPath $destino -Force }
  elseif ($arquivo -match '\.(tar\.gz|tgz)$') { & tar -xzf $arquivo -C $destino; if($LASTEXITCODE -ne 0){throw 'Nao foi possivel extrair tar.gz.'} }
  else { throw 'Formato de pacote nao suportado pelo instalador automatico.' }
}
function BuscarExe([string]$pasta,[string]$nome) {
  $exe = Get-ChildItem -LiteralPath $pasta -Filter "$nome.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if($null -eq $exe){ return $null }
  return $exe.FullName
}

try {
  if(-not [Environment]::Is64BitOperatingSystem) { throw 'O instalador exige Windows 64 bits.' }
  Aviso '1/4 - Preparando o Node.js portatil (sem instalar no Windows)'
  $nodeExe=Join-Path $nodeDir 'node.exe'
  if(-not (Test-Path $nodeExe)) {
    $versoes=Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $v= @($versoes | Where-Object {$_.version -match '^v24\.' -and $_.files -contains 'win-x64-zip'})[0].version
    if(-not $v){throw 'Nao consegui localizar Node.js 24 para Windows x64.'}
    $zipName="node-$v-win-x64.zip";$zipPath=Join-Path $temporarios $zipName
    Baixar "https://nodejs.org/dist/$v/$zipName" $zipPath
    $hashText=(Invoke-WebRequest -Uri "https://nodejs.org/dist/$v/SHASUMS256.txt" -UseBasicParsing).Content
    $pattern=[regex]::Escape($zipName)+'$'
    $line= @($hashText -split "`n" | Where-Object {$_ -match $pattern})[0]
    if(-not $line -or $line -notmatch '^([0-9a-fA-F]{64})\s+') {throw 'SHA256 oficial do Node nao encontrado.'}
    ConferirHash $zipPath $Matches[1]
    $extraido=Join-Path $temporarios 'node-extraido'
    Extrair $zipPath $extraido
    $dirInterno=Get-ChildItem $extraido -Directory | Where-Object {$_.Name -like 'node-v*-win-x64'} | Select-Object -First 1
    if(-not $dirInterno){throw 'Arquivo Node invalido.'}
    if(Test-Path $nodeDir){Remove-Item $nodeDir -Recurse -Force}
    Move-Item $dirInterno.FullName $nodeDir
    Remove-Item $extraido -Recurse -Force
  }
  & $nodeExe --version
  if($LASTEXITCODE -ne 0){throw 'Node.js baixado nao abre.'}

  Aviso '2/4 - Instalando bibliotecas do site'
  Push-Location $raiz
  try {
    $env:Path = "$nodeDir;$env:Path"
    $npmCmd=Join-Path $nodeDir 'npm.cmd'
    if(-not (Test-Path (Join-Path $raiz 'node_modules/express'))){
      & $npmCmd ci --no-audit --no-fund
      if($LASTEXITCODE -ne 0){throw 'npm ci falhou. Confirme internet e veja a mensagem de erro acima.'}
    }
    & $nodeExe tools/configurar-local.mjs
    if($LASTEXITCODE -ne 0){throw 'Falha ao criar configuracao local.'}
  } finally { Pop-Location }

  if($raiz -match '(?i)[\\/]OneDrive[\\/]'){
    Write-Host '[Mesa3D] DICA: para scans grandes, prefira C:\Mesa3D fora do OneDrive, evitando sincronizacao de arquivos temporarios.' -ForegroundColor Yellow
  }
  Aviso '3/4 - Baixando o motor 3D local (OpenMVS, sem API)'
  $mvsExe=if(Test-Path $mvsDir){BuscarExe $mvsDir 'DensifyPointCloud'}else{$null}
  if(-not $mvsExe){
    $zip=Join-Path $temporarios 'OpenMVS_Windows_x64.zip'
    Baixar 'https://github.com/cdcseacave/openMVS/releases/download/v2.4.0/OpenMVS_Windows_x64.zip' $zip
    # Hash SHA256 publicado pelo autor em GitHub Releases; nunca executar um arquivo diferente.
    ConferirHash $zip '0c31660c15c9ebc4c106873cf67564d9570d404aef7a6403451da1b6178b2167'
    Extrair $zip $mvsDir
    $mvsExe=BuscarExe $mvsDir 'DensifyPointCloud'
  }
  if(-not $mvsExe){throw 'OpenMVS foi baixado, mas o executavel DensifyPointCloud nao foi encontrado.'}
  $binMvs=Split-Path $mvsExe -Parent
  foreach($tool in @('ReconstructMesh','TextureMesh','TransformScene')) {
    if(-not (Test-Path (Join-Path $binMvs "$tool.exe"))){throw "OpenMVS esta incompleto: falta $tool.exe"}
  }
  $colmapExe=$null
  if(-not (Test-Path (Join-Path $binMvs 'CreateStructure.exe'))) {
    Aviso 'OpenMVS instalado nao oferece CreateStructure; adicionando COLMAP automaticamente.'
    $colmapExe=if(Test-Path $colmapDir){BuscarExe $colmapDir 'colmap'}else{$null}
    if(-not $colmapExe){
      $zipColmap=Join-Path $temporarios 'colmap-x64-windows-nocuda.zip'
      Baixar 'https://github.com/colmap/colmap/releases/download/4.2.1/colmap-x64-windows-nocuda.zip' $zipColmap
      ConferirHash $zipColmap 'c493d88cb4a43f21afba42cb55bf786e5434a0420e73db0ba1454c5d8b3686ae'
      Extrair $zipColmap $colmapDir
      $colmapExe=BuscarExe $colmapDir 'colmap'
    }
    if(-not $colmapExe){throw 'Executavel COLMAP nao encontrado apos baixar o pacote.'}
    if(-not (Test-Path (Join-Path $binMvs 'InterfaceCOLMAP.exe'))){throw 'OpenMVS sem CreateStructure nem InterfaceCOLMAP. Nao e possivel fazer fotogrametria com essa versao.'}
    $env:MESA3D_COLMAP_BIN = $colmapExe
    $env:Path = "$(Split-Path $colmapExe -Parent);$env:Path"
    $dllDirs = Get-ChildItem -LiteralPath $colmapDir -Recurse -Filter '*.dll' -File -ErrorAction SilentlyContinue | ForEach-Object {$_.DirectoryName} | Select-Object -Unique
    foreach($dllDir in $dllDirs){$env:Path="$dllDir;$env:Path"}
    # Ajuda diagnostica: os binarios devem realmente iniciar no PC do usuario.
    $colmapOut=Join-Path $temporarios 'colmap-verificacao-saida.log'
    $colmapErr=Join-Path $temporarios 'colmap-verificacao-erros.log'
    $probe=Start-Process -FilePath $colmapExe -ArgumentList '-h' -Wait -PassThru -NoNewWindow -RedirectStandardOutput $colmapOut -RedirectStandardError $colmapErr
    # Algumas builds retornam 1 ao exibir ajuda corretamente. Codigos de
    # falha do loader/DLL do Windows sao diferentes de 0/1.
    if($probe.ExitCode -notin @(0,1)){throw "COLMAP nao inicia (codigo $($probe.ExitCode)). Verifique as DLLs do sistema."}
  }
  $env:MESA3D_3D_BIN_DIR = $binMvs
  $env:Path = "$binMvs;$env:Path"
  $configuracao=Join-Path $raiz '.env'
  $envLines= @(Get-Content $configuracao | Where-Object {$_ -notmatch '^MESA3D_(3D_BIN_DIR|COLMAP_BIN)='})
  $envLines+= 'MESA3D_3D_BIN_DIR=' + $binMvs.Replace([IO.Path]::DirectorySeparatorChar, '/')
  if($colmapExe){$envLines+='MESA3D_COLMAP_BIN='+$colmapExe.Replace([IO.Path]::DirectorySeparatorChar, '/')}
  # Windows PowerShell 5 escreve BOM com -Encoding UTF8; nao modificar a
  # codificacao do .env, pois o Node precisa ler nomes de variaveis exatos.
  [System.IO.File]::WriteAllLines($configuracao,[string[]]$envLines,(New-Object System.Text.UTF8Encoding($false)))
  Push-Location $raiz
  try {
    & $nodeExe --env-file=.env tools/check-local-3d.mjs
    if($LASTEXITCODE -ne 0){throw 'O motor OpenMVS/COLMAP nao conseguiu iniciar. Verifique os logs acima ou dependencias DLL.'}
  } finally {Pop-Location}

  Aviso '4/4 - Criando atalho e abrindo o Mesa3D'
  try {
    $desktop=[Environment]::GetFolderPath('Desktop')
    $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Mesa3D.lnk'))
    $shortcut.TargetPath=Join-Path $raiz 'Abrir-Mesa3D.bat'
    $shortcut.WorkingDirectory=$raiz
    $shortcut.Description='Abrir o Mesa3D local para gerar pratos em 3D'
    $shortcut.Save()
    Aviso 'Atalho Mesa3D criado na area de trabalho.'
  }catch{Aviso 'Nao foi possivel criar atalho, mas o projeto pode ser aberto pela pasta.'}
  & (Join-Path $PSScriptRoot 'iniciar-windows.ps1')
  if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'Nao foi possivel abrir o site.'}
  Aviso 'Instalacao concluida! Para proximas vezes, clique em Mesa3D na area de trabalho.'
} catch {
  Write-Host "`nNAO FOI POSSIVEL TERMINAR A INSTALACAO: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'O instalador nao vai declarar o 3D pronto enquanto faltar alguma dependencia.' -ForegroundColor Yellow
  Write-Host 'Internet e espaco em disco sao necessarios somente na primeira instalacao.'
  exit 1
}
