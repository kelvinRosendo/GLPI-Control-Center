@echo off
setlocal
title GLPI Control Center - Local
color 0B

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%Backend\api"
set "FRONTEND_DIR=%ROOT%Frontend"

echo.
echo ========================================
echo   GLPI CONTROL CENTER - MODO LOCAL
echo ========================================
echo.

echo Finalizando processos PHP anteriores...
taskkill /F /IM php.exe 2>nul
timeout /t 2 /nobreak >nul

echo Iniciando backend local em http://localhost:8080 ...
start "GLPI Backend Local" cmd /k "cd /d ""%BACKEND_DIR%"" && php -S localhost:8080 endpoints.php"

timeout /t 2 /nobreak >nul

echo Iniciando frontend local em http://localhost:3000 ...
start "GLPI Frontend Local" cmd /k "cd /d ""%FRONTEND_DIR%"" && php -S localhost:3000"

timeout /t 2 /nobreak >nul

echo.
echo Backend:  http://localhost:8080
echo Frontend: http://localhost:3000/?mode=local
echo.
echo Se quiser usar as configuracoes locais, copie:
echo   Backend\.env.local.example -> Backend\.env.local
echo.
echo Abrindo painel no navegador...
start http://localhost:3000/?mode=local

endlocal
