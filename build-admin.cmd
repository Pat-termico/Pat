@echo off
setlocal
set ELECTRON_CACHE=d:\PAT\.electron-cache
set ELECTRON_BUILDER_CACHE=d:\PAT\.electron-builder-cache
set DEBUG=electron-builder,electron-rebuild
set CSC_IDENTITY_AUTO_DISCOVERY=false
cd /d d:\PAT
if exist release rmdir /s /q release
call npm.cmd run lint > d:\PAT\.build-admin.log 2> d:\PAT\.build-admin.err.log
if errorlevel 1 ( echo EXIT=%ERRORLEVEL% > d:\PAT\.build-admin.exit & exit /b %ERRORLEVEL% )
call npm.cmd run build:renderer >> d:\PAT\.build-admin.log 2>> d:\PAT\.build-admin.err.log
if errorlevel 1 ( echo EXIT=%ERRORLEVEL% > d:\PAT\.build-admin.exit & exit /b %ERRORLEVEL% )
call d:\PAT\node_modules\.bin\electron-builder.cmd --win --x64 --publish never >> d:\PAT\.build-admin.log 2>> d:\PAT\.build-admin.err.log
echo EXIT=%ERRORLEVEL% > d:\PAT\.build-admin.exit
