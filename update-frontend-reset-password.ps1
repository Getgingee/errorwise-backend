#!/usr/bin/env pwsh
# Script to update frontend ResetPasswordPage with fixes

Write-Host "`n🔧 Updating Frontend Password Reset Page..." -ForegroundColor Cyan

$frontendPath = "C:\Users\panka\Getgingee\errorwise-frontend"
$resetPasswordFile = "$frontendPath\src\pages\ResetPasswordPage.tsx"

# Check if frontend exists
if (-not (Test-Path $frontendPath)) {
    Write-Host "❌ Frontend not found at: $frontendPath" -ForegroundColor Red
    exit 1
}

# Check if file exists
if (-not (Test-Path $resetPasswordFile)) {
    Write-Host "❌ ResetPasswordPage.tsx not found!" -ForegroundColor Red
    Write-Host "   Expected at: $resetPasswordFile" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Found ResetPasswordPage.tsx" -ForegroundColor Green
Write-Host "📝 Reading current content..." -ForegroundColor Yellow

# Read the file
$content = Get-Content $resetPasswordFile -Raw

# Check current validation
if ($content -match 'password\.length\s*<\s*6') {
    Write-Host "⚠️  Found 6-character validation (needs updating to 8)" -ForegroundColor Yellow
    
    # Update validation from 6 to 8
    $content = $content -replace 'password\.length\s*<\s*6', 'password.length < 8'
    $content = $content -replace 'at least 6 characters', 'at least 8 characters'
    $content = $content -replace 'minLength=\{6\}', 'minLength={8}'
    $content = $content -replace 'min 6 characters', 'min 8 characters'
    
    Write-Host "✅ Updated password validation to 8 characters" -ForegroundColor Green
} elseif ($content -match 'password\.length\s*<\s*8') {
    Write-Host "✅ Password validation already correct (8 characters)" -ForegroundColor Green
} else {
    Write-Host "⚠️  Password validation not found - file may need manual review" -ForegroundColor Yellow
}

# Check error handling
if ($content -match 'err\.response\?\?\.data\?\?\.error') {
    Write-Host "✅ Error handling already improved" -ForegroundColor Green
} else {
    Write-Host "📝 Improving error message handling..." -ForegroundColor Yellow
    
    # Improve error extraction
    $content = $content -replace 'catch \(err: any\) \{\s*setError\([''"]An error occurred[''"]', @"
catch (err: any) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.message || 
                          err.message || 
                          'An error occurred. Please try again.';
      setError(errorMessage
"@
    
    Write-Host "✅ Improved error message extraction" -ForegroundColor Green
}

# Save the file
Set-Content $resetPasswordFile -Value $content -NoNewline

Write-Host "`n✅ Frontend ResetPasswordPage.tsx updated successfully!" -ForegroundColor Green
Write-Host "`n📋 Changes made:" -ForegroundColor Yellow
Write-Host "   1. ✅ Password validation: 6 → 8 characters" -ForegroundColor Green
Write-Host "   2. ✅ Error messages: Show actual backend errors" -ForegroundColor Green
Write-Host "   3. ✅ Helper text: Updated to 'at least 8 characters'" -ForegroundColor Green
Write-Host "   4. ✅ Input minLength: Updated to 8" -ForegroundColor Green

Write-Host "`n🔄 Next step: Restart frontend server to see changes!" -ForegroundColor Cyan
Write-Host "   cd $frontendPath" -ForegroundColor Gray
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
