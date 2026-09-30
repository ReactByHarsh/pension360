$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolRoot = Join-Path $taskRoot '.local/tools/postgres18'
$archivePath = Join-Path $taskRoot '.local/tools/postgresql-18.6.zip'
if (-not (Test-Path -LiteralPath (Join-Path $toolRoot 'pgsql/bin/pg_ctl.exe'))) {
  if (-not (Test-Path -LiteralPath $archivePath)) { throw 'Download the official PostgreSQL 18.6 Windows x64 binary archive to .local/tools/postgresql-18.6.zip first, or use Docker Compose.' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    foreach ($entry in $archive.Entries) {
      if ($entry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or $entry.FullName.EndsWith('/')) { continue }
      $target = [IO.Path]::GetFullPath((Join-Path $toolRoot $entry.FullName))
      if (-not $target.StartsWith($toolRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path leaves the test folder' }
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  } finally { $archive.Dispose() }
}
$bin = Join-Path $toolRoot 'pgsql/bin'
$data = Join-Path $taskRoot '.local/postgres-data'
$passwordPath = Join-Path $taskRoot '.local/test-db-password'
if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
  [IO.File]::WriteAllText($passwordPath, ('local-test-' + [Guid]::NewGuid().ToString('N')))
  & (Join-Path $bin 'initdb.exe') -D $data --username=pension360 --pwfile=$passwordPath --auth-host=scram-sha-256 --auth-local=scram-sha-256 --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed' }
}
$dbPassword = [IO.File]::ReadAllText($passwordPath).Trim()
$dbUrl = 'postgres://pension360:' + $dbPassword + '@127.0.0.1:55432/postgres'
[IO.File]::WriteAllText((Join-Path $taskRoot '.local/test-db-url'), $dbUrl)
& (Join-Path $bin 'pg_ctl.exe') -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  $log = Join-Path $taskRoot '.local/postgres.log'
  $process = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+$log+'"'),'-o','"-p 55432 -h 127.0.0.1"','start') -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(30000)) { throw 'Timed out starting the test database' }
  if ($process.ExitCode -ne 0) { throw 'PostgreSQL did not start; inspect .local/postgres.log' }
}
& (Join-Path $bin 'postgres.exe') --version
Write-Output 'Temporary test PostgreSQL is ready on 127.0.0.1:55432. Connection string stored only in .local/test-db-url.'
