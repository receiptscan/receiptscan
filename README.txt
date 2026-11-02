RECEISCAN WEBSITE
=================
Parehong api.php at database ng mobile app ang gamit nito, kaya ang
na-scan sa app ay lumalabas dito (kusang nagre-refresh kada 30 segundo).

PAANO I-UPLOAD (Hostinger hPanel)
1. Buksan ang js/config.js at palitan ang APP_TOKEN ng KAPAREHONG
   app_token na nasa config.php (at sa appToken ng main.dart).
2. hPanel > File Manager > public_html
3. Gumawa ng folder na "web" at i-upload dito ang laman ng zip:
     public_html/web/index.html
     public_html/web/css/style.css
     public_html/web/js/config.js, api.js, app.js
     public_html/web/img/logo.png
4. Buksan sa browser:  https://<domain mo>/web/

MGA FILE NA PUWEDENG I-EDIT
- css/style.css  : kulay, font, laki, itsura (nasa itaas ang mga kulay)
- js/app.js      : laman ng bawat page (Dashboard, Transactions, Reports,
                   Activity Logs, Accounts, Profile) at Login
- js/config.js   : API_URL, APP_TOKEN, REFRESH_SECONDS, PRIVACY_CONTACT
- img/logo.png   : logo

TANDAAN
- Ang pag-scan at paggawa ng account ay sa mobile app pa rin.
- Isang device lang kada account: kapag naka-login ang account sa phone,
  hindi ito makakapag-login sa website (at kabaligtaran) hangga't hindi
  nag-logout o lumipas ang 1 minuto matapos isara ang app.
