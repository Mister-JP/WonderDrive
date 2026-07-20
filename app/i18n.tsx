"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { SupportedLocale } from "../lib/contracts";
import { localeDirection } from "../lib/i18n";
import ar from "./locales/ar";
import bn from "./locales/bn";
import de from "./locales/de";
import fr from "./locales/fr";
import hi from "./locales/hi";
import ja from "./locales/ja";
import ko from "./locales/ko";
import pt from "./locales/pt";
import zhCN from "./locales/zh-CN";
import { journeyTreeMessages } from "./locales/journey-tree";
import journeyMessages from "./locales/journeys";

type Values = Record<string, string | number>;
type Translator = (key: string, values?: Values) => string;

const translations: Record<Exclude<SupportedLocale, "en">, Record<string, string>> = {
  es: {
    "New drive": "Nueva ruta", Library: "Biblioteca", Compare: "Comparar", Usage: "Uso", Settings: "Ajustes", "CuriosityPedia views": "Vistas de CuriosityPedia",
    "ChatGPT account": "Cuenta de ChatGPT", "Opening library…": "Abriendo biblioteca…", "{count}/{limit} saved": "{count}/{limit} guardadas", "durable session": "sesión duradera",
    "Sign in": "Iniciar sesión", "Sign out": "Cerrar sesión", "Research first": "Investigar primero", "Your guest library is still separate.": "Tu biblioteca de invitado sigue separada.", Reconnect: "Reconectar", Dismiss: "Descartar",
    "Current journey views": "Vistas del recorrido actual", "Next turn model": "Modelo del próximo turno", "Model for the next research turn": "Modelo para el próximo turno de investigación", Stage: "Escenario", "Full answer": "Respuesta completa", "Journey map": "Mapa del recorrido",
    "One performer. One researched turn. Exactly two ways forward.": "Un intérprete. Un turno investigado. Exactamente dos caminos.", Source: "Código", "Product book": "Libro del producto",
    "Scanning what’s unfolding now…": "Explorando lo que ocurre ahora…", "Current signals + {performer} + {context}": "Señales actuales + {performer} + {context}", "your history": "tu historial", "wild-card domains": "temas inesperados", "Hunting…": "Buscando…", "Find new questions": "Buscar nuevas preguntas", "Questions suggested for {performer}": "Preguntas sugeridas para {performer}",
    "What are you curious about?": "¿Qué te da curiosidad?", "Starting question": "Pregunta inicial", "Ask anything…": "Pregunta lo que quieras…", "Tab to complete": "Tab para completar", "Recommended match": "Coincidencia recomendada", "Start typing for recommendation matches": "Empieza a escribir para ver recomendaciones", Performer: "Intérprete", Model: "Modelo", "Researching in the foreground…": "Investigando ahora…", "Begin the wonder": "Empezar a explorar",
    "Connecting to live foreground research…": "Conectando con la investigación en vivo…", "Taking over research in this tab…": "Tomando el control de la investigación en esta pestaña…", "Use this tab": "Usar esta pestaña", "Research committed": "Investigación guardada", "Research stopped": "Investigación detenida", "Opening the next live research turn…": "Abriendo el siguiente turno de investigación…", "Choose one of the two current paths.": "Elige uno de los dos caminos actuales.",
    "Answer ready": "Respuesta lista", "Buffering answer": "Preparando respuesta", "Retrying {attempt} of {max}": "Reintentando {attempt} de {max}", "Placing the answer into this card": "Colocando la respuesta en esta tarjeta", "Nothing incomplete was saved": "No se guardó nada incompleto", "researching in this foreground turn": "investigando en este turno", "This turn was not committed": "Este turno no se guardó", "Return safely": "Volver con seguridad",
    "Choose the next direction": "Elige la siguiente dirección", "Where should curiosity go next?": "¿Hacia dónde seguimos?", "Two paths will appear here when the answer is ready.": "Aparecerán dos caminos cuando la respuesta esté lista.",
    "Turn {number}": "Turno {number}", "{count} turns": "{count} turnos", "{count} sources": "{count} fuentes", "You are revisiting an earlier turn.": "Estás revisitando un turno anterior.", "Choosing a path here creates a visible branch; your existing turns stay in the map.": "Elegir aquí crea una rama visible; los turnos existentes permanecen en el mapa.", "performed from live web research": "creado con investigación web en vivo", COMPOSED: "COMPUESTO", "Save and export options": "Opciones de guardado y exportación", "Save snapshot": "Guardar instantánea", "Export JSON": "Exportar JSON", "The answer": "La respuesta", "Answer characteristics": "Características de la respuesta", "live research": "investigación en vivo", "Evidence & research details": "Detalles de evidencia e investigación", "Deeper dive": "Ver más",
    "Let {performer} choose": "Dejar que {performer} elija", "Other ways to continue": "Otras formas de continuar", "Pick a path for me": "Elige un camino por mí", "CuriosityPedia chooses one": "CuriosityPedia elige uno", "Try two different questions": "Probar dos preguntas distintas", "Change both choices": "Cambiar ambas opciones", "Replacement question direction": "Dirección de las preguntas nuevas", Practical: "Práctica", Surprising: "Sorprendente", "Different direction": "Otra dirección", "Optional note": "Nota opcional", "What should change about the next two questions?": "¿Qué debería cambiar en las próximas dos preguntas?", "Replacing…": "Reemplazando…", "Generate two new questions": "Generar dos preguntas nuevas",
    "Close deeper dive": "Cerrar detalles", Sources: "Fuentes", Open: "Abrir", "Research summary": "Resumen de investigación", Research: "Investigación", Prompt: "Prompt", Researched: "Investigado", "Close and continue": "Cerrar y continuar",
    "Visual evidence": "Evidencia visual", "Browse visual evidence": "Explorar evidencia visual", "Previous image": "Imagen anterior", "Next image": "Imagen siguiente", "Why it is here": "Por qué está aquí", "What to notice": "Qué observar", "What it helps explain": "Qué ayuda a explicar", "Select an image": "Seleccionar una imagen", "Show {title}": "Mostrar {title}",
    "Follow the path you took, revisit a turn, or open a question you left behind.": "Sigue el camino recorrido, vuelve a un turno o abre una pregunta pendiente.", Current: "Actual", "Open paths": "Caminos abiertos", "Active path": "Camino activo", "How you got here": "Cómo llegaste aquí", "Choose any turn to see its two directions.": "Elige un turno para ver sus dos direcciones.", "You are here": "Estás aquí", Explored: "Explorado", "Earlier branch": "Rama anterior", "This turn is outside your current path. Exploring an open question here creates a new visible branch.": "Este turno está fuera de tu camino actual. Explorar una pregunta abierta crea una rama visible.", "Where could this turn go?": "¿Adónde podría llevar este turno?", "Explore this question": "Explorar esta pregunta", "This answer continues in the map above.": "Esta respuesta continúa en el mapa superior.", "This direction is no longer active.": "Esta dirección ya no está activa.", "Open full answer": "Abrir respuesta completa", "Revisit this answer": "Revisitar esta respuesta", "Other paths": "Otros caminos",
    "Questions worth returning to.": "Preguntas a las que vale la pena volver.", "{count} of {limit} journeys saved": "{count} de {limit} recorridos guardados", "New drive +": "Nueva ruta +", "Library filters": "Filtros de biblioteca", Search: "Buscar", "Title, question, or topic": "Título, pregunta o tema", "All performers": "Todos los intérpretes", "Show hidden": "Mostrar ocultos", PINNED: "FIJADO", Turns: "Turnos", Resume: "Continuar", Delete: "Eliminar", Keep: "Conservar", Remove: "Quitar", Rename: "Renombrar", Unpin: "Desfijar", Pin: "Fijar", Unhide: "Mostrar", Hide: "Ocultar", Snapshot: "Instantánea", Export: "Exportar", "Start the first saved journey": "Iniciar el primer recorrido guardado", "Rename this journey": "Renombrar este recorrido",
    "Two journeys. One closer look.": "Dos recorridos. Una mirada más cercana.", "Select two saved journeys. CuriosityPedia compares their committed paths, topics, and performers.": "Selecciona dos recorridos guardados. CuriosityPedia compara sus caminos, temas e intérpretes.", "Reading the paths…": "Leyendo los caminos…", "Compare selected journeys": "Comparar recorridos seleccionados", "Comparison begins after two journeys exist.": "La comparación comienza cuando existen dos recorridos.", "Start another drive": "Iniciar otra ruta", "Comparison ready": "Comparación lista", "The useful difference": "La diferencia útil", "What the saved data shows": "Lo que muestran los datos guardados", "Comparison cautions": "Precauciones de comparación",
    "Audience controls": "Controles de audiencia", "Make the stage comfortable.": "Haz cómodo el escenario.", "Synced to your ChatGPT identity": "Sincronizado con tu identidad de ChatGPT", "Saved to this guest session": "Guardado en esta sesión de invitado", "These preferences change presentation and future turns, never evidence.": "Estas preferencias cambian la presentación y los turnos futuros, nunca la evidencia.", "Experience language": "Idioma de la experiencia", "Changes the whole interface and future learning output.": "Cambia toda la interfaz y el contenido futuro.", "Default answer density": "Densidad predeterminada", Brief: "Breve", Balanced: "Equilibrada", Rich: "Detallada", "Separate from how deeply CuriosityPedia researches.": "Independiente de la profundidad de investigación.", "Text size": "Tamaño del texto", Small: "Pequeño", Medium: "Mediano", Large: "Grande", "Extra large": "Muy grande", "Factual images": "Imágenes factuales", Avoid: "Evitar", "When useful": "Cuando sean útiles", "Prefer when supported": "Preferir con evidencia", "Decorative imagery is never substituted for factual media.": "Las imágenes decorativas nunca sustituyen evidencia visual.", "Read-aloud speed: {rate}×": "Velocidad de lectura: {rate}×", "Reduce interface motion": "Reducir movimiento", "Saving…": "Guardando…", "Save preferences": "Guardar preferencias",
    "Opening your CuriosityPedia library…": "Abriendo tu biblioteca de CuriosityPedia…", "Resolving a durable guest identity": "Preparando una identidad de invitado", "Open the journey library": "Abrir la biblioteca", "No journey is on stage.": "No hay ningún recorrido en escena.", "Start a new question or return to one you have already saved.": "Inicia una pregunta nueva o vuelve a una ya guardada.",
  },
  fr,
  de,
  pt,
  hi,
  bn,
  ar,
  "zh-CN": zhCN,
  ja,
  ko,
};

