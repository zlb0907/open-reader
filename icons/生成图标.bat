@echo off
setlocal
set "JDK=%LOCALAPPDATA%\OpenReaderToolchain\jdk"
if not exist "%JDK%\bin\javac.exe" echo JDK not found: %JDK% & exit /b 1
pushd "%~dp0.."
set "ROOT=%CD%"
popd
if not exist "%~dp0out" mkdir "%~dp0out"
"%JDK%\bin\javac.exe" -encoding UTF-8 -d "%~dp0out" "%~dp0MakeIcons.java" || exit /b 1
"%JDK%\bin\java.exe" -cp "%~dp0out" MakeIcons "%~dp0source.jpg" "%ROOT%" || exit /b 1
echo Icons regenerated.
exit /b 0
