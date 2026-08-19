# GOMS Demo Startup Script
Write-Host "Starting GOMS Demo..." -ForegroundColor Cyan
Write-Host ""

# Start Django backend
Write-Host "Starting Django backend on http://localhost:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python manage.py runserver"

Start-Sleep -Seconds 2

# Start React frontend
Write-Host "Starting React frontend on http://localhost:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location frontend; npm run dev"

Write-Host ""
Write-Host "Both servers starting..." -ForegroundColor Cyan
Write-Host "Open http://localhost:5173 in your browser" -ForegroundColor Yellow
Write-Host ""
Write-Host "Demo credentials:" -ForegroundColor White
Write-Host "  Counter Staff : staff@goms.com / staff123" -ForegroundColor Gray
Write-Host "  Manager       : manager@goms.com / manager123" -ForegroundColor Gray
Write-Host "  Admin         : admin@goms.com / admin123" -ForegroundColor Gray
