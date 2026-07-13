@echo off
REM ProLinker - double-click to preview the website locally with demo data.
REM Requires Node.js (you already use it for "npm run build").
cd /d "%~dp0"
echo Starting ProLinker preview (demo mode, no backend needed)...
echo.
node "preview-server.mjs"
echo.
echo Preview stopped. You can close this window.
pause
