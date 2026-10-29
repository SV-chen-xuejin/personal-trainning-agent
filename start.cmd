@echo off
cd /d "%~dp0"
echo Starting Fitness Assistant...
echo Open http://127.0.0.1:8787 after the server starts.
echo Keep this window open. Press Ctrl+C to stop.
node --env-file-if-exists=.env server.mjs
pause
