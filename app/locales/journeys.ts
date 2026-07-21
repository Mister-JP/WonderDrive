import type { SupportedLocale } from "../../lib/contracts";

type Locale = Exclude<SupportedLocale, "en">;

const messages: Record<Locale, Record<string, string>> = {
  es: journeyMessages({ journeys: "Recorridos", yourJourneys: "Tus recorridos", newJourney: "Nuevo recorrido", showJourney: "Ver recorrido", capacity: "Capacidad de recorridos", firstExplored: "Primera pregunta", started: "Comenzó", renameLabel: "Renombrar etiqueta del recorrido", remove: "Quitar" }),
  fr: journeyMessages({ journeys: "Parcours", yourJourneys: "Vos parcours", newJourney: "Nouveau parcours", showJourney: "Voir le parcours", capacity: "Capacité des parcours", firstExplored: "Première question", started: "Commencé", renameLabel: "Renommer l’étiquette du parcours", remove: "Supprimer" }),
  de: journeyMessages({ journeys: "Journeys", yourJourneys: "Deine Journeys", newJourney: "Neue Journey", showJourney: "Journey anzeigen", capacity: "Journey-Kapazität", firstExplored: "Erste Frage", started: "Begonnen", renameLabel: "Journey-Label umbenennen", remove: "Entfernen" }),
  pt: journeyMessages({ journeys: "Jornadas", yourJourneys: "Suas jornadas", newJourney: "Nova jornada", showJourney: "Mostrar jornada", capacity: "Capacidade de jornadas", firstExplored: "Primeira pergunta", started: "Iniciada", renameLabel: "Renomear rótulo da jornada", remove: "Remover" }),
  hi: journeyMessages({ journeys: "यात्राएँ", yourJourneys: "आपकी यात्राएँ", newJourney: "नई यात्रा", showJourney: "यात्रा दिखाएँ", capacity: "यात्रा क्षमता", firstExplored: "पहला प्रश्न", started: "शुरू हुई", renameLabel: "यात्रा लेबल का नाम बदलें", remove: "हटाएँ" }),
  bn: journeyMessages({ journeys: "যাত্রাসমূহ", yourJourneys: "আপনার যাত্রাসমূহ", newJourney: "নতুন যাত্রা", showJourney: "যাত্রা দেখুন", capacity: "যাত্রার ধারণক্ষমতা", firstExplored: "প্রথম প্রশ্ন", started: "শুরু", renameLabel: "যাত্রার লেবেল নাম বদলান", remove: "সরান" }),
  ar: journeyMessages({ journeys: "الرحلات", yourJourneys: "رحلاتك", newJourney: "رحلة جديدة", showJourney: "عرض الرحلة", capacity: "سعة الرحلات", firstExplored: "السؤال الأول", started: "بدأت", renameLabel: "إعادة تسمية وسم الرحلة", remove: "إزالة" }),
  "zh-CN": journeyMessages({ journeys: "旅程", yourJourneys: "你的旅程", newJourney: "新旅程", showJourney: "查看旅程", capacity: "旅程容量", firstExplored: "最初的问题", started: "开始于", renameLabel: "重命名旅程标签", remove: "移除" }),
  ja: journeyMessages({ journeys: "ジャーニー", yourJourneys: "あなたのジャーニー", newJourney: "新しいジャーニー", showJourney: "ジャーニーを表示", capacity: "ジャーニー容量", firstExplored: "最初の質問", started: "開始", renameLabel: "ジャーニーラベルを変更", remove: "削除" }),
  ko: journeyMessages({ journeys: "여정", yourJourneys: "나의 여정", newJourney: "새 여정", showJourney: "여정 보기", capacity: "여정 용량", firstExplored: "첫 질문", started: "시작", renameLabel: "여정 라벨 이름 바꾸기", remove: "삭제" }),
};

