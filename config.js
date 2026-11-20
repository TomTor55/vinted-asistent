// Nastavenia appky. googleClientId doplníš po vytvorení projektu v Google Cloud
// (postup v NAVOD-NASTAVENIE.md). Client ID nie je tajný údaj.
window.APP_CONFIG = {
  googleClientId: "508005644968-hg6q5pbid9bsuth508u9r5l8jmb8f84m.apps.googleusercontent.com",
  rootFolderName: "Vinted-asistent",
  queueFolderName: "Fronta",
  // Komu patria inzeráty – každá osoba má na Drive vlastný podpriečinok (a na PC vlastný Vinted účet).
  // id musí sedieť s UCTY v pc/config.mjs.
  osoby: [
    { id: "manzelka", nazov: "Manželka", priecinok: "Manzelka" },
    { id: "tomas", nazov: "Tomáš", priecinok: "Tomas" }
  ],
  maxPhotos: 20,
  photoMaxSide: 1600,
  photoQuality: 0.85,
  speechLang: "sk-SK",
  version: "1.2.0"
};