const atlasTranslations: Record<Exclude<SupportedLocale, "en">, Record<string, string>> = {
  es: { "Real-world fact hunter": "Cazador de hechos reales", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "Trata la realidad como una enciclopedia infinitamente sorprendente y ancla cada camino en personas, lugares, eventos, organismos, objetos, tecnologías o fenómenos observables documentados.", "fact-hungry": "ávido de datos", specific: "específico", "evidence-led": "guiado por la evidencia" },
  fr: { "Real-world fact hunter": "Chasseur de faits réels", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "Aborde la réalité comme une encyclopédie toujours surprenante et ancre chaque piste dans des personnes, lieux, événements, organismes, objets, technologies ou phénomènes observables documentés.", "fact-hungry": "avide de faits", specific: "précis", "evidence-led": "guidé par les preuves" },
  de: { "Real-world fact hunter": "Faktenjäger der realen Welt", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "Behandelt die Wirklichkeit wie eine endlos überraschende Enzyklopädie und verankert jeden Pfad in dokumentierten Menschen, Orten, Ereignissen, Organismen, Objekten, Technologien oder beobachtbaren Phänomenen.", "fact-hungry": "faktenhungrig", specific: "konkret", "evidence-led": "evidenzgeleitet" },
  pt: { "Real-world fact hunter": "Caçador de fatos do mundo real", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "Trata a realidade como uma enciclopédia infinitamente surpreendente, ancorando cada caminho em pessoas, lugares, eventos, organismos, objetos, tecnologias ou fenômenos observáveis documentados.", "fact-hungry": "ávido por fatos", specific: "específico", "evidence-led": "guiado por evidências" },
  hi: { "Real-world fact hunter": "वास्तविक दुनिया के तथ्य खोजी", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "वास्तविकता को लगातार चौंकाने वाले विश्वकोश की तरह देखता है और हर रास्ते को दर्ज लोगों, स्थानों, घटनाओं, जीवों, वस्तुओं, तकनीकों या देखी जा सकने वाली घटनाओं से जोड़ता है।", "fact-hungry": "तथ्यों का शौकीन", specific: "विशिष्ट", "evidence-led": "प्रमाण-आधारित" },
  bn: { "Real-world fact hunter": "বাস্তব জগতের তথ্য-সন্ধানী", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "বাস্তবতাকে অন্তহীন বিস্ময়ের বিশ্বকোষ হিসেবে দেখে এবং প্রতিটি পথকে নথিভুক্ত মানুষ, স্থান, ঘটনা, জীব, বস্তু, প্রযুক্তি বা পর্যবেক্ষণযোগ্য ঘটনার সঙ্গে যুক্ত করে।", "fact-hungry": "তথ্যপিপাসু", specific: "সুনির্দিষ্ট", "evidence-led": "প্রমাণনির্ভর" },
  ar: { "Real-world fact hunter": "صياد حقائق العالم الحقيقي", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "يتعامل مع الواقع كموسوعة لا تنتهي مفاجآتها، ويربط كل مسار بأشخاص أو أماكن أو أحداث أو كائنات أو أشياء أو تقنيات أو ظواهر قابلة للرصد وموثقة.", "fact-hungry": "شغوف بالحقائق", specific: "محدد", "evidence-led": "مسترشد بالأدلة" },
  "zh-CN": { "Real-world fact hunter": "现实世界事实猎手", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "把现实当作一本永远充满惊喜的百科全书，让每条探索路径都扎根于有记录的人物、地点、事件、生物、物体、技术或可观察现象。", "fact-hungry": "热衷事实", specific: "具体", "evidence-led": "以证据为导向" },
  ja: { "Real-world fact hunter": "現実世界の事実ハンター", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "現実を驚きの尽きない百科事典として捉え、記録された人物、場所、出来事、生物、物体、技術、観察可能な現象にすべての道筋を結びつけます。", "fact-hungry": "事実好き", specific: "具体的", "evidence-led": "証拠重視" },
  ko: { "Real-world fact hunter": "현실 세계 사실 탐험가", "Treats reality like an endlessly surprising encyclopedia, anchoring every path in documented people, places, events, organisms, objects, technologies, or observable phenomena.": "현실을 끝없이 놀라운 백과사전처럼 다루며, 모든 탐구를 기록된 사람·장소·사건·생물·사물·기술 또는 관찰 가능한 현상에 연결합니다.", "fact-hungry": "사실에 열정적인", specific: "구체적인", "evidence-led": "증거 중심" },
};

