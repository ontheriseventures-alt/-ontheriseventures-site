$root = $PSScriptRoot
$port = 5500
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$port/"

$mime = @{
  ".html" = "text/html"; ".css" = "text/css"; ".js" = "application/javascript"
  ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".png" = "image/png"
  ".svg" = "image/svg+xml"; ".xml" = "application/xml"; ".txt" = "text/plain"
  ".ico" = "image/x-icon"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  $path = $req.Url.LocalPath
  if ($path -eq "/") { $path = "/index.html" }
  $filePath = Join-Path $root ($path.TrimStart("/") -replace "/", "\")
  if (Test-Path $filePath -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($filePath)
    $contentType = $mime[$ext]
    if (-not $contentType) { $contentType = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $res.ContentType = $contentType
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }
  $res.OutputStream.Close()
}
