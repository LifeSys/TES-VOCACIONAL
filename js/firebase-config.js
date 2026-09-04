// Configuración de Firebase — proyecto "tes-vocacional-tesis".
// Estas claves son públicas por diseño (van en el navegador de cada visitante);
// la seguridad real la dan las Reglas de Firestore, no el secreto de esta config.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDdeycHIyKSdkTfJYiJT6cInTd6op7Mt3o",
  authDomain: "tes-vocacional-tesis.firebaseapp.com",
  projectId: "tes-vocacional-tesis",
  storageBucket: "tes-vocacional-tesis.firebasestorage.app",
  messagingSenderId: "553414277085",
  appId: "1:553414277085:web:99a1c664497fd090a8e834"
};

if (typeof firebase !== "undefined" && !firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