for (const locale of Object.keys(atlasTranslations) as Array<Exclude<SupportedLocale, "en">>) {
  Object.assign(translations[locale], atlasTranslations[locale]);
}

const researchHandoffTranslations: Record<Exclude<SupportedLocale, "en">, Record<string, string>> = {
  es: { "Taking over research in this tab…": "Tomando el control de la investigación en esta pestaña…", "Use this tab": "Usar esta pestaña" },
  fr: { "Taking over research in this tab…": "Reprise de la recherche dans cet onglet…", "Use this tab": "Utiliser cet onglet" },
  de: { "Taking over research in this tab…": "Recherche wird in diesem Tab übernommen…", "Use this tab": "Diesen Tab verwenden" },
  pt: { "Taking over research in this tab…": "Assumindo a pesquisa nesta aba…", "Use this tab": "Usar esta aba" },
  hi: { "Taking over research in this tab…": "इस टैब में शोध संभाला जा रहा है…", "Use this tab": "इस टैब का उपयोग करें" },
  bn: { "Taking over research in this tab…": "এই ট্যাবে গবেষণার নিয়ন্ত্রণ নেওয়া হচ্ছে…", "Use this tab": "এই ট্যাব ব্যবহার করুন" },
  ar: { "Taking over research in this tab…": "جارٍ متابعة البحث في علامة التبويب هذه…", "Use this tab": "استخدم علامة التبويب هذه" },
  "zh-CN": { "Taking over research in this tab…": "正在此标签页中接管研究…", "Use this tab": "使用此标签页" },
  ja: { "Taking over research in this tab…": "このタブでリサーチを引き継いでいます…", "Use this tab": "このタブを使う" },
  ko: { "Taking over research in this tab…": "이 탭에서 리서치를 이어가고 있습니다…", "Use this tab": "이 탭 사용" },
};

for (const locale of Object.keys(researchHandoffTranslations) as Array<Exclude<SupportedLocale, "en">>) {
  Object.assign(translations[locale], researchHandoffTranslations[locale]);
}

const realWorldRelevanceTranslations: Record<Exclude<SupportedLocale, "en">, string> = {
  es: "Relevancia en el mundo real",
  fr: "Pertinence dans le monde réel",
  de: "Bedeutung in der realen Welt",
  pt: "Relevância no mundo real",
  hi: "वास्तविक दुनिया में प्रासंगिकता",
  bn: "বাস্তব জগতে প্রাসঙ্গিকতা",
  ar: "الأهمية في العالم الحقيقي",
  "zh-CN": "现实意义",
  ja: "現実世界との関わり",
  ko: "현실 세계의 관련성",
};

for (const locale of Object.keys(realWorldRelevanceTranslations) as Array<Exclude<SupportedLocale, "en">>) {
  translations[locale]["Real-world relevance"] = realWorldRelevanceTranslations[locale];
}

