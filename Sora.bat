@echo off
setlocal EnableExtensions
rem Double-click opens the standalone native EXE; no VBScript is used.
rem Use --debug to bootstrap/check Python, Node.js and Electron from source.
if /I not "%~1"=="--background" if /I not "%~1"=="--debug" (
  cd /d "%~dp0"
  if exist "%~dp0Sora.exe" (
    start "" "%~dp0Sora.exe"
    exit /b 0
  )
  echo [LOI] Khong tim thay Sora.exe. Hay chay Sora.bat --debug de kiem tra.
  pause
  exit /b 1
)
title Sora
cd /d "%~dp0"
chcp 65001 >nul
if /I "%~1"=="--debug" set "SORA_DEBUG=1"
echo ====================================================
echo                Sora - Trợ lý AI cá nhân
echo ====================================================
echo.
echo [Sora] Thư mục đang chạy: "%CD%"

rem Catch incomplete extraction before Electron opens an invisible overlay.
if not exist "src\renderer\index.html" (
  echo [LỖI] Thiếu src\renderer\index.html.
  echo       Hãy chép NỘI DUNG thư mục Sora trong ZIP vào cùng thư mục Sora.bat.
  goto :failed
)
if not exist "assets\sora\sora-full.png" (
  echo [LỖI] Thiếu assets\sora\sora-full.png của nhân vật RT.
  echo       Kiểm tra xem có chép nhầm thành H:\SORA\Sora\assets không.
  goto :failed
)

rem Electron must be installed once. A ZIP containing source code does not
rem include node_modules or Electron.exe.
where node >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Chưa tìm thấy Node.js. Tải bản LTS cho Windows tại:
  echo         https://nodejs.org/
  echo         Hãy mở lại PowerShell và chạy Sora.bat.
  goto :failed
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Chưa tìm thấy npm trong PATH. Hãy cài lại Node.js kèm npm.
  goto :failed
)
node -e "var v=process.versions.node.split('.').map(Number); process.exit(v[0]>22 || (v[0]===22 && v[1]>=12) ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Electron cần Node.js 22.12 trở lên. Hãy cài Node.js LTS.
  goto :failed
)

rem Reuse the user's existing Sora virtual environment if it was unpacked
rem over an old H:\SORA project. Only create a new one if it is absent.
set "SORA_PYTHON="
if not defined SORA_PYTHON if exist ".venv\Scripts\python.exe" set "SORA_PYTHON=%CD%\.venv\Scripts\python.exe"
if not defined SORA_PYTHON if exist "backend\.venv\Scripts\python.exe" set "SORA_PYTHON=%CD%\backend\.venv\Scripts\python.exe"
if not defined SORA_PYTHON if exist "..\.venv\Scripts\python.exe" set "SORA_PYTHON=%CD%\..\.venv\Scripts\python.exe"
if defined SORA_PYTHON (
  "%SORA_PYTHON%" -c "import sys" >nul 2>nul
  if errorlevel 1 set "SORA_PYTHON="
)
if not defined SORA_PYTHON (
  echo [Sora] Đang chuẩn bị môi trường Python...
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3.12 -m venv "backend\.venv" 2>nul
    if not exist "backend\.venv\Scripts\python.exe" py -3.11 -m venv "backend\.venv" 2>nul
    if not exist "backend\.venv\Scripts\python.exe" py -3 -m venv "backend\.venv" 2>nul
  )
  if not exist "backend\.venv\Scripts\python.exe" (
    where python >nul 2>nul
    if not errorlevel 1 python -m venv "backend\.venv"
  )
  if exist "backend\.venv\Scripts\python.exe" set "SORA_PYTHON=%CD%\backend\.venv\Scripts\python.exe"
)
if not defined SORA_PYTHON (
  echo [LỖI] Không tìm thấy Python 3.11 trở lên. Hãy cài Python rồi thử lại.
  goto :failed
)
echo [Sora] Môi trường Python: "%SORA_PYTHON%"

rem When Sora is extracted into an existing H:\SORA workspace, keep using
rem its established SQLite memory. Do not overwrite either database.
if not defined SORA_MEMORY_DB (
  if exist "data\memory.sqlite3" (
    set "SORA_MEMORY_DB=%CD%\data\memory.sqlite3"
  ) else (
    if exist "..\data\memory.sqlite3" (
      set "SORA_MEMORY_DB=%CD%\..\data\memory.sqlite3"
    ) else (
      set "SORA_MEMORY_DB=%CD%\backend\data\memory.sqlite3"
    )
  )
)
echo [Sora] Bộ nhớ SQLite: "%SORA_MEMORY_DB%"

