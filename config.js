// =============================================================
// RECEISCAN WEBSITE - CONFIG
// Ito lang ang kailangang palitan bago i-upload.
// =============================================================
window.RECEISCAN_CONFIG = {
  // Kung nasaan ang api.php. Kapag nasa iisang domain ang website at ang
  // api.php (hal. public_html/web/ at public_html/api.php), "/api.php" lang.
  // Buong link para gumana rin kapag binuksan sa computer (Live Server)
  API_URL: 'https://orange-dunlin-410464.hostingersite.com/api.php',

  // KAPAREHO ng app_token sa config.php (at ng appToken sa main.dart).
  APP_TOKEN: '6ee116e2f51da1e8fcf4cd9678fe620008cffad500016c49',

  // Ilang segundo bago kusang kunin ulit ang data (para lumabas agad ang
  // mga bagong scan mula sa app)
  REFRESH_SECONDS: 30,

  // Contact para sa Privacy Notice (blangko = "the Owner of your business")
  PRIVACY_CONTACT: '',
};
