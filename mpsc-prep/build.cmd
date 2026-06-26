@echo off
REM Builds the MPSC Prep app. Uses the locally downloaded Maven if present,
REM otherwise falls back to a Maven on your PATH.
setlocal
set "LOCAL_MVN=%~dp0..\.tools\apache-maven-3.9.9\bin\mvn.cmd"

if exist "%LOCAL_MVN%" (
    call "%LOCAL_MVN%" clean package -DskipTests
) else (
    call mvn clean package -DskipTests
)
endlocal