Object.assign(messages.es, { Pinned: "Fijado"});
Object.assign(messages.fr, { Pinned: "Épinglé"});
Object.assign(messages.de, { Pinned: "Angepinnt"});
Object.assign(messages.pt, { Pinned: "Fixada"});
Object.assign(messages.hi, { Pinned: "पिन की गई"});
Object.assign(messages.bn, { Pinned: "পিন করা"});
Object.assign(messages.ar, { Pinned: "مثبتة"});
Object.assign(messages["zh-CN"], { Pinned: "已置顶"});
Object.assign(messages.ja, { Pinned: "ピン留め"});
Object.assign(messages.ko, { Pinned: "고정됨"});

const backgroundMessages: Record<Locale, Record<string, string>> = {
  es: { "Researching in the background. You can safely leave this page.": "Investigando en segundo plano. Puedes salir de esta página con seguridad.", "Researching {count}": "Investigando {count}", "In progress": "En curso", "Research activity": "Actividad de investigación", "Researching now": "Investigando ahora", "This research could not be completed.": "No se pudo completar esta investigación.", "Retry research": "Reintentar investigación" },
  fr: { "Researching in the background. You can safely leave this page.": "Recherche en arrière-plan. Vous pouvez quitter cette page sans risque.", "Researching {count}": "Recherche {count}", "In progress": "En cours", "Research activity": "Activité de recherche", "Researching now": "Recherche en cours", "This research could not be completed.": "Cette recherche n’a pas pu aboutir.", "Retry research": "Relancer la recherche" },
  de: { "Researching in the background. You can safely leave this page.": "Die Recherche läuft im Hintergrund. Du kannst diese Seite sicher verlassen.", "Researching {count}": "Recherche {count}", "In progress": "In Bearbeitung", "Research activity": "Rechercheaktivität", "Researching now": "Wird recherchiert", "This research could not be completed.": "Diese Recherche konnte nicht abgeschlossen werden.", "Retry research": "Recherche wiederholen" },
  pt: { "Researching in the background. You can safely leave this page.": "Pesquisando em segundo plano. Você pode sair desta página com segurança.", "Researching {count}": "Pesquisando {count}", "In progress": "Em andamento", "Research activity": "Atividade de pesquisa", "Researching now": "Pesquisando agora", "This research could not be completed.": "Não foi possível concluir esta pesquisa.", "Retry research": "Tentar pesquisa novamente" },
  hi: { "Researching in the background. You can safely leave this page.": "पृष्ठभूमि में शोध चल रहा है। आप इस पेज से सुरक्षित रूप से जा सकते हैं।", "Researching {count}": "{count} पर शोध", "In progress": "जारी है", "Research activity": "शोध गतिविधि", "Researching now": "अभी शोध जारी है", "This research could not be completed.": "यह शोध पूरा नहीं हो सका।", "Retry research": "शोध फिर से करें" },
  bn: { "Researching in the background. You can safely leave this page.": "পটভূমিতে গবেষণা চলছে। আপনি নিরাপদে এই পৃষ্ঠা ছেড়ে যেতে পারেন।", "Researching {count}": "{count}টি গবেষণা চলছে", "In progress": "চলছে", "Research activity": "গবেষণা কার্যক্রম", "Researching now": "এখন গবেষণা চলছে", "This research could not be completed.": "এই গবেষণা সম্পন্ন করা যায়নি।", "Retry research": "গবেষণা আবার চেষ্টা করুন" },
  ar: { "Researching in the background. You can safely leave this page.": "يجري البحث في الخلفية. يمكنك مغادرة هذه الصفحة بأمان.", "Researching {count}": "جارٍ بحث {count}", "In progress": "قيد التنفيذ", "Research activity": "نشاط البحث", "Researching now": "يجري البحث الآن", "This research could not be completed.": "تعذر إكمال هذا البحث.", "Retry research": "إعادة محاولة البحث" },
  "zh-CN": { "Researching in the background. You can safely leave this page.": "正在后台研究。你可以放心离开此页面。", "Researching {count}": "正在研究 {count} 项", "In progress": "进行中", "Research activity": "研究动态", "Researching now": "正在研究", "This research could not be completed.": "此研究未能完成。", "Retry research": "重试研究" },
  ja: { "Researching in the background. You can safely leave this page.": "バックグラウンドで調査中です。このページを離れても問題ありません。", "Researching {count}": "{count}件を調査中", "In progress": "進行中", "Research activity": "調査状況", "Researching now": "調査中", "This research could not be completed.": "この調査は完了できませんでした。", "Retry research": "調査を再試行" },
  ko: { "Researching in the background. You can safely leave this page.": "백그라운드에서 조사 중입니다. 이 페이지를 나가도 안전합니다.", "Researching {count}": "{count}개 조사 중", "In progress": "진행 중", "Research activity": "조사 활동", "Researching now": "현재 조사 중", "This research could not be completed.": "이 조사를 완료하지 못했습니다.", "Retry research": "조사 다시 시도" },
};

