@echo off
chcp 65001 > nul
cd /d "%~dp0"
gh auth login --hostname github.com --git-protocol https --web --scopes gist
pause
