@echo off
chcp 65001 >nul
title VIGOUR FILM - 导入新作品
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 Node.js。请先安装 Node.js 后再运行本工具：
  echo https://nodejs.org/zh-cn
  echo.
  pause
  exit /b 1
)
node tools\import.mjs
echo.
pause