for (const locale of Object.keys(backgroundMessages) as Locale[]) {
  Object.assign(messages[locale], backgroundMessages[locale]);
}

const progressMessages: Record<Locale, Record<string, string>> = {
  es: { "Searching sources and writing the answer": "Buscando fuentes y redactando la respuesta", "Checking citations and finding images": "Verificando citas y buscando imágenes", "Automatic timeout at {time}": "Tiempo límite automático: {time}" },
  fr: { "Searching sources and writing the answer": "Recherche des sources et rédaction de la réponse", "Checking citations and finding images": "Vérification des citations et recherche d’images", "Automatic timeout at {time}": "Expiration automatique à {time}" },
  de: { "Searching sources and writing the answer": "Quellen werden gesucht und die Antwort wird verfasst", "Checking citations and finding images": "Zitate werden geprüft und Bilder gesucht", "Automatic timeout at {time}": "Automatisches Zeitlimit um {time}" },
  pt: { "Searching sources and writing the answer": "Buscando fontes e escrevendo a resposta", "Checking citations and finding images": "Verificando citações e buscando imagens", "Automatic timeout at {time}": "Tempo limite automático às {time}" },
  hi: { "Searching sources and writing the answer": "स्रोत खोजे जा रहे हैं और उत्तर लिखा जा रहा है", "Checking citations and finding images": "उद्धरण जाँचे जा रहे हैं और चित्र खोजे जा रहे हैं", "Automatic timeout at {time}": "{time} पर अपने आप समय-सीमा समाप्त होगी" },
  bn: { "Searching sources and writing the answer": "উৎস খোঁজা ও উত্তর লেখা হচ্ছে", "Checking citations and finding images": "উদ্ধৃতি যাচাই ও ছবি খোঁজা হচ্ছে", "Automatic timeout at {time}": "{time}-এ স্বয়ংক্রিয় সময়সীমা" },
  ar: { "Searching sources and writing the answer": "جارٍ البحث عن المصادر وكتابة الإجابة", "Checking citations and finding images": "جارٍ التحقق من الاستشهادات والعثور على الصور", "Automatic timeout at {time}": "انتهاء المهلة تلقائيًا عند {time}" },
  "zh-CN": { "Searching sources and writing the answer": "正在搜索来源并撰写答案", "Checking citations and finding images": "正在核对引用并寻找图片", "Automatic timeout at {time}": "将在 {time} 自动超时" },
  ja: { "Searching sources and writing the answer": "情報源を検索して回答を作成中", "Checking citations and finding images": "引用を確認して画像を検索中", "Automatic timeout at {time}": "{time} に自動タイムアウト" },
  ko: { "Searching sources and writing the answer": "출처를 검색하고 답변을 작성하는 중", "Checking citations and finding images": "인용을 확인하고 이미지를 찾는 중", "Automatic timeout at {time}": "{time}에 자동 시간 초과" },
};

for (const locale of Object.keys(progressMessages) as Locale[]) {
  Object.assign(messages[locale], progressMessages[locale]);
}

