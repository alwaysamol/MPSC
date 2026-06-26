@echo off
REM Builds (if needed) and runs the MPSC Prep app on http://localhost:8080
setlocal
cd /d "%~dp0"

if not exist "target\mpsc-prep.jar" (
    echo Building the application first...
    call build.cmd
)

echo.
echo Starting MPSC Prep on http://localhost:8080  (Ctrl+C to stop)
echo First run may take a couple of minutes while the embedded MongoDB binary downloads.
echo.
java -jar target\mpsc-prep.jar
endlocal
