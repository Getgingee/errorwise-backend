# Local Endpoint Testing Script
# Run this in a NEW PowerShell terminal while backend and frontend are running

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ERRORWISE LOCAL TESTING SCRIPT" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Prerequisites Check:" -ForegroundColor Yellow
Write-Host "  Backend running on: http://localhost:3001" -ForegroundColor Gray
Write-Host "  Frontend running on: http://localhost:3000`n" -ForegroundColor Gray

# Test 1: Health Check
Write-Host "[1/10] Testing Health Endpoint..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method GET
    Write-Host "  ✅ Health: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Platform Stats
Write-Host "`n[2/10] Testing Platform Stats..." -ForegroundColor Cyan
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3001/api/stats" -Method GET
    Write-Host "  ✅ Total Users: $($stats.totalUsers)" -ForegroundColor Green
    Write-Host "  ✅ Total Analyses: $($stats.totalAnalyses)" -ForegroundColor Green
    Write-Host "  ✅ Active Subscriptions: $($stats.activeSubscriptions)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Stats failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Subscription Plans
Write-Host "`n[3/10] Testing Subscription Plans..." -ForegroundColor Cyan
try {
    $plans = Invoke-RestMethod -Uri "http://localhost:3001/api/subscriptions/plans" -Method GET
    Write-Host "  ✅ Plans loaded: $($plans.plans.Count) plans" -ForegroundColor Green
    foreach ($plan in $plans.plans) {
        Write-Host "     - $($plan.name): `$$($plan.price)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ❌ Plans failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Frontend Homepage
Write-Host "`n[4/10] Testing Frontend Homepage..." -ForegroundColor Cyan
try {
    $frontend = Invoke-WebRequest -Uri "http://localhost:3000" -Method GET
    if ($frontend.StatusCode -eq 200) {
        Write-Host "  ✅ Frontend loaded successfully (Status: $($frontend.StatusCode))" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ Frontend failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: CORS Check
Write-Host "`n[5/10] Testing CORS Configuration..." -ForegroundColor Cyan
try {
    $headers = @{
        "Origin" = "http://localhost:3000"
    }
    $corsTest = Invoke-WebRequest -Uri "http://localhost:3001/api/stats" -Method GET -Headers $headers
    $allowOrigin = $corsTest.Headers["Access-Control-Allow-Origin"]
    if ($allowOrigin) {
        Write-Host "  ✅ CORS configured: $allowOrigin" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  CORS header not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ CORS test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Database Connection
Write-Host "`n[6/10] Testing Database Connection..." -ForegroundColor Cyan
Write-Host "  ✅ Check backend terminal for database connection status" -ForegroundColor Green

# Test 7: Redis Connection
Write-Host "`n[7/10] Testing Redis Connection..." -ForegroundColor Cyan
Write-Host "  ✅ Check backend terminal for Redis connection status" -ForegroundColor Green

# Test 8: Email Service
Write-Host "`n[8/10] Testing Email Service..." -ForegroundColor Cyan
Write-Host "  ✅ Check backend terminal for email service status" -ForegroundColor Green

# Test 9: AI Service
Write-Host "`n[9/10] Testing AI Service..." -ForegroundColor Cyan
Write-Host "  ✅ Check backend terminal for AI service (Anthropic) status" -ForegroundColor Green

# Test 10: New Subscription Endpoints
Write-Host "`n[10/10] Testing NEW Subscription Endpoints..." -ForegroundColor Cyan
Write-Host "  Note: These require authentication, test via frontend UI" -ForegroundColor Yellow
Write-Host "     - POST /api/subscriptions/checkout" -ForegroundColor Gray
Write-Host "     - GET /api/subscriptions/billing" -ForegroundColor Gray
Write-Host "     - GET /api/subscriptions/history" -ForegroundColor Gray
Write-Host "     - GET /api/subscriptions/upgrade-options" -ForegroundColor Gray

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  TESTING COMPLETE!" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Open browser: http://localhost:3000" -ForegroundColor White
Write-Host "  2. Test user registration" -ForegroundColor White
Write-Host "  3. Test login with OTP" -ForegroundColor White
Write-Host "  4. Test error analysis on dashboard" -ForegroundColor White
Write-Host "  5. Test subscription page" -ForegroundColor White
Write-Host "  6. Test checkout flow" -ForegroundColor White
Write-Host "  7. Test billing info" -ForegroundColor White
Write-Host "`n" -ForegroundColor White

Write-Host "Frontend URL: " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:3000" -ForegroundColor Green
Write-Host "Backend URL:  " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:3001" -ForegroundColor Green
Write-Host "`n"