const cancellationMessages: Record<Locale, Record<string, string>> = {
  es: { "Confirm research cancellation": "Confirmar cancelación de la investigación", "Stop this research?": "¿Detener esta investigación?", Stop: "Detener", "Stop research": "Detener investigación" },
  fr: { "Confirm research cancellation": "Confirmer l’arrêt de la recherche", "Stop this research?": "Arrêter cette recherche ?", Stop: "Arrêter", "Stop research": "Arrêter la recherche" },
  de: { "Confirm research cancellation": "Rechercheabbruch bestätigen", "Stop this research?": "Diese Recherche stoppen?", Stop: "Stoppen", "Stop research": "Recherche stoppen" },
  pt: { "Confirm research cancellation": "Confirmar cancelamento da pesquisa", "Stop this research?": "Parar esta pesquisa?", Stop: "Parar", "Stop research": "Parar pesquisa" },
  hi: { "Confirm research cancellation": "शोध रोकने की पुष्टि करें", "Stop this research?": "यह शोध रोकें?", Stop: "रोकें", "Stop research": "शोध रोकें" },
  bn: { "Confirm research cancellation": "গবেষণা বন্ধ করা নিশ্চিত করুন", "Stop this research?": "এই গবেষণা বন্ধ করবেন?", Stop: "বন্ধ করুন", "Stop research": "গবেষণা বন্ধ করুন" },
  ar: { "Confirm research cancellation": "تأكيد إيقاف البحث", "Stop this research?": "إيقاف هذا البحث؟", Stop: "إيقاف", "Stop research": "إيقاف البحث" },
  "zh-CN": { "Confirm research cancellation": "确认停止研究", "Stop this research?": "停止这项研究？", Stop: "停止", "Stop research": "停止研究" },
  ja: { "Confirm research cancellation": "リサーチ停止の確認", "Stop this research?": "このリサーチを停止しますか？", Stop: "停止", "Stop research": "リサーチを停止" },
  ko: { "Confirm research cancellation": "조사 중단 확인", "Stop this research?": "이 조사를 중단할까요?", Stop: "중단", "Stop research": "조사 중단" },
};

for (const locale of Object.keys(cancellationMessages) as Locale[]) {
  Object.assign(messages[locale], cancellationMessages[locale]);
}

const removalMessages: Record<Locale, Record<string, string>> = {
  es: { "Confirm failed research removal": "Confirmar eliminación de investigación fallida", "No journeys match this search": "Ningún recorrido coincide con esta búsqueda", "Remove failed research": "Eliminar investigación fallida", "Remove journey": "Eliminar recorrido", "Remove this failed research?": "¿Eliminar esta investigación fallida?", "Try a broader question or journey label.": "Prueba con una pregunta o etiqueta de recorrido más amplia." },
  fr: { "Confirm failed research removal": "Confirmer la suppression de la recherche échouée", "No journeys match this search": "Aucun parcours ne correspond à cette recherche", "Remove failed research": "Supprimer la recherche échouée", "Remove journey": "Supprimer le parcours", "Remove this failed research?": "Supprimer cette recherche échouée ?", "Try a broader question or journey label.": "Essayez une question ou une étiquette de parcours plus générale." },
  de: { "Confirm failed research removal": "Entfernen der fehlgeschlagenen Recherche bestätigen", "No journeys match this search": "Keine Journey entspricht dieser Suche", "Remove failed research": "Fehlgeschlagene Recherche entfernen", "Remove journey": "Journey entfernen", "Remove this failed research?": "Diese fehlgeschlagene Recherche entfernen?", "Try a broader question or journey label.": "Versuche eine allgemeinere Frage oder Journey-Bezeichnung." },
  pt: { "Confirm failed research removal": "Confirmar remoção da pesquisa com falha", "No journeys match this search": "Nenhuma jornada corresponde a esta busca", "Remove failed research": "Remover pesquisa com falha", "Remove journey": "Remover jornada", "Remove this failed research?": "Remover esta pesquisa com falha?", "Try a broader question or journey label.": "Tente uma pergunta ou um rótulo de jornada mais amplo." },
  hi: { "Confirm failed research removal": "असफल शोध हटाने की पुष्टि करें", "No journeys match this search": "इस खोज से कोई यात्रा नहीं मिली", "Remove failed research": "असफल शोध हटाएँ", "Remove journey": "यात्रा हटाएँ", "Remove this failed research?": "यह असफल शोध हटाएँ?", "Try a broader question or journey label.": "थोड़ा व्यापक प्रश्न या यात्रा लेबल आज़माएँ।" },
  bn: { "Confirm failed research removal": "ব্যর্থ গবেষণা সরানো নিশ্চিত করুন", "No journeys match this search": "এই অনুসন্ধানের সঙ্গে কোনো যাত্রা মেলেনি", "Remove failed research": "ব্যর্থ গবেষণা সরান", "Remove journey": "যাত্রা সরান", "Remove this failed research?": "এই ব্যর্থ গবেষণাটি সরাবেন?", "Try a broader question or journey label.": "আরও বিস্তৃত প্রশ্ন বা যাত্রার লেবেল চেষ্টা করুন।" },
  ar: { "Confirm failed research removal": "تأكيد إزالة البحث الفاشل", "No journeys match this search": "لا توجد رحلات تطابق هذا البحث", "Remove failed research": "إزالة البحث الفاشل", "Remove journey": "إزالة الرحلة", "Remove this failed research?": "إزالة هذا البحث الفاشل؟", "Try a broader question or journey label.": "جرّب سؤالاً أو تسمية رحلة أوسع." },
  "zh-CN": { "Confirm failed research removal": "确认移除失败的研究", "No journeys match this search": "没有旅程符合此搜索", "Remove failed research": "移除失败的研究", "Remove journey": "移除旅程", "Remove this failed research?": "移除这项失败的研究？", "Try a broader question or journey label.": "请尝试更宽泛的问题或旅程标签。" },
  ja: { "Confirm failed research removal": "失敗したリサーチの削除を確認", "No journeys match this search": "この検索に一致するジャーニーはありません", "Remove failed research": "失敗したリサーチを削除", "Remove journey": "ジャーニーを削除", "Remove this failed research?": "この失敗したリサーチを削除しますか？", "Try a broader question or journey label.": "より広い質問またはジャーニーラベルを試してください。" },
  ko: { "Confirm failed research removal": "실패한 조사 삭제 확인", "No journeys match this search": "이 검색과 일치하는 여정이 없습니다", "Remove failed research": "실패한 조사 삭제", "Remove journey": "여정 삭제", "Remove this failed research?": "이 실패한 조사를 삭제할까요?", "Try a broader question or journey label.": "더 넓은 질문이나 여정 라벨을 사용해 보세요." },
};

