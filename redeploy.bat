@echo off
echo.
echo ===== Deploying Property App =====
echo.

cd /d C:\Users\brian\OneDrive\Desktop\property

echo.
echo Adding changes...
git add .

echo.
echo Committing...
git commit -m "Auto deploy update"

echo.
echo Pushing to GitHub...
git push

echo.
echo Deploying to Vercel...
vercel --prod

echo.
echo ===== Deployment Complete =====
pause