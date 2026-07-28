param(
  [string]$Owner = 'Verdemax777verdemax',
  [string]$Repo = 'tixuzautos',
  [string]$Branch = 'main',
  [string]$CommitMessage = 'Tixuz Autos actual junio 2026',
  [switch]$TokenFromClipboard
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogPath = Join-Path $env:TEMP 'tixuz-github-push.log'

function Log($Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  $line | Add-Content -LiteralPath $LogPath
  Write-Host $line
}

function Get-PlainToken {
  if ($TokenFromClipboard) {
    $clip = Get-Clipboard -Raw -ErrorAction Stop
    $token = ($clip -replace '\s', '')
    if ([string]::IsNullOrWhiteSpace($token)) {
      throw 'El portapapeles esta vacio. Copia el token de GitHub y vuelve a ejecutar.'
    }
    Log 'Token tomado del portapapeles local de Windows sin mostrarlo.'
    return $token
  }

  $secure = Read-Host 'Pega el NUEVO token de GitHub aqui (no se mostrara)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function GitHubApi($Method, $Path, $Body = $null) {
  $uri = "https://api.github.com/repos/$Owner/$Repo$Path"
  $headers = @{
    Authorization = "Bearer $script:Token"
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
  }
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }
  $json = $Body | ConvertTo-Json -Depth 20 -Compress
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType 'application/json' -Body $json
}

function Should-IncludeFile($File) {
  $rel = $File.FullName.Substring($Root.Length + 1).Replace('\', '/')
  $parts = $rel -split '/'
  $excludedDirs = @('.git', '.netlify', 'node_modules', 'tools', 'sql', 'tmp-ops-auth-function')
  foreach ($part in $parts) {
    if ($excludedDirs -contains $part) { return $false }
    if ($part -like 'tmp-*') { return $false }
  }

  $name = $File.Name
  $excludedNames = @(
    'readme-deploy.md',
    'plantilla-inventario-tixuz.csv',
    'NOTAS_V66_1_DOMINIO.txt'
  )
  if ($excludedNames -contains $name) { return $false }

  $excludedPatterns = @(
    '*.zip',
    '*.bak*',
    '*.sql',
    'build-response*.json',
    'digest-deploy-response.json',
    'upload-*-response*.txt',
    'upload-*.txt',
    'NOTAS_*.txt'
  )
  foreach ($pattern in $excludedPatterns) {
    if ($name -like $pattern) { return $false }
  }

  if ($rel.StartsWith('youtube-library-output/')) {
    return $rel -like 'youtube-library-output/transcripts/txt/*.txt'
  }

  return $true
}

Set-Location $Root
Remove-Item -LiteralPath $LogPath -ErrorAction SilentlyContinue
Log "Preparando subida de $Root a https://github.com/$Owner/$Repo"

$script:Token = Get-PlainToken
try {
  $repoInfo = GitHubApi GET ''
  Log "Repo detectado: $($repoInfo.full_name), rama: $Branch, privado: $($repoInfo.private)"

  $ref = GitHubApi GET "/git/ref/heads/$Branch"
  $baseCommitSha = $ref.object.sha
  $baseCommit = GitHubApi GET "/git/commits/$baseCommitSha"
  $baseTreeSha = $baseCommit.tree.sha
  Log "Commit base: $baseCommitSha"

  $existingTree = GitHubApi GET "/git/trees/$baseTreeSha`?recursive=1"
  $existingPaths = @{}
  foreach ($item in $existingTree.tree) {
    if ($item.type -eq 'blob') { $existingPaths[$item.path] = $true }
  }

  $files = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { Should-IncludeFile $_ }
  $localPaths = @{}
  foreach ($file in $files) {
    $localPaths[$file.FullName.Substring($Root.Length + 1).Replace('\', '/')] = $true
  }
  Log "Archivos locales que se subiran: $($files.Count)"

  $treeEntries = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($file in $files) {
    $i++
    $path = $file.FullName.Substring($Root.Length + 1).Replace('\', '/')
    if ($i % 20 -eq 0) { Log "Subiendo blobs: $i / $($files.Count)" }
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    $blob = GitHubApi POST '/git/blobs' @{
      content = [Convert]::ToBase64String($bytes)
      encoding = 'base64'
    }
    $treeEntries.Add(@{
      path = $path
      mode = '100644'
      type = 'blob'
      sha = $blob.sha
    })
  }

  $deleted = 0
  foreach ($path in $existingPaths.Keys) {
    if (-not $localPaths.ContainsKey($path)) {
      $deleted++
      $treeEntries.Add(@{
        path = $path
        mode = '100644'
        type = 'blob'
        sha = $null
      })
    }
  }
  if ($deleted) { Log "Archivos antiguos marcados para borrar del repo: $deleted" }

  $newTree = GitHubApi POST '/git/trees' @{
    base_tree = $baseTreeSha
    tree = $treeEntries.ToArray()
  }
  Log "Nuevo tree: $($newTree.sha)"

  $newCommit = GitHubApi POST '/git/commits' @{
    message = $CommitMessage
    tree = $newTree.sha
    parents = @($baseCommitSha)
  }
  Log "Nuevo commit: $($newCommit.sha)"

  GitHubApi PATCH "/git/refs/heads/$Branch" @{
    sha = $newCommit.sha
    force = $false
  } | Out-Null
  Log "Listo. Rama actualizada: https://github.com/$Owner/$Repo/tree/$Branch"
  Log "Commit: https://github.com/$Owner/$Repo/commit/$($newCommit.sha)"
  Write-Host ''
  Write-Host 'LISTO. Puedes cerrar esta ventana.' -ForegroundColor Green
  Write-Host "Log: $LogPath"
  if (-not $TokenFromClipboard) {
    Read-Host 'Enter para cerrar'
  }
} finally {
  $script:Token = $null
}