"%SORA_PYTHON%" -c "import requests" >nul 2>nul
if errorlevel 1 (
  echo [Sora] Đang cài thư viện Python...
  "%SORA_PYTHON%" -m pip install -r "backend\requirements.txt"
  if errorlevel 1 goto :python_failed
)
"%SORA_PYTHON%" -c "import sys; sys.path.insert(0, 'backend'); import sora.bridge" 
if errorlevel 1 (
  echo [LỖI] Không tải được hệ thống Python của Sora.
  goto :failed
)
"%SORA_PYTHON%" -c "import pyautogui, pygetwindow, pyperclip, pytesseract, uiautomation" >nul 2>nul
if errorlevel 1 (
  echo [Sora] Đang cài các công cụ điều khiển Windows tùy chọn...
  "%SORA_PYTHON%" -m pip install -r "backend\requirements-agent.txt"
  if errorlevel 1 echo [CẢNH BÁO] Một số công cụ Windows chưa có; phần trò chuyện vẫn hoạt động.
)

rem Modern Electron installs the JS package first and downloads electron.exe
rem separately on demand. Skip npm ci when node_modules is already present.
if not exist "node_modules\electron\install.js" (
  echo [Sora] Chưa có các gói Electron. Đang cài đặt...
  echo        Lần đầu cần kết nối Internet. Hãy đợi một chút.
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 goto :node_failed
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [Sora] Đang tải chương trình Electron cho Windows...
  echo        Lần đầu có thể mất vài phút.
  node "node_modules\electron\install.js"
  if errorlevel 1 goto :electron_failed
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [LỖI] Vẫn thiếu electron.exe sau khi tải.
  echo       Hãy thử: node .\node_modules\electron\install.js
  echo       Gửi lại toàn bộ thông báo lỗi nếu vẫn không được.
  goto :failed
)

rem If Ollama is installed but asleep, start its local server once.
"%SORA_PYTHON%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:11434/api/tags',timeout=2)" >nul 2>nul
if errorlevel 1 (
  where ollama >nul 2>nul
  if not errorlevel 1 (
    echo [Sora] Đang khởi động Ollama trên máy...
    start "" /B ollama serve
    timeout /t 4 /nobreak >nul
  )
)
"%SORA_PYTHON%" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:11434/api/tags',timeout=2)" >nul 2>nul
if errorlevel 1 (
  echo [CẢNH BÁO] Ollama chưa phản hồi. Sora vẫn mở bằng ký ức và ví dụ đã duyệt.
  echo             Khi Ollama chạy lại, Sora sẽ tự sử dụng mô hình cục bộ.
) else (
  "%SORA_PYTHON%" -c "import json,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:11434/api/tags',timeout=3)); assert any(m.get('name')=='qwen2.5:1.5b' for m in d.get('models',[]))" >nul 2>nul
  if errorlevel 1 (
    echo [CẢNH BÁO] Chưa thấy mô hình qwen2.5:1.5b. Sora vẫn có chế độ ký ức cục bộ.
    echo             Khi có Internet, chạy: ollama pull qwen2.5:1.5b
  )
)

echo.
echo [Sora] Đang khởi động nhân vật RT và AI cục bộ...
set "ELECTRON_ENABLE_LOGGING=1"
call npm start
if errorlevel 1 (
  echo [LỖI] Electron đã đóng do lỗi khi chạy.
  goto :failed
)
echo.
echo [Sora] Đã đóng bình thường.
if /I not "%~1"=="--background" pause
exit /b 0

:python_failed
echo [LỖI] Cài thư viện Python thất bại.
goto :failed

:node_failed
echo [LỖI] npm ci thất bại. Hãy kiểm tra Internet và Node.js.
goto :failed

:electron_failed
echo [LỖI] Không tải được chương trình Electron.
echo       Hãy kiểm tra Internet rồi chạy lại Sora.bat.
goto :failed

:failed
echo.
echo [Sora] Hãy chụp lại thông báo lỗi phía trên để được hỗ trợ.
if /I not "%~1"=="--background" pause
exit /b 1
