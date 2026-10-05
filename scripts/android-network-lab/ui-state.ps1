# Read only the dedicated emulator's current UI, redacting password fields.
param([switch]$Api30)
$ErrorActionPreference = 'Stop'
$testAdb = Join-Path $PSScriptRoot '../../.artifacts/android-tools/sdk/platform-tools/adb.exe'
$testSerial = if ($Api30) { 'emulator-5582' } else { 'emulator-5580' }
$testName = if ($Api30) { 'DojiApiLab30' } else { 'DojiNetworkLab36' }
$deviceName = & $testAdb -s $testSerial emu avd name
if ($deviceName[0].Trim() -ne $testName) { throw 'Wrong emulator' }
& $testAdb -s $testSerial shell uiautomator dump /sdcard/doji-test-state.xml | Out-Null
[xml]$testUi = (& $testAdb -s $testSerial shell cat /sdcard/doji-test-state.xml)
$testUi.SelectNodes('//node') | Where-Object { $_.text -or $_.'content-desc' -or $_.class -eq 'android.widget.EditText' } | ForEach-Object {
  [PSCustomObject]@{Text=if($_.password -eq 'true'){'[password]'}else{$_.text}; Description=$_.'content-desc'; Class=$_.class; Focused=$_.focused; Bounds=$_.bounds}
} | ConvertTo-Json -Compress
