@echo off
echo Agora - Windows Install
echo =======================

if not exist venv (
    echo Creating Python virtual environment...
    python -m venv venv
) else (
    echo Virtual environment already exists.
)

echo Installing Python dependencies...
call venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt
echo Python dependencies installed.

echo Installing frontend dependencies...
cd frontend
call npm install --silent
echo Building frontend...
call npm run build
cd ..
echo Frontend built.

echo.
echo All done! Run start.bat to launch Agora.
pause
