@echo off
setlocal EnableExtensions

set "REPO_DIR=%~dp0"
for %%I in ("%REPO_DIR%.") do set "REPO_DIR=%%~fI"
pushd "%REPO_DIR%" || exit /b 1
set "ENABLE_LOG=0"
if /i "%~1"=="--log" (
    set "ENABLE_LOG=1"
    shift /1
)
if /i "%~1"=="/log" (
    set "ENABLE_LOG=1"
    shift /1
)
set "WORKSPACE_DIR=%~1"
if "%WORKSPACE_DIR%"=="" set "WORKSPACE_DIR=%REPO_DIR%"
for %%I in ("%WORKSPACE_DIR%") do set "WORKSPACE_DIR=%%~fI"
set "LOG_FILE=%REPO_DIR%\launch-vscode-extension.log"

if "%ENABLE_LOG%"=="1" (
    set "MARKDOWN_WYSIWYG_LOG=1"
    (
        echo [%date% %time%] Launching Markdown WYSIWYG extension
        echo Extension path: %REPO_DIR%
        echo Workspace path: %WORKSPACE_DIR%
        echo VS Code command: code --log trace --new-window --extensionDevelopmentPath="%REPO_DIR%" "%WORKSPACE_DIR%"
    ) > "%LOG_FILE%"
)

if not exist "node_modules\" (
    if "%ENABLE_LOG%"=="1" (
        call npm install >> "%LOG_FILE%" 2>&1 || goto :error
    ) else (
        call npm install || goto :error
    )
)

if "%ENABLE_LOG%"=="1" (
    call npm run build >> "%LOG_FILE%" 2>&1 || goto :error
    call code --log trace --new-window --extensionDevelopmentPath="%REPO_DIR%" "%WORKSPACE_DIR%" >> "%LOG_FILE%" 2>&1
) else (
    call npm run build || goto :error
    call code --new-window --extensionDevelopmentPath="%REPO_DIR%" "%WORKSPACE_DIR%"
)

popd
exit /b 0

:error
if "%ENABLE_LOG%"=="1" echo Failed. See "%LOG_FILE%" for details.
popd
exit /b 1
