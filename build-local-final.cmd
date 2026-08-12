@echo off
setlocal
set ELECTRON_CACHE=%~dp0.electron-cache
set ELECTRON_BUILDER_CACHE=%~dp0.electron-builder-cache
set DEBUG=electron-builder,electron-rebuild
set CSC_IDENTITY_AUTO_DISCOVERY=false
cd /d %~dp0
if exist release rmdir /s /q release

echo ==== 1/3 Lint e Typecheck ====
call npm.cmd run lint
if errorlevel 1 ( exit /b %ERRORLEVEL% )

echo ==== 2/3 Build Renderer (Vite) ====
call npm.cmd run build:renderer
if errorlevel 1 ( exit /b %ERRORLEVEL% )

echo ==== 3/3 Build instalador + portable Windows (electron-builder --win --x64) ====
call "%~dp0node_modules\.bin\electron-builder.cmd" --win --x64 --publish never
set BUILDEXIT=%ERRORLEVEL%
echo.
echo ==== FIM DO BUILD. Exit=%BUILDEXIT%. Arquivos na pasta release: ====
if exist release dir /b release
exit /b %BUILDEXIT%
