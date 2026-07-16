@echo off
title GLPI Control Center - Servidor
color 0A

echo.
echo ========================================
echo   GLPI CONTROL CENTER - SERVIDOR
echo ========================================
echo.

REM Mata processos PHP antigos (se houver)
echo Finalizando processos PHP anteriores...
taskkill /F /IM php.exe 2>nul

REM Aguarda 2 segundos
timeout /t 2 /nobreak >nul

echo.
echo Iniciando servidores...
echo.

REM ============================================================
REM BACKEND - Porta 9090
REM ============================================================
echo [1/2] Iniciando Backend (porta 9090)...

start "GLPI Backend" /MIN cmd /k "Z: && cd \_Softs\GLPI-Control-Center\Backend\api && php -S 0.0.0.0:9090 endpoints.php"

REM Aguarda 3 segundos
timeout /t 3 /nobreak >nul

REM ============================================================
REM FRONTEND - Porta 4000
REM ============================================================
echo [2/2] Iniciando Frontend (porta 4000)...

start "GLPI Frontend" /MIN cmd /k "Z: && cd \_Softs\GLPI-Control-Center\Frontend && php -S 0.0.0.0:4000"

echo.
echo ========================================
echo   SERVIDORES INICIADOS COM SUCESSO!
echo ========================================
echo.
echo Backend:  http://localhost:9090
echo Frontend: http://localhost:4000
echo.
echo Acesse de qualquer PC da rede em:
echo http://192.168.1.20:4000
echo.
echo ========================================
echo   IMPORTANTE!
echo ========================================
echo.
echo As janelas minimizadas NAO podem ser fechadas!
echo Elas mantem os servidores rodando.
echo.
echo Para parar os servidores:
echo 1. Abra as janelas minimizadas
echo 2. Pressione Ctrl+C em cada uma
echo.
echo ========================================
echo.
echo Pressione qualquer tecla para abrir o painel...
pause >nul

REM Abre o navegador
start http://localhost:4000

echo.
echo Servidores estao rodando em segundo plano.
echo NAO FECHE as janelas minimizadas!
echo.
pause