Object.assign(translations.es, {
  "rabbit holes": "madrigueras de curiosidad", "Next turn": "Siguiente turno", "Neither question works": "Ninguna pregunta funciona",
  "{count} checked sources": "{count} fuentes verificadas", "Your journey": "Tu recorrido", "Journey overview": "Resumen del recorrido", Option: "Opción",
  "Durable library / D1": "Biblioteca duradera / D1", "unclassified journey": "recorrido sin clasificar",
  "Manual comparison / no provider call": "Comparación manual / sin llamada al proveedor",
  "Private diagnostics": "Diagnóstico privado", "What failed, where, and when.": "Qué falló, dónde y cuándo.", Checking: "Comprobando",
  "Checking…": "Comprobando…", "Refresh incidents": "Actualizar incidentes", "Sign in with ChatGPT to keep private, identity-scoped diagnostic history.": "Inicia sesión con ChatGPT para conservar un historial de diagnóstico privado.",
  "Loading privacy-safe request health…": "Cargando el estado privado de las solicitudes…", "requests · 24h": "solicitudes · 24 h", "failures · 24h": "fallos · 24 h", "failure rate": "tasa de fallos", retention: "retención",
  "Repeated failure detected": "Se detectaron fallos repetidos", "Last provider event": "Último evento del proveedor", "Parsed events": "Eventos procesados", "Malformed events": "Eventos inválidos", "Output deltas": "Fragmentos de salida", "Provider done marker": "Marca de finalización", seen: "vista", "not seen": "no vista", Latency: "Latencia", "HTTP status": "Estado HTTP", "OpenAI request": "Solicitud de OpenAI", Preset: "Configuración", unrecorded: "sin registrar",
  "No failed research requests in the retained window.": "No hubo solicitudes de investigación fallidas en el período conservado.", "Prompts, answers, API keys, cookies, and source contents are never included.": "Nunca se incluyen prompts, respuestas, claves API, cookies ni contenido de fuentes.",
  "Input/output prices shown per 1M tokens; search is metered separately.": "Los precios de entrada y salida se muestran por 1 millón de tokens; la búsqueda se cobra por separado.",
  "CuriosityPedia — Give curiosity a direction": "CuriosityPedia — Dale una dirección a la curiosidad",
  "Highest-quality current OpenAI research model; highest cost.": "Modelo actual de investigación de OpenAI con la máxima calidad; también el de mayor costo.",
  "Current balanced OpenAI research model.": "Modelo actual y equilibrado de investigación de OpenAI.",
  "Recommended current OpenAI model for economical live research.": "Modelo actual de OpenAI recomendado para investigación en vivo económica.",
  "Cheapest compatible model; best for simple questions.": "Modelo compatible más económico; ideal para preguntas sencillas.",
  "Faster, lower-cost research with good answer quality.": "Investigación más rápida y económica con buena calidad de respuesta.",
  "Previous flagship; strong but less economical than Luna.": "Anterior modelo insignia; potente, pero menos económico que Luna.",
  "Strong previous-generation general-purpose model.": "Potente modelo de propósito general de la generación anterior.",
  "path taken": "camino elegido", chosen: "elegida", expired: "vencida", replaced: "reemplazada",
  "Both journeys touched {topics}.": "Ambos recorridos pasaron por {topics}.",
  "The journeys did not land on the same fixture topic.": "Los recorridos no llegaron al mismo tema.",
  "They used the same performer, so the path—not the persona—is the clearest visible difference.": "Usaron el mismo intérprete, así que el camino —no la personalidad— es la diferencia más clara.",
  "They used different performers, so both path and persona shape the contrast.": "Usaron intérpretes distintos, así que tanto el camino como la personalidad dan forma al contraste.",
  "Both contain 1 committed turn.": "Ambos contienen 1 turno guardado.",
  "Both contain {count} committed turns.": "Ambos contienen {count} turnos guardados.",
  "{leftTitle} contains {leftCount} turns; {rightTitle} contains {rightCount}.": "{leftTitle} contiene {leftCount} turnos; {rightTitle} contiene {rightCount}.",
  "Live-web evidence can change between research dates.": "La evidencia web en vivo puede cambiar entre fechas de investigación.",
  "Audience choices and rejected paths change the context of later turns.": "Las decisiones del público y los caminos rechazados cambian el contexto de los turnos posteriores.",
  "Model output is stochastic; this view is descriptive, not a winner ranking.": "La salida del modelo es probabilística; esta vista es descriptiva, no una clasificación de ganadores.",
  "Both journeys began from the same seed.": "Ambos recorridos comenzaron con la misma pregunta inicial.",
  "The starting seeds differ.": "Las preguntas iniciales son distintas.",
  "{performer} will carry this question": "{performer} llevará esta pregunta", "Performer pick": "Elección del intérprete",
  "Same selected model researches and performs · inspectable sources · durable branching graph": "El mismo modelo investiga y presenta · fuentes verificables · mapa de ramas duradero",
  "Move guest journeys into this account": "Mover los recorridos de invitado a esta cuenta", "{count} open questions": "{count} preguntas abiertas", "{count} earlier branches": "{count} ramas anteriores",
  Path: "Camino", "{count} source appearances": "{count} apariciones de fuentes", "{count} open branches": "{count} ramas abiertas", "{count} decisions": "{count} decisiones", "{count} redraws": "{count} reemplazos", "{count} delegated": "{count} delegadas",
  "{code} happened {count} times in ten minutes.": "{code} ocurrió {count} veces en diez minutos.",
  "Patient connections": "Conexiones pacientes", "Playful surprise": "Sorpresa juguetona", "How things work": "Cómo funcionan las cosas",
  "Patiently connects the present question to deeper patterns without rushing the surprise.": "Conecta con paciencia la pregunta actual con patrones más profundos sin apresurar la sorpresa.",
  "Finds the unexpected hinge in the evidence and makes surprise useful rather than random.": "Encuentra el giro inesperado en la evidencia y convierte la sorpresa en algo útil.",
  "Makes hidden mechanisms legible through concrete parts, forces, feedback, and failure modes.": "Hace comprensibles los mecanismos ocultos mediante piezas, fuerzas, retroalimentación y fallos concretos.",
  patient: "paciente", warm: "cálido", precise: "preciso", playful: "juguetón", nimble: "ágil", vivid: "vívido", "clear-eyed": "lúcido", tactile: "táctil", structured: "estructurado",
  instant: "instantáneo", fast: "rápido", balanced: "equilibrado", deliberate: "deliberado",
  "Your saved-journey library is full ({count}/{limit}). Delete one journey to make room.": "Tu biblioteca de recorridos está llena ({count}/{limit}). Elimina uno para liberar espacio.",
  "Manage saved journeys": "Gestionar recorridos guardados", "View usage": "Ver uso", "Library full": "Biblioteca llena", "Usage limit reached": "Límite de uso alcanzado", "No research was started": "No se inició ninguna investigación",
  "Your saved-journey library is full": "Tu biblioteca de recorridos está llena", "Your rolling usage limit is reached": "Alcanzaste tu límite de uso móvil",
  "Rolling usage / 24 hours": "Uso móvil / 24 horas", "Know what is available.": "Descubre qué tienes disponible.", "{count} research runs ready": "{count} investigaciones disponibles", "Reading your usage…": "Consultando tu uso…", "Every run returns exactly 24 hours after it starts.": "Cada uso vuelve exactamente 24 horas después de comenzar.",
  "Try again": "Intentar de nuevo", "Reading your rolling limits…": "Consultando tus límites móviles…", "Live research": "Investigación en vivo", "Live research used in the last 24 hours": "Investigaciones usadas en las últimas 24 horas", "{count} runs are available now.": "Hay {count} investigaciones disponibles ahora.", "Next slot returns {time}.": "El próximo cupo vuelve {time}.", "You have not reached the rolling run limit.": "Aún no alcanzaste el límite móvil de investigaciones.", "Upcoming slot returns": "Próximos cupos disponibles",
    "Rolling provider spend": "Gasto móvil del proveedor", "Provider spend used in the last 24 hours": "Gasto del proveedor en las últimas 24 horas", "Provider spend and active holds in the last 24 hours": "Gasto del proveedor y retenciones activas en las últimas 24 horas", "Spend begins leaving the window {time}.": "El gasto comienza a salir del período {time}.", "No metered provider spend in the current window.": "No hay gasto medido en el período actual.", "No metered provider spend or active holds in the current window.": "No hay gasto medido ni retenciones activas en el período actual.",
  "Saved journeys": "Recorridos guardados", "Saved journey capacity used": "Capacidad de recorridos utilizada", "This capacity does not reset every 24 hours. Delete a journey to free a place.": "Esta capacidad no se reinicia cada 24 horas. Elimina un recorrido para liberar un lugar.",
  "How rolling limits work": "Cómo funcionan los límites móviles", "There is no midnight reset. Each run and each dollar leaves the window 24 hours after it was recorded.": "No hay reinicio a medianoche. Cada investigación y cada dólar salen del período 24 horas después de registrarse.",
  "Guest session": "Sesión de invitado", "This browser session is scheduled to remain available until {time}.": "Esta sesión del navegador está prevista hasta {time}.", "This library belongs to this browser session.": "Esta biblioteca pertenece a esta sesión del navegador.", "Sign in to keep more across devices": "Inicia sesión para guardar más entre dispositivos", "Account usage": "Uso de la cuenta", "These limits follow your signed-in ChatGPT identity across devices.": "Estos límites siguen tu identidad de ChatGPT en todos tus dispositivos.",
});

