param([switch]$VerificarSomente)

$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot
$serverProcess=$null
$port=8080
$base="http://127.0.0.1:$port"

function Stop-WithMessage([string]$message){throw $message}
function New-Hex([int]$bytes){& node -e "console.log(require('node:crypto').randomBytes($bytes).toString('hex'))"}

try {
  $node=Get-Command node -ErrorAction SilentlyContinue
  if(-not $node){Stop-WithMessage 'Instale Node.js 24 ou superior antes de continuar.'}
  $major=[int](& node -p "process.versions.node.split('.')[0]")
  if($major -lt 24){Stop-WithMessage "Node.js $major encontrado. O Mesa3D exige versão 24 ou superior."}

  if(-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))){
    $email=(Read-Host 'Seu e-mail para acessar a administração').Trim().ToLowerInvariant()
    if($email -notmatch '^[^\s@=]+@[^\s@=]+\.[^\s@=]+$'){Stop-WithMessage 'E-mail inválido. Execute novamente.'}
    $password=& node -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))"
    $pilot=& node -e "console.log(require('node:crypto').randomBytes(12).toString('base64url'))"
    $key=New-Hex 32
    $config=@"
HOST=127.0.0.1
PORT=$port
PUBLIC_BASE_URL=
OWNER_EMAIL=$email
OWNER_PASSWORD=$password
MESA3D_ENCRYPTION_KEY=$key
PILOT_ACCESS_CODE=$pilot
PLAN_MONTHLY_CENTS=0
"@
    [System.IO.File]::WriteAllText((Join-Path $projectRoot '.env'),$config,[System.Text.UTF8Encoding]::new($false))
    Write-Host ''
    Write-Host "Senha inicial de $email : $password" -ForegroundColor Yellow
    Write-Host 'Guarde-a em um gerenciador de senhas. Depois entre em /acesso.html e troque-a no painel.'
    Write-Host 'O arquivo .env fica somente neste computador. Não o envie ao cliente.'
  }

  $envPath=Join-Path $projectRoot '.env'
  $envText=[System.IO.File]::ReadAllText($envPath)
  $pilotMatch=[regex]::Match($envText,'(?m)^PILOT_ACCESS_CODE=([^\r\n]*)')
  if(-not $pilotMatch.Success -or -not $pilotMatch.Groups[1].Value.Trim()){
    $pilot=& node -e "console.log(require('node:crypto').randomBytes(12).toString('base64url'))"
    if($pilotMatch.Success){$envText=$envText.Substring(0,$pilotMatch.Index)+"PILOT_ACCESS_CODE=$pilot"+$envText.Substring($pilotMatch.Index+$pilotMatch.Length);[System.IO.File]::WriteAllText($envPath,$envText,[System.Text.UTF8Encoding]::new($false))}
    else{[System.IO.File]::AppendAllText($envPath,"`r`nPILOT_ACCESS_CODE=$pilot`r`n",[System.Text.UTF8Encoding]::new($false))}
  }else{$pilot=$pilotMatch.Groups[1].Value.Trim()}
  if($pilot.Length -lt 12){Stop-WithMessage 'PILOT_ACCESS_CODE deve ter pelo menos 12 caracteres.'}

  if(-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))){
    Write-Host 'Instalando dependências do projeto...'
    & npm ci --omit=dev
    if($LASTEXITCODE -ne 0){Stop-WithMessage 'Falha ao instalar dependências.'}
  }

  $alreadyRunning=$false
  try {$health=Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 2;$alreadyRunning=($health.ok -eq $true)} catch {}
  if($alreadyRunning){Stop-WithMessage "A porta $port já está ocupada por um Mesa3D. Feche-o antes de iniciar este teste."}

  $dataPath=Join-Path $projectRoot 'data'
  New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
  $serverProcess=Start-Process -FilePath $node.Source -ArgumentList @('--env-file-if-exists=.env','server.js') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'teste-celular-out.log') -RedirectStandardError (Join-Path $dataPath 'teste-celular-err.log') -PassThru
  $ready=$false
  for($attempt=0;$attempt -lt 40;$attempt++){
    if($serverProcess.HasExited){Stop-WithMessage 'O servidor encerrou. Consulte data/teste-celular-err.log.'}
    try {$health=Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 2;if($health.ok){$ready=$true;break}} catch {}
    Start-Sleep -Milliseconds 500
  }
  if(-not $ready){Stop-WithMessage 'O servidor não respondeu. Consulte data/teste-celular-err.log.'}
  Write-Host "Servidor local pronto: $base" -ForegroundColor Green
  Write-Host 'Esse endereço local serve apenas para este computador. Não o abra no celular.'

  if($VerificarSomente){Write-Host 'Verificação local concluída. Nenhum túnel foi aberto.';return}

  $cloudflaredCommand=Get-Command cloudflared -ErrorAction SilentlyContinue
  $cloudflared=if($cloudflaredCommand){$cloudflaredCommand.Source}else{$null}
  if(-not $cloudflared){
    $binDir=Join-Path $projectRoot 'tools\bin'
    $cloudflared=Join-Path $binDir 'cloudflared.exe'
    if(-not (Test-Path -LiteralPath $cloudflared)){
      $answer=Read-Host 'Baixar cloudflared oficial da Cloudflare para este projeto? [S/n]'
      if($answer -and $answer -notmatch '^[sS]'){Stop-WithMessage 'Instale cloudflared e execute novamente.'}
      if([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -ne 'X64'){Stop-WithMessage 'Este iniciador baixa a versão Windows x64. Instale cloudflared para sua arquitetura manualmente.'}
      New-Item -ItemType Directory -Path $binDir -Force | Out-Null
      Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
    }
  }

  Write-Host ''
  Write-Host "Código de convite do teste: $pilot" -ForegroundColor Yellow
  Write-Host 'Aguarde o cloudflared mostrar o endereço completo https://...trycloudflare.com.' -ForegroundColor Green
  Write-Host 'Copie esse endereço inteiro para o celular. Não copie IPs, 127.0.0.1 nem outros endereços do log.'
  Write-Host 'Envie o link e o código somente aos testadores escolhidos. Não envie a senha de administrador.'
  Write-Host 'Os arquivos 3D podem ser buscados diretamente pelo visualizador AR se o endereço deles for compartilhado.'
  Write-Host 'Teste a escala em /teste-camera.html. Mantenha esta janela e o computador ligados.'
  Write-Host 'Pressione Ctrl+C para encerrar o teste.'
  & $cloudflared tunnel --url $base
}
catch {Write-Error $_}
finally {
  if($serverProcess -and -not $serverProcess.HasExited){Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue}
}
