@echo off
rem SPDX-License-Identifier: MPL-2.0 . Copyright (c) Aurelian-Risk
rem Serve this folder over http://127.0.0.1 and open Aurelian Lite in a browser.
rem
rem Why bother, when the page opens by double-click: a page opened from file:// may not
rem read a file lying next to it, so a model placed there has to be picked by hand every
rem time. Served from a local address it is found automatically - and a local language
rem model can answer on the same address without a second origin.
rem
rem   start.cmd                  serve the folder, open the browser
rem   start.cmd --llm            also run a local language model (llama.cpp)
rem   start.cmd --port 9000      use another port
rem   start.cmd --model x.gguf   use this model file instead of the one found here
rem
rem Nothing leaves the machine: the address is bound to 127.0.0.1, never to 0.0.0.0.
setlocal enabledelayedexpansion

set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"
set "PORT=8127"
set "LLM=0"
set "MODEL="

:args
if "%~1"=="" goto after_args
if /i "%~1"=="--llm" (set "LLM=1") & shift & goto args
if /i "%~1"=="--port" (set "PORT=%~2") & shift & shift & goto args
if /i "%~1"=="--model" (set "MODEL=%~2") & shift & shift & goto args
if /i "%~1"=="--help" goto help
echo unknown option: %~1  (try --help)
exit /b 2
:after_args

set "PAGE=index.html"
if not exist "%DIR%\index.html" set "PAGE=aurelian-lite.html"
if not exist "%DIR%\%PAGE%" (
  echo No aurelian-lite.html or index.html next to this script.
  exit /b 1
)
set "URL=http://127.0.0.1:%PORT%/%PAGE%"

if "%LLM%"=="1" goto with_llm

rem -- Just the page ----------------------------------------------------------------
echo Aurelian Lite on %URL%   ^(close this window to stop^)
start "" "%URL%"
where py >nul 2>&1 && (
  py -3 -m http.server %PORT% --bind 127.0.0.1 --directory "%DIR%"
  exit /b %errorlevel%
)
where python >nul 2>&1 && (
  python -m http.server %PORT% --bind 127.0.0.1 --directory "%DIR%"
  exit /b %errorlevel%
)
rem No Python: PowerShell can serve the folder well enough for one page.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$l=[System.Net.HttpListener]::new(); $l.Prefixes.Add('http://127.0.0.1:%PORT%/'); $l.Start();" ^
  "$root='%DIR%';" ^
  "while($l.IsListening){ $c=$l.GetContext(); $p=[Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'));" ^
  "if($p -eq ''){$p='%PAGE%'}; $f=Join-Path $root $p;" ^
  "if((Test-Path $f -PathType Leaf) -and ((Resolve-Path $f).Path).StartsWith((Resolve-Path $root).Path)){" ^
  "  $b=[IO.File]::ReadAllBytes($f); $e=[IO.Path]::GetExtension($f).ToLower();" ^
  "  $c.Response.ContentType = @{'.html'='text/html';'.js'='text/javascript';'.css'='text/css';'.json'='application/json';'.wasm'='application/wasm'}[$e];" ^
  "  if(-not $c.Response.ContentType){$c.Response.ContentType='application/octet-stream'};" ^
  "  $c.Response.ContentLength64=$b.Length; $c.Response.OutputStream.Write($b,0,$b.Length) }" ^
  "else { $c.Response.StatusCode=404 }; $c.Response.Close() }"
exit /b %errorlevel%

rem -- The page AND a language model, from one process ---------------------------------
rem llama-server serves static files with --path, so the page and the model answer on the
rem same address. One origin: no cross-origin request, and a model file next to the page
rem is readable.
:with_llm
set "SERVER=%DIR%\llama-server.exe"
if not exist "%SERVER%" (
  where llama-server.exe >nul 2>&1 && for /f "delims=" %%p in ('where llama-server.exe') do set "SERVER=%%p"
)
if not exist "%SERVER%" (
  echo No llama-server.exe found next to this script or on the PATH.
  echo Fetch a build for your machine from https://github.com/ggml-org/llama.cpp/releases
  echo and put llama-server.exe in %DIR%.
  exit /b 1
)

if "%MODEL%"=="" (
  for %%f in ("%DIR%\*.gguf") do if not defined MODEL set "MODEL=%%f"
)
if "%MODEL%"=="" (
  echo No .gguf model file found in %DIR% ^(and none given with --model^).
  echo A model is a large download - pick one deliberately rather than having a script
  echo guess for you. Anything llama.cpp reads will do; 7B-14B at q4 is the useful range.
  exit /b 1
)

rem Leave the machine usable while it works: one request at a time, a bounded context,
rem and one core kept free so the desktop keeps responding.
set /a THREADS=%NUMBER_OF_PROCESSORS%-1
if %THREADS% LSS 1 set THREADS=1

echo Aurelian Lite on %URL%   ^(close this window to stop^)
echo   model   %MODEL%
echo   threads %THREADS% of %NUMBER_OF_PROCESSORS% . context 4096 . one request at a time
start "" "%URL%"
"%SERVER%" --path "%DIR%" --host 127.0.0.1 --port %PORT% --model "%MODEL%" --threads %THREADS% --ctx-size 4096 --parallel 1
exit /b %errorlevel%

:help
for /f "tokens=1,* delims=:" %%a in ('findstr /n "^rem" "%~f0"') do @echo(%%b
exit /b 0