const simplerPageHeadings: Record<Exclude<SupportedLocale, "en">, Record<string, string>> = {
  es: { "Explore a question": "Explora una pregunta", "Your saved questions": "Tus preguntas guardadas", "Compare two journeys": "Compara dos recorridos", "Your research availability": "Tu investigación disponible", "Your experience": "Tu experiencia", "No saved questions yet": "Aún no tienes preguntas guardadas", "Art settings": "Ajustes de arte" },
  fr: { "Explore a question": "Explorer une question", "Your saved questions": "Vos questions enregistrées", "Compare two journeys": "Comparer deux parcours", "Your research availability": "Vos recherches disponibles", "Your experience": "Votre expérience", "No saved questions yet": "Aucune question enregistrée", "Art settings": "Réglages artistiques" },
  de: { "Explore a question": "Eine Frage erkunden", "Your saved questions": "Deine gespeicherten Fragen", "Compare two journeys": "Zwei Wege vergleichen", "Your research availability": "Deine verfügbaren Recherchen", "Your experience": "Dein Erlebnis", "No saved questions yet": "Noch keine gespeicherten Fragen", "Art settings": "Grafikeinstellungen" },
  pt: { "Explore a question": "Explore uma pergunta", "Your saved questions": "Suas perguntas salvas", "Compare two journeys": "Compare duas jornadas", "Your research availability": "Suas pesquisas disponíveis", "Your experience": "Sua experiência", "No saved questions yet": "Ainda não há perguntas salvas", "Art settings": "Configurações de arte" },
  hi: { "Explore a question": "एक प्रश्न जानें", "Your saved questions": "आपके सहेजे प्रश्न", "Compare two journeys": "दो यात्राओं की तुलना करें", "Your research availability": "आपकी उपलब्ध रिसर्च", "Your experience": "आपका अनुभव", "No saved questions yet": "अभी कोई प्रश्न सहेजा नहीं गया", "Art settings": "कला सेटिंग" },
  bn: { "Explore a question": "একটি প্রশ্ন অনুসন্ধান করুন", "Your saved questions": "আপনার সংরক্ষিত প্রশ্ন", "Compare two journeys": "দুটি যাত্রার তুলনা করুন", "Your research availability": "আপনার উপলব্ধ গবেষণা", "Your experience": "আপনার অভিজ্ঞতা", "No saved questions yet": "এখনও কোনো প্রশ্ন সংরক্ষিত নেই", "Art settings": "আর্ট সেটিংস" },
  ar: { "Explore a question": "استكشف سؤالاً", "Your saved questions": "أسئلتك المحفوظة", "Compare two journeys": "قارن بين رحلتين", "Your research availability": "أبحاثك المتاحة", "Your experience": "تجربتك", "No saved questions yet": "لا توجد أسئلة محفوظة بعد", "Art settings": "إعدادات الفن" },
  "zh-CN": { "Explore a question": "探索一个问题", "Your saved questions": "你保存的问题", "Compare two journeys": "比较两个探索", "Your research availability": "可用研究次数", "Your experience": "你的使用体验", "No saved questions yet": "尚无保存的问题", "Art settings": "艺术设置" },
  ja: { "Explore a question": "質問を探る", "Your saved questions": "保存した質問", "Compare two journeys": "2つの探究を比較", "Your research availability": "利用できるリサーチ", "Your experience": "表示と使い方", "No saved questions yet": "保存した質問はまだありません", "Art settings": "アート設定" },
  ko: { "Explore a question": "질문 살펴보기", "Your saved questions": "저장한 질문", "Compare two journeys": "두 탐색 비교하기", "Your research availability": "사용 가능한 리서치", "Your experience": "내 환경", "No saved questions yet": "저장한 질문이 아직 없습니다", "Art settings": "아트 설정" },
};

