@echo off
setlocal EnableExtensions

set "REPO_DIR=%~dp0"
for %%I in ("%REPO_DIR%.") do set "REPO_DIR=%%~fI"
pushd "%REPO_DIR%" || exit /b 1

if not exist "node_modules\" (
    call npm install || goto :error
)

call npm run package || goto :error

popd
exit /b 0

:error
popd
exit /b 1
