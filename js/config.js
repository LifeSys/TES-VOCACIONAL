// Configuración general del sistema.
const ORIENTA_CONFIG = {
  // Único correo con acceso al panel (también está escrito en firestore.rules: cambiar en los dos).
  correoAdmin: "johannsebastian789@gmail.com",

  // Aula de prueba para la sustentación: recorre el flujo experimental sin guardar nada.
  aulaDemo: "DEMO",

  // Prefijos de la autonumeración (RF04): ESC-0001, UNI-0001, PRO-0001.
  prefijos: { escolar: "ESC", universitario: "UNI", profesional: "PRO" },
  digitos: 4,

  // Universidades que puede elegir un universitario (la última es para cualquier otra).
  universidades: ["UPN", "UPC", "UTP", "UCV", "ULIMA", "PUCP", "Otra"],

  // Calidad de datos (RF10): se marca como sospechoso un test con todo Sí, todo No, o con esta
  // cantidad (o más) de respuestas seguidas en menos de `msRapida` milisegundos.
  calidad: { msRapida: 1000, rapidasSeguidas: 10 },

  // Criterios para que un adulto entre al modelo (sección "Módulo de machine learning").
  entrenamiento: { satisfaccionMinima: 4, minimoPorArea: 50, cicloMinimo: 3 },

  // Modelo de ML desplegado (RNF06): para cambiarlo basta con reemplazar este archivo.
  modeloUrl: "modelo.json"
};