const bookmarkMessages: Record<Exclude<SupportedLocale, "en">, Record<string, string>> = {
  es: { Bookmarks: "Guardados" },
  fr: { Bookmarks: "Favoris" },
  de: { Bookmarks: "Lesezeichen" },
  pt: { Bookmarks: "Favoritos" },
  hi: { Bookmarks: "बुकमार्क" },
  bn: { Bookmarks: "বুকমার্ক" },
  ar: { Bookmarks: "المحفوظات" },
  "zh-CN": { Bookmarks: "收藏" },
  ja: { Bookmarks: "ブックマーク" },
  ko: { Bookmarks: "북마크" },
};

const settingsMessages: Record<Exclude<SupportedLocale, "en">, Record<string, string>> = {
  es: { Account: "Cuenta", Saved: "Guardados", Preferences: "Preferencias", "This device": "Este dispositivo", Synced: "Sincronizadas", "Your preferences": "Tus preferencias", "Tune how CuriosityPedia looks and answers.": "Ajusta cómo se ve y responde CuriosityPedia.", "Research model": "Modelo de investigación", "Answer style": "Estilo de respuesta", "These choices change presentation, never research quality.": "Estas opciones cambian la presentación, nunca la calidad de la investigación.", "Words and visuals": "Texto e imágenes", "Answer detail": "Detalle de la respuesta", Reader: "Lectura", "A bit of both": "Un poco de ambos", "Visual explorer": "Exploración visual", "Quick read": "Lectura rápida", "Just right": "Justo lo necesario", "Deep dive": "En profundidad", Visual: "Visual", Comfort: "Comodidad", "Preference for words or visuals": "Preferencia por texto o imágenes", "Preference for answer detail": "Preferencia por el detalle de la respuesta", "Development only": "Solo desarrollo" },
  fr: { Account: "Compte", Saved: "Enregistrés", Preferences: "Préférences", "This device": "Cet appareil", Synced: "Synchronisées", "Your preferences": "Vos préférences", "Tune how CuriosityPedia looks and answers.": "Ajustez l’apparence et les réponses de CuriosityPedia.", "Research model": "Modèle de recherche", "Answer style": "Style de réponse", "These choices change presentation, never research quality.": "Ces choix modifient la présentation, jamais la qualité de la recherche.", "Words and visuals": "Texte et visuels", "Answer detail": "Niveau de détail", Reader: "Lecture", "A bit of both": "Un peu des deux", "Visual explorer": "Exploration visuelle", "Quick read": "Lecture rapide", "Just right": "Juste ce qu’il faut", "Deep dive": "Approfondi", Visual: "Visuel", Comfort: "Confort", "Preference for words or visuals": "Préférence pour le texte ou les visuels", "Preference for answer detail": "Préférence pour le niveau de détail", "Development only": "Développement uniquement" },
  de: { Account: "Konto", Saved: "Gespeichert", Preferences: "Einstellungen", "This device": "Dieses Gerät", Synced: "Synchronisiert", "Your preferences": "Deine Einstellungen", "Tune how CuriosityPedia looks and answers.": "Passe Darstellung und Antworten von CuriosityPedia an.", "Research model": "Recherchemodell", "Answer style": "Antwortstil", "These choices change presentation, never research quality.": "Diese Optionen ändern die Darstellung, nie die Recherchequalität.", "Words and visuals": "Text und Bilder", "Answer detail": "Antworttiefe", Reader: "Lesen", "A bit of both": "Etwas von beidem", "Visual explorer": "Visuell entdecken", "Quick read": "Kurzfassung", "Just right": "Genau richtig", "Deep dive": "Ausführlich", Visual: "Visuell", Comfort: "Lesekomfort", "Preference for words or visuals": "Präferenz für Text oder Bilder", "Preference for answer detail": "Präferenz für die Antworttiefe", "Development only": "Nur Entwicklung" },
  pt: { Account: "Conta", Saved: "Salvos", Preferences: "Preferências", "This device": "Este dispositivo", Synced: "Sincronizadas", "Your preferences": "Suas preferências", "Tune how CuriosityPedia looks and answers.": "Ajuste a aparência e as respostas do CuriosityPedia.", "Research model": "Modelo de pesquisa", "Answer style": "Estilo da resposta", "These choices change presentation, never research quality.": "Essas opções mudam a apresentação, nunca a qualidade da pesquisa.", "Words and visuals": "Texto e imagens", "Answer detail": "Detalhe da resposta", Reader: "Leitura", "A bit of both": "Um pouco dos dois", "Visual explorer": "Exploração visual", "Quick read": "Leitura rápida", "Just right": "Na medida certa", "Deep dive": "Aprofundada", Visual: "Visual", Comfort: "Conforto", "Preference for words or visuals": "Preferência por texto ou imagens", "Preference for answer detail": "Preferência pelo detalhe da resposta", "Development only": "Somente desenvolvimento" },
  hi: { Account: "खाता", Saved: "सहेजे गए", Preferences: "प्राथमिकताएँ", "This device": "यह डिवाइस", Synced: "सिंक की गई", "Your preferences": "आपकी प्राथमिकताएँ", "Tune how CuriosityPedia looks and answers.": "CuriosityPedia के रूप और उत्तरों को समायोजित करें।", "Research model": "रिसर्च मॉडल", "Answer style": "उत्तर शैली", "These choices change presentation, never research quality.": "ये विकल्प प्रस्तुति बदलते हैं, रिसर्च की गुणवत्ता नहीं।", "Words and visuals": "शब्द और दृश्य", "Answer detail": "उत्तर का विस्तार", Reader: "पाठक", "A bit of both": "दोनों का संतुलन", "Visual explorer": "दृश्य खोज", "Quick read": "त्वरित पढ़ाई", "Just right": "उचित विस्तार", "Deep dive": "गहराई से", Visual: "दृश्य", Comfort: "सुविधा", "Preference for words or visuals": "शब्दों या दृश्यों की प्राथमिकता", "Preference for answer detail": "उत्तर के विस्तार की प्राथमिकता", "Development only": "केवल डेवलपमेंट" },
  bn: { Account: "অ্যাকাউন্ট", Saved: "সংরক্ষিত", Preferences: "পছন্দসমূহ", "This device": "এই ডিভাইস", Synced: "সিঙ্ক করা", "Your preferences": "আপনার পছন্দ", "Tune how CuriosityPedia looks and answers.": "CuriosityPedia-এর চেহারা ও উত্তর সামঞ্জস্য করুন।", "Research model": "রিসার্চ মডেল", "Answer style": "উত্তরের ধরন", "These choices change presentation, never research quality.": "এই পছন্দগুলো উপস্থাপনা বদলায়, গবেষণার মান নয়।", "Words and visuals": "শব্দ ও দৃশ্য", "Answer detail": "উত্তরের বিস্তারিত", Reader: "পাঠক", "A bit of both": "দুটোরই কিছুটা", "Visual explorer": "দৃশ্য অনুসন্ধান", "Quick read": "দ্রুত পাঠ", "Just right": "যথাযথ", "Deep dive": "বিস্তারিত", Visual: "দৃশ্য", Comfort: "আরাম", "Preference for words or visuals": "শব্দ বা দৃশ্যের পছন্দ", "Preference for answer detail": "উত্তরের বিস্তারিততার পছন্দ", "Development only": "শুধু ডেভেলপমেন্ট" },
  ar: { Account: "الحساب", Saved: "المحفوظ", Preferences: "التفضيلات", "This device": "هذا الجهاز", Synced: "متزامنة", "Your preferences": "تفضيلاتك", "Tune how CuriosityPedia looks and answers.": "اضبط مظهر CuriosityPedia وطريقة إجاباته.", "Research model": "نموذج البحث", "Answer style": "أسلوب الإجابة", "These choices change presentation, never research quality.": "تغيّر هذه الخيارات طريقة العرض، لا جودة البحث.", "Words and visuals": "النص والصور", "Answer detail": "تفصيل الإجابة", Reader: "قراءة", "A bit of both": "مزيج متوازن", "Visual explorer": "استكشاف بصري", "Quick read": "قراءة سريعة", "Just right": "مناسب", "Deep dive": "متعمق", Visual: "بصري", Comfort: "الراحة", "Preference for words or visuals": "تفضيل النص أو الصور", "Preference for answer detail": "تفضيل مستوى تفصيل الإجابة", "Development only": "للتطوير فقط" },
  "zh-CN": { Account: "账户", Saved: "已保存", Preferences: "偏好设置", "This device": "此设备", Synced: "已同步", "Your preferences": "你的偏好", "Tune how CuriosityPedia looks and answers.": "调整 CuriosityPedia 的外观和回答方式。", "Research model": "研究模型", "Answer style": "回答风格", "These choices change presentation, never research quality.": "这些选项只改变呈现方式，不影响研究质量。", "Words and visuals": "文字与视觉", "Answer detail": "回答详略", Reader: "文字为主", "A bit of both": "两者兼顾", "Visual explorer": "视觉探索", "Quick read": "快速阅读", "Just right": "恰到好处", "Deep dive": "深入阅读", Visual: "视觉", Comfort: "阅读舒适度", "Preference for words or visuals": "文字或视觉偏好", "Preference for answer detail": "回答详略偏好", "Development only": "仅限开发" },
  ja: { Account: "アカウント", Saved: "保存済み", Preferences: "設定", "This device": "この端末", Synced: "同期済み", "Your preferences": "表示設定", "Tune how CuriosityPedia looks and answers.": "CuriosityPediaの表示と回答方法を調整します。", "Research model": "リサーチモデル", "Answer style": "回答スタイル", "These choices change presentation, never research quality.": "これらは表示方法だけを変え、調査品質には影響しません。", "Words and visuals": "文章とビジュアル", "Answer detail": "回答の詳しさ", Reader: "文章中心", "A bit of both": "両方をバランスよく", "Visual explorer": "ビジュアル中心", "Quick read": "短く", "Just right": "ちょうどよい", "Deep dive": "詳しく", Visual: "ビジュアル", Comfort: "読みやすさ", "Preference for words or visuals": "文章とビジュアルの設定", "Preference for answer detail": "回答の詳しさの設定", "Development only": "開発環境のみ" },
  ko: { Account: "계정", Saved: "저장됨", Preferences: "환경 설정", "This device": "이 기기", Synced: "동기화됨", "Your preferences": "내 환경 설정", "Tune how CuriosityPedia looks and answers.": "CuriosityPedia의 화면과 답변 방식을 조정하세요.", "Research model": "리서치 모델", "Answer style": "답변 스타일", "These choices change presentation, never research quality.": "이 설정은 표현 방식만 바꾸며 리서치 품질에는 영향을 주지 않습니다.", "Words and visuals": "글과 시각 자료", "Answer detail": "답변 상세도", Reader: "글 중심", "A bit of both": "둘 다 적당히", "Visual explorer": "시각 자료 중심", "Quick read": "빠르게", "Just right": "적당히", "Deep dive": "자세히", Visual: "시각 자료", Comfort: "읽기 편의", "Preference for words or visuals": "글 또는 시각 자료 선호도", "Preference for answer detail": "답변 상세도 선호", "Development only": "개발 환경 전용" },
};

