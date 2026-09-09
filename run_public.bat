@echo off
echo ========================================================
echo   Starting VoiceShield AI + Public Internet Tunnel
echo ========================================================
echo.
start "VoiceShield AI Backend" python run.py
timeout /t 3 /nobreak >nul
echo Starting Public Tunnel...
.\bin\cloudflared.exe tunnel --url http://127.0.0.1:8000
