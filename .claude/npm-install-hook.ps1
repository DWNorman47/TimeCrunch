param()
$json = [Console]::In.ReadToEnd()
try { $data = $json | ConvertFrom-Json } catch { exit 0 }
$f = $data.tool_input.file_path
if (-not $f) { exit 0 }

$node = 'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe'
$npm  = 'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Microsoft\VisualStudio\NodeJs\node_modules\npm\bin\npm-cli.js'

if ($f -match 'server[/\\]package\.json$') {
    Set-Location 'C:\Users\v-normand\Workspaces\TimeCrunch_Claude\server'
    & $node $npm install
} elseif ($f -match 'client[/\\]package\.json$') {
    Set-Location 'C:\Users\v-normand\Workspaces\TimeCrunch_Claude\client'
    & $node $npm install
}
