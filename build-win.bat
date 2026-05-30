@echo off
echo Building Windows executable...
set GOOS=windows
set GOARCH=amd64
go build -o schedule_windows.exe main.go
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo Done: schedule_windows.exe
pause
