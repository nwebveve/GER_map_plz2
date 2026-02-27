param(
  [int]$Port = 8080,
  [string]$Root = $PSScriptRoot,
  [string]$DefaultDocument = "map.html"
)

$ErrorActionPreference = "Stop"

$rootFull = [System.IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath $rootFull)) {
  throw "Root-Pfad existiert nicht: $rootFull"
}

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Server gestartet auf $prefix"
Write-Host "Root: $rootFull"
Write-Host "Stoppen mit Ctrl+C"

$mimeTypes = @{
  ".html"   = "text/html; charset=utf-8"
  ".js"     = "application/javascript; charset=utf-8"
  ".css"    = "text/css; charset=utf-8"
  ".json"   = "application/json; charset=utf-8"
  ".geojson"= "application/geo+json; charset=utf-8"
  ".svg"    = "image/svg+xml"
  ".png"    = "image/png"
  ".jpg"    = "image/jpeg"
  ".jpeg"   = "image/jpeg"
  ".ico"    = "image/x-icon"
  ".txt"    = "text/plain; charset=utf-8"
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $rawPath = $request.Url.AbsolutePath
      if ([string]::IsNullOrWhiteSpace($rawPath) -or $rawPath -eq "/") {
        $rawPath = "/$DefaultDocument"
      }

      $decodedPath = [System.Uri]::UnescapeDataString($rawPath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($decodedPath)) {
        $decodedPath = $DefaultDocument
      }

      $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootFull $decodedPath))

      if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        continue
      }

      if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        continue
      }

      $ext = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
      if ($mimeTypes.ContainsKey($ext)) {
        $response.ContentType = $mimeTypes[$ext]
      } else {
        $response.ContentType = "application/octet-stream"
      }

      $bytes = [System.IO.File]::ReadAllBytes($candidate)
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    catch {
      $response.StatusCode = 500
      $errorBytes = [System.Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")
      $response.OutputStream.Write($errorBytes, 0, $errorBytes.Length)
    }
    finally {
      $response.OutputStream.Close()
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
