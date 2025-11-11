@echo off
REM Add Performance Indexes to Railway Database
REM Usage: run-railway-indexes.bat

echo.
echo ===================================================================
echo  Add Performance Indexes to Railway Production Database
echo ===================================================================
echo.
echo This script will connect to your Railway database and add indexes.
echo.
echo IMPORTANT: Get your Railway DATABASE_URL:
echo   1. Go to https://railway.app
echo   2. Open your errorwise-backend project
echo   3. Click on PostgreSQL service
echo   4. Copy the DATABASE_URL (starts with postgresql://)
echo.
echo ===================================================================
echo.

set /p RAILWAY_DB="Paste Railway DATABASE_URL here: "

if "%RAILWAY_DB%"=="" (
    echo.
    echo ERROR: No DATABASE_URL provided!
    echo Please run the script again and paste your Railway URL.
    pause
    exit /b 1
)

echo.
echo Testing connection...
node -e "const {Sequelize} = require('sequelize'); const s = new Sequelize('%RAILWAY_DB%', {dialect:'postgres',logging:false,dialectOptions:{ssl:{require:true,rejectUnauthorized:false}}}); s.authenticate().then(() => { console.log('✅ Connected to Railway!'); process.exit(0); }).catch(e => { console.error('❌ Connection failed:', e.message); process.exit(1); });"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Could not connect to Railway database!
    echo Please check your DATABASE_URL and try again.
    pause
    exit /b 1
)

echo.
echo Adding indexes...
echo.

node add-railway-indexes-direct.js "%RAILWAY_DB%"

echo.
echo Done!
pause
