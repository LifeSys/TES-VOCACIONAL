// Configuración de Firebase — reemplaza estos valores por los de TU proyecto
// (Firebase Console → Configuración del proyecto → Tus apps → SDK de Firebase → Config).
// Estas claves son públicas por diseño (van en el navegador de cada visitante);
// la seguridad real la dan las Reglas de Firestore, no el secreto de esta config.
const FIREBASE_CONFIG = {
  apiKey: "REEMPLAZA_apiKey",
  authDomain: "REEMPLAZA_authDomain",
  projectId: "REEMPLAZA_projectId",
  storageBucket: "REEMPLAZA_storageBucket",
  messagingSenderId: "REEMPLAZA_messagingSenderId",
  appId: "REEMPLAZA_appId"
};

if (typeof firebase !== "undefined" && !firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
