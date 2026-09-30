// Configuración general del sistema. Lo que se cambia entre etapas de la tesis se cambia aquí.
const ORIENTA_CONFIG = {
  // Formato de los códigos de acceso (RF01): prefijo + guion + 3 dígitos, p. ej. EXP-001.
  formatoCodigo: /^(UNI|EGR|EXP|CTL)-\d{3}$/,
  codigoDemo: "DEMO",

  // Etapa de recolección de datos de entrenamiento (paso 3 del orden de uso).
  // Poner en false ANTES de aplicar el cuasi experimento (paso 5): así ya no se aceptan
  // códigos UNI- ni EGR- y el modelo no cambia a mitad del experimento.
  recoleccionEntrenamientoAbierta: true,

  // Calidad de datos (RF09): se marca como no válido un test con todo Sí, todo No,
  // o con esta cantidad (o más) de respuestas seguidas en menos de `msRapida` milisegundos.
  calidad: { msRapida: 1000, rapidasSeguidas: 10 },

  // Criterios para que un caso de entrenamiento entre al modelo (sección "Módulo de ML").
  entrenamiento: { satisfaccionMinima: 4, minimoPorArea: 50 },

  // Modelo de ML desplegado (RNF06): para cambiarlo basta con reemplazar este archivo.
  modeloUrl: "modelo.json",

  // Segundos máximos de espera al registrar el código (necesita conexión en ese momento).
  timeoutRegistroMs: 12000
};
