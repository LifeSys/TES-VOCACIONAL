// Instrumentos del sistema: textos de consentimiento/asentimiento y escalas Likert.
//
// IMPORTANTE: los ítems marcados como BORRADOR los redactó el equipo de desarrollo para que el
// sistema funcione de punta a punta. Antes del piloto deben reemplazarse por la versión aprobada
// en el juicio de expertos (paso 2 del orden de uso). Para cambiarlos basta con editar el texto
// aquí: el sistema guarda las respuestas por posición (ítem 1, ítem 2, ...), así que no cambies
// la CANTIDAD de ítems de una escala sin avisar a quien analiza los datos.
const INSTRUMENTOS = {
  likert: ["Totalmente en desacuerdo", "En desacuerdo", "Ni de acuerdo ni en desacuerdo", "De acuerdo", "Totalmente de acuerdo"],

  // RF03 — enlace de adultos (universitarios y profesionales). El detalle está en privacidad-adultos.html
  consentimiento: {
    titulo: "Consentimiento informado",
    politica: "privacidad-adultos.html",
    parrafos: [
      "Te invitamos a participar en una investigación de tesis sobre orientación vocacional con inteligencia artificial. Responderás algunos datos de tu carrera, una breve escala de satisfacción y el test CHASIDE (unos 20 minutos). No te pediremos tu nombre, DNI ni correo: al terminar, tus respuestas se guardan de forma anónima con un número que te mostraremos, y se usan únicamente para la investigación. Si no terminas, no se guarda nada. Participar es voluntario."
    ],
    acepto: "Acepto participar",
    mayorDeEdad: "¿Tienes 18 años o más?"
  },

  // RF02 — enlace de escolares (menores de edad; el consentimiento de los padres lo guarda el colegio)
  asentimiento: {
    titulo: "Asentimiento informado",
    politica: "privacidad-menores.html",
    parrafos: [
      "Te invitamos a participar en una investigación que busca ayudar a los estudiantes a conocer mejor sus intereses vocacionales. Responderás unas preguntas cortas y un test de preguntas de Sí o No. No te pediremos tu nombre ni ningún dato personal: al terminar, tus respuestas se guardan de forma anónima con un número que te mostraremos, y se usan solo para la investigación. Si no terminas, no se guarda nada. Participar es voluntario."
    ],
    acepto: "Acepto participar"
  },

  escalas: {
    // RF05 — preprueba y posprueba (escolares). BORRADOR.
    claridad: {
      titulo: "Claridad vocacional",
      instruccion: "Marca qué tan de acuerdo estás con cada afirmación, pensando en cómo te sientes hoy.",
      borrador: true,
      items: [
        "Tengo claro qué carrera quiero estudiar.",
        "Sé cuáles son mis principales intereses vocacionales.",
        "Conozco las carreras que se relacionan con mis intereses.",
        "Me siento seguro/a de la decisión vocacional que estoy tomando.",
        "Sé qué áreas profesionales no van conmigo.",
        "Puedo explicar por qué me atrae una carrera en particular.",
        "Tengo información suficiente para elegir una carrera.",
        "Mis intereses vocacionales se mantienen estables en el tiempo.",
        "Sé qué pasos debo seguir para llegar a la carrera que me interesa.",
        "Me siento preparado/a para tomar una decisión sobre mi futuro profesional."
      ]
    },
    // RF06 — universitarios. BORRADOR.
    satisfaccionCarrera: {
      titulo: "Satisfacción con tu carrera",
      instruccion: "Marca qué tan de acuerdo estás con cada afirmación sobre la carrera que estudias.",
      borrador: true,
      items: [
        "Estoy satisfecho/a con la carrera que estudio.",
        "Si pudiera volver a elegir, elegiría la misma carrera.",
        "Disfruto los cursos propios de mi carrera.",
        "Me veo trabajando en el campo de mi carrera en el futuro."
      ]
    },
    // RF07 — profesionales. BORRADOR.
    satisfaccionProfesion: {
      titulo: "Satisfacción con tu profesión",
      instruccion: "Marca qué tan de acuerdo estás con cada afirmación sobre la profesión que ejerces.",
      borrador: true,
      items: [
        "Estoy satisfecho/a con la profesión que elegí.",
        "Si pudiera volver a elegir, estudiaría la misma carrera.",
        "Disfruto las tareas propias de mi profesión.",
        "Me veo ejerciendo esta profesión en los próximos años."
      ]
    },
    // RF13 — adecuación del resultado (aulas EXP y CTL). BORRADOR.
    adecuacion: {
      titulo: "Tu opinión sobre el resultado",
      instruccion: "Piensa en el resultado del test vocacional que acabas de hacer.",
      borrador: true,
      items: [
        "El resultado del test describe bien mis intereses.",
        "Las áreas o carreras que me mostró el test coinciden con lo que me gusta.",
        "El resultado del test me será útil para elegir una carrera."
      ]
    },
    // RF13 — Modelo de Aceptación Tecnológica, 13 ítems (solo aulas EXP).
    tam: {
      titulo: "Tu experiencia con el sistema",
      instruccion: "Marca qué tan de acuerdo estás con cada afirmación sobre el sistema que usaste.",
      secciones: { 0: "Utilidad percibida", 4: "Facilidad de uso", 8: "Actitud hacia el uso", 11: "Intención de uso futuro" },
      items: [
        "El sistema me ayudó a conocer mejor mis intereses vocacionales.",
        "Las recomendaciones que me dio el sistema son útiles para elegir una carrera.",
        "Usar el sistema mejoró mi comprensión sobre las carreras que podrían ser adecuadas para mí.",
        "En general, el sistema es útil para el proceso de orientación vocacional.",
        "Fue fácil aprender a usar el sistema.",
        "Pude completar el test sin necesitar ayuda de otra persona.",
        "Las instrucciones y preguntas del sistema fueron claras y fáciles de entender.",
        "Navegar y responder en el sistema fue sencillo.",
        "Me pareció una buena idea usar este tipo de sistema para orientación vocacional.",
        "Disfruté usar el sistema.",
        "Me sentí cómodo/a usando el sistema.",
        "Si pudiera, volvería a usar este sistema en el futuro.",
        "Recomendaría este sistema a otros estudiantes."
      ]
    },
    // RF13 — System Usability Scale (Brooke, 1996), 10 ítems, versión en español (solo aulas EXP).
    // Ítems impares en positivo, pares en negativo; el puntaje 0-100 se calcula en el panel admin.
    sus: {
      titulo: "Facilidad de uso del sistema",
      instruccion: "Marca qué tan de acuerdo estás con cada afirmación.",
      items: [
        "Creo que me gustaría usar este sistema con frecuencia.",
        "Encontré el sistema innecesariamente complejo.",
        "Pensé que el sistema era fácil de usar.",
        "Creo que necesitaría el apoyo de una persona con conocimientos técnicos para poder usar este sistema.",
        "Encontré que las distintas funciones del sistema estaban bien integradas.",
        "Pensé que había demasiada inconsistencia en este sistema.",
        "Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.",
        "Encontré el sistema muy difícil de usar.",
        "Me sentí muy seguro/a usando el sistema.",
        "Necesité aprender muchas cosas antes de poder usar este sistema."
      ]
    }
  }
};
