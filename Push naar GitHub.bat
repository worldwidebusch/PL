@echo off
cd /d "%~dp0"
echo Pushing ProLinker redesign naar GitHub...
git add -A
git commit -m "Opdracht detail page, AI-censored CV pipeline, WhatsApp-agent messaging with job filter and quick actions, dashboard/transactions/profile redesigns, floating header layout, person-identity avatars"
git push origin main
echo.
echo Klaar. Controleer hierboven of de push is gelukt.
pause
