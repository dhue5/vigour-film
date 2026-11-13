@echo off
chcp 65001 >nul
title VIGOUR FILM - 重建数据
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 Node.js。请先安装 Node.js：
  echo https://nodejs.org/zh-cn
  echo.
  pause
  exit /b 1
)
node tools\build-data.mjs
echo.
pause