for (const locale of Object.keys(simplerPageHeadings) as Array<Exclude<SupportedLocale, "en">>) {
  Object.assign(translations[locale], simplerPageHeadings[locale], bookmarkMessages[locale], settingsMessages[locale], journeyMessages[locale]);
}

for (const locale of Object.keys(journeyTreeMessages) as Array<Exclude<SupportedLocale, "en">>) {
  Object.assign(translations[locale], journeyTreeMessages[locale]);
}

const questionJourneyMessages: Record<Exclude<SupportedLocale, "en">, Record<string, string>> = {
  es: { Close: "Cerrar", "Deep dive into this question?": "¿Profundizar en esta pregunta?", "Full answer": "Respuesta completa", "New research path": "Nueva ruta de investigación", "Not now": "Ahora no", "Open question": "Pregunta abierta", "Preview journey": "Vista previa del recorrido", Question: "Pregunta", "Questions from this session": "Preguntas de esta sesión", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "Esto inicia una nueva respuesta investigada desde el turno {number}. Tu recorrido actual permanece intacto." },
  fr: { Close: "Fermer", "Deep dive into this question?": "Approfondir cette question ?", "Full answer": "Réponse complète", "New research path": "Nouveau parcours de recherche", "Not now": "Pas maintenant", "Open question": "Question ouverte", "Preview journey": "Aperçu du parcours", Question: "Question", "Questions from this session": "Questions de cette session", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "Une nouvelle réponse documentée sera lancée à partir de l’étape {number}. Votre parcours actuel reste intact." },
  de: { Close: "Schließen", "Deep dive into this question?": "Diese Frage vertiefen?", "Full answer": "Vollständige Antwort", "New research path": "Neuer Recherchepfad", "Not now": "Jetzt nicht", "Open question": "Offene Frage", "Preview journey": "Vorschau der Journey", Question: "Frage", "Questions from this session": "Fragen aus dieser Sitzung", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "Dadurch beginnt eine neue recherchierte Antwort ab Runde {number}. Deine aktuelle Journey bleibt erhalten." },
  pt: { Close: "Fechar", "Deep dive into this question?": "Aprofundar esta pergunta?", "Full answer": "Resposta completa", "New research path": "Novo caminho de pesquisa", "Not now": "Agora não", "Open question": "Pergunta aberta", "Preview journey": "Prévia da jornada", Question: "Pergunta", "Questions from this session": "Perguntas desta sessão", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "Isso inicia uma nova resposta pesquisada a partir da etapa {number}. Sua jornada atual permanece intacta." },
  hi: { Close: "बंद करें", "Deep dive into this question?": "इस प्रश्न में गहराई से जाएँ?", "Full answer": "पूरा उत्तर", "New research path": "नया शोध पथ", "Not now": "अभी नहीं", "Open question": "खुला प्रश्न", "Preview journey": "यात्रा का पूर्वावलोकन", Question: "प्रश्न", "Questions from this session": "इस सत्र के प्रश्न", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "इससे चरण {number} से एक नया शोध-आधारित उत्तर शुरू होगा। आपकी वर्तमान यात्रा सुरक्षित रहेगी।" },
  bn: { Close: "বন্ধ করুন", "Deep dive into this question?": "এই প্রশ্নটি গভীরভাবে জানবেন?", "Full answer": "সম্পূর্ণ উত্তর", "New research path": "নতুন গবেষণার পথ", "Not now": "এখন নয়", "Open question": "খোলা প্রশ্ন", "Preview journey": "যাত্রার পূর্বরূপ", Question: "প্রশ্ন", "Questions from this session": "এই সেশনের প্রশ্নসমূহ", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "এটি ধাপ {number} থেকে একটি নতুন গবেষণাভিত্তিক উত্তর শুরু করবে। আপনার বর্তমান যাত্রা অক্ষত থাকবে।" },
  ar: { Close: "إغلاق", "Deep dive into this question?": "هل تريد التعمق في هذا السؤال؟", "Full answer": "الإجابة الكاملة", "New research path": "مسار بحث جديد", "Not now": "ليس الآن", "Open question": "سؤال مفتوح", "Preview journey": "معاينة الرحلة", Question: "سؤال", "Questions from this session": "أسئلة هذه الجلسة", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "سيبدأ هذا إجابة بحثية جديدة من الجولة {number}. ستبقى رحلتك الحالية كما هي." },
  "zh-CN": { Close: "关闭", "Deep dive into this question?": "深入探索这个问题？", "Full answer": "完整回答", "New research path": "新的研究路径", "Not now": "暂不", "Open question": "开放问题", "Preview journey": "预览探索", Question: "问题", "Questions from this session": "本次学习的问题", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "这将从第 {number} 轮开始一个新的研究答案。你当前的探索保持不变。" },
  ja: { Close: "閉じる", "Deep dive into this question?": "この質問をさらに掘り下げますか？", "Full answer": "回答全文", "New research path": "新しいリサーチ経路", "Not now": "今はしない", "Open question": "未探索の質問", "Preview journey": "探究をプレビュー", Question: "質問", "Questions from this session": "このセッションの質問", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "ターン{number}から新しい調査回答を開始します。現在の探究はそのまま残ります。" },
  ko: { Close: "닫기", "Deep dive into this question?": "이 질문을 더 깊이 살펴볼까요?", "Full answer": "전체 답변", "New research path": "새 리서치 경로", "Not now": "나중에", "Open question": "열린 질문", "Preview journey": "탐색 미리보기", Question: "질문", "Questions from this session": "이 세션의 질문", "This starts one new researched answer from Turn {number}. Your current journey stays intact.": "턴 {number}에서 새로운 리서치 답변을 시작합니다. 현재 탐색은 그대로 유지됩니다." },
};

for (const locale of Object.keys(questionJourneyMessages) as Array<Exclude<SupportedLocale, "en">>) {
  Object.assign(translations[locale], questionJourneyMessages[locale]);
}

export const interfaceMessageKeys = Object.freeze(Object.keys(translations.es));

function format(template: string, values: Values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

export function translate(locale: SupportedLocale, key: string, values?: Values) {
  return format(locale === "en" ? key : translations[locale][key] ?? key, values);
}

export function hasTranslation(locale: Exclude<SupportedLocale, "en">, key: string) {
  return Object.hasOwn(translations[locale], key);
}

const I18nContext = createContext<{ locale: SupportedLocale; t: Translator }>({
  locale: "en",
  t: (key, values) => format(key, values),
});

export function I18nProvider({ locale, children }: { locale: SupportedLocale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    document.title = translate(locale, "CuriosityPedia — Give curiosity a direction");
  }, [locale]);
  const t: Translator = (key, values) => translate(locale, key, values);
  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
