@echo off
echo Building Linux executable...
set GOOS=linux
set GOARCH=amd64
set CGO_ENABLED=0
go build -o schedule_linux main.go
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo Done: schedule_linux
pause