for (const locale of Object.keys(removalMessages) as Locale[]) {
  Object.assign(messages[locale], removalMessages[locale]);
}

function journeyMessages(words: {
  journeys: string;
  yourJourneys: string;
  newJourney: string;
  showJourney: string;
  capacity: string;
  firstExplored: string;
  started: string;
  renameLabel: string;
  remove: string;
}): Record<string, string> {
  return {
    Journeys: words.journeys,
    "Your journeys": words.yourJourneys,
    "New journey": words.newJourney,
    "Show Journey": words.showJourney,
    "Show journey: {question}": `${words.showJourney}: {question}`,
    "Journey capacity": words.capacity,
    "Journey capacity full": `${words.capacity} — full`,
    "First explored": words.firstExplored,
    Started: words.started,
    "Rename journey label": words.renameLabel,
    "Rename label": words.renameLabel,
    Remove: words.remove,

    "Each journey follows the path from your first question through every question you explored afterward.": `${words.firstExplored} → ${words.journeys}`,
    "{count} of {limit} journeys": `{count} / {limit} ${words.journeys}`,
    "Journey filters": `${words.journeys} — filters`,
    "First question or journey label": `${words.firstExplored} / label`,
    Pinned: "Pinned",

    "Manage journey": words.journeys,
    "Label: {label}": `Label: {label}`,
    "Confirm journey removal": words.remove,
    "Remove this journey?": `${words.remove}?`,


    "No journeys yet": `${words.journeys} — 0`,
    "Explore a question to begin your first journey.": words.firstExplored,
    "Start a journey": words.newJourney,
    "Opening journeys…": `${words.journeys}…`,
    "Opening your CuriosityPedia journeys…": `CuriosityPedia · ${words.journeys}…`,
    "Your guest journeys are still separate.": words.yourJourneys,
    "Your journey capacity is full ({count}/{limit}). Delete one journey to make room.": `${words.capacity} ({count}/{limit}). ${words.remove}.`,
    "Your journeys need space.": words.capacity,
    "Open journeys": words.journeys,
    "Current knowledge session question": words.firstExplored,
  };
}

export default messages;
