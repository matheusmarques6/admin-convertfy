// Tracking module translations
// Supported languages: pt-BR, en, de, it, es

export type TrackingLang = "pt-BR" | "en" | "de" | "it" | "es"

export const SUPPORTED_LANGUAGES: { value: TrackingLang; label: string; flag: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "es", label: "Español", flag: "🇪🇸" },
]

interface TrackingTranslations {
  // Page header
  pageTitle: string
  pageSubtitle: string

  // Tabs
  tabDashboard: string
  tabPlugin: string
  tabInstallation: string

  // Dashboard stats
  totalOrders: string
  inTransit: string
  deliveredLabel: string
  deliveryRate: string

  // Dashboard table
  recentOrders: string
  searchPlaceholder: string
  allStatuses: string
  tableOrder: string
  tableCustomer: string
  tableValue: string
  tableTracking: string
  tableStatus: string
  tableDate: string
  noOrdersFound: string
  noOrdersTracked: string
  showingOrders: string
  viewAll: string

  // Statuses
  statusPending: string
  statusInfoReceived: string
  statusInTransit: string
  statusOutForDelivery: string
  statusDelivered: string
  statusFailedAttempt: string
  statusException: string
  statusExpired: string

  // Plugin config
  settings: string
  pluginType: string
  typeComplete: string
  typeBasic: string
  typeCompleteDesc: string
  typeBasicDesc: string
  color: string
  language: string
  hideCarrier: string
  hideCarrierDesc: string
  hideRedirect: string
  hideRedirectDesc: string
  estimatedDelivery: string
  estimatedDeliveryDesc: string
  carrierLogo: string
  carrierLogoDesc: string
  blockedWords: string
  blockedWordsPlaceholder: string
  blockedWordsDesc: string
  notFoundMessage: string
  saveSettings: string
  saved: string
  noStoreLinked: string

  // Preview
  livePreview: string
  previewDescription: string
  trackYourOrder: string
  enterTrackingNumber: string
  examplePlaceholder: string
  forecast: string
  inTransitToDestination: string
  viewAtCarrier: string
  poweredBy: string

  // Timeline steps (complete)
  stepOrderPlaced: string
  stepConfirmed: string
  stepPreparing: string
  stepShipped: string
  stepInTransit: string
  stepCustoms: string
  stepLocalTransit: string
  stepOutForDelivery: string
  stepDelivered: string

  // Installation
  yourStoreId: string
  storeIdDesc: string
  installTitle: string
  installDesc: string
  widgetJs: string
  widgetJsDesc: string
  recommended: string
  iframeEmbed: string
  iframeDesc: string
  directLink: string
  directLinkDesc: string
  copy: string
  copied: string
  open: string

  // How to install
  howToInstall: string
  installStep1: string
  installStep2: string
  installStep3: string
  installStep4: string
  installStep5: string
  platformNote: string

  // Error
  loadError: string
  loadErrorDesc: string
  tryAgain: string
  saveError: string
}

const ptBR: TrackingTranslations = {
  pageTitle: "Rastreamento",
  pageSubtitle: "Gerencie entregas, configure o plugin e instale no seu site",
  tabDashboard: "Dashboard",
  tabPlugin: "Plugin de Rastreamento",
  tabInstallation: "Instalação",
  totalOrders: "Total Pedidos",
  inTransit: "Em Trânsito",
  deliveredLabel: "Entregues",
  deliveryRate: "Taxa Entrega",
  recentOrders: "Pedidos Recentes",
  searchPlaceholder: "Buscar...",
  allStatuses: "Todos",
  tableOrder: "Pedido",
  tableCustomer: "Cliente",
  tableValue: "Valor",
  tableTracking: "Rastreio",
  tableStatus: "Status",
  tableDate: "Data",
  noOrdersFound: "Nenhum pedido encontrado",
  noOrdersTracked: "Nenhum pedido rastreado. Configure na aba \"Plugin de Rastreamento\".",
  showingOrders: "Mostrando {count} pedidos",
  viewAll: "Ver todos",
  statusPending: "Pendente",
  statusInfoReceived: "Informação Recebida",
  statusInTransit: "Em Trânsito",
  statusOutForDelivery: "Saiu para Entrega",
  statusDelivered: "Entregue",
  statusFailedAttempt: "Tentativa Falha",
  statusException: "Exceção",
  statusExpired: "Expirado",
  settings: "Configurações",
  pluginType: "Tipo",
  typeComplete: "Completo (9 etapas)",
  typeBasic: "Básico (5 etapas)",
  typeCompleteDesc: "Inclui alfândega e centros de distribuição.",
  typeBasicDesc: "Etapas principais do rastreamento.",
  color: "Cor",
  language: "Idioma",
  hideCarrier: "Esconder transportadora",
  hideCarrierDesc: "Oculta nome/ícone da transportadora",
  hideRedirect: "Esconder redirecionamento",
  hideRedirectDesc: "Oculta link para site da transportadora",
  estimatedDelivery: "Previsão de entrega",
  estimatedDeliveryDesc: "Mostra data estimada",
  carrierLogo: "Logo da transportadora",
  carrierLogoDesc: "Exibe logotipo",
  blockedWords: "Palavras Bloqueadas",
  blockedWordsPlaceholder: "palavra1, palavra2",
  blockedWordsDesc: "Oculta essas palavras das atualizações",
  notFoundMessage: "Mensagem \"Não encontrado\"",
  saveSettings: "Salvar Configurações",
  saved: "Salvo!",
  noStoreLinked: "Nenhuma loja de rastreamento vinculada.",
  livePreview: "Preview ao Vivo",
  previewDescription: "Assim seus clientes verão o rastreamento",
  trackYourOrder: "Rastreie seu Pedido",
  enterTrackingNumber: "Insira o código de rastreio",
  examplePlaceholder: "Ex: #1234",
  forecast: "Previsão",
  inTransitToDestination: "Em trânsito para o destino",
  viewAtCarrier: "Ver no site da transportadora",
  poweredBy: "Powered by Convertfy Tracking + 17track",
  stepOrderPlaced: "Pedido Realizado",
  stepConfirmed: "Confirmado",
  stepPreparing: "Preparando",
  stepShipped: "Despachado",
  stepInTransit: "Em Trânsito",
  stepCustoms: "Alfândega",
  stepLocalTransit: "Transporte Local",
  stepOutForDelivery: "Saiu p/ Entrega",
  stepDelivered: "Entregue",
  installTitle: "Instalar no Seu Site",
  installDesc: "Escolha uma opção para adicionar o rastreamento ao seu site.",
  yourStoreId: "Seu Store ID:",
  storeIdDesc: "ID único da sua loja, já incluído nos códigos abaixo.",
  widgetJs: "Widget JavaScript",
  widgetJsDesc: "Cole no HTML da página. As configurações (cor, tipo, idioma) são aplicadas automaticamente.",
  recommended: "Recomendado",
  iframeEmbed: "Embed via iFrame",
  iframeDesc: "Para plataformas que não permitem scripts externos (ex: Nuvemshop).",
  directLink: "Link da Página de Rastreamento",
  directLinkDesc: "Use nos emails de confirmação ou como botão na loja.",
  copy: "Copiar",
  copied: "Copiado",
  open: "Abrir",
  howToInstall: "Como Instalar",
  installStep1: "Configure o plugin na aba \"Plugin de Rastreamento\" (cor, tipo, idioma).",
  installStep2: "Copie o código acima (Widget JS ou iFrame).",
  installStep3: "Na sua plataforma, crie ou acesse a página de rastreio.",
  installStep4: "Incorpore o HTML (busque \"HTML personalizado\" ou \"<>\" no editor).",
  installStep5: "Salve e publique. O widget aparece com suas configurações.",
  platformNote: "Plataformas como Nuvemshop podem não aceitar scripts. Use iFrame ou o Link Direto.",
  loadError: "Erro ao carregar",
  loadErrorDesc: "Não foi possível carregar os dados.",
  tryAgain: "Tentar novamente",
  saveError: "Erro ao salvar",
}

const en: TrackingTranslations = {
  pageTitle: "Tracking",
  pageSubtitle: "Manage deliveries, configure the plugin and install on your site",
  tabDashboard: "Dashboard",
  tabPlugin: "Tracking Plugin",
  tabInstallation: "Installation",
  totalOrders: "Total Orders",
  inTransit: "In Transit",
  deliveredLabel: "Delivered",
  deliveryRate: "Delivery Rate",
  recentOrders: "Recent Orders",
  searchPlaceholder: "Search...",
  allStatuses: "All",
  tableOrder: "Order",
  tableCustomer: "Customer",
  tableValue: "Value",
  tableTracking: "Tracking",
  tableStatus: "Status",
  tableDate: "Date",
  noOrdersFound: "No orders found",
  noOrdersTracked: "No tracked orders. Set up in the \"Tracking Plugin\" tab.",
  showingOrders: "Showing {count} orders",
  viewAll: "View all",
  statusPending: "Pending",
  statusInfoReceived: "Info Received",
  statusInTransit: "In Transit",
  statusOutForDelivery: "Out for Delivery",
  statusDelivered: "Delivered",
  statusFailedAttempt: "Failed Attempt",
  statusException: "Exception",
  statusExpired: "Expired",
  settings: "Settings",
  pluginType: "Type",
  typeComplete: "Complete (9 steps)",
  typeBasic: "Basic (5 steps)",
  typeCompleteDesc: "Includes customs and distribution centers.",
  typeBasicDesc: "Main tracking steps.",
  color: "Color",
  language: "Language",
  hideCarrier: "Hide carrier",
  hideCarrierDesc: "Hides carrier name/icon",
  hideRedirect: "Hide redirect",
  hideRedirectDesc: "Hides link to carrier website",
  estimatedDelivery: "Estimated delivery",
  estimatedDeliveryDesc: "Shows estimated date",
  carrierLogo: "Carrier logo",
  carrierLogoDesc: "Shows logo",
  blockedWords: "Blocked Words",
  blockedWordsPlaceholder: "word1, word2",
  blockedWordsDesc: "Hides these words from updates",
  notFoundMessage: "\"Not found\" message",
  saveSettings: "Save Settings",
  saved: "Saved!",
  noStoreLinked: "No tracking store linked.",
  livePreview: "Live Preview",
  previewDescription: "This is how your customers will see the tracking",
  trackYourOrder: "Track Your Order",
  enterTrackingNumber: "Enter your tracking number",
  examplePlaceholder: "e.g. #1234",
  forecast: "Estimated",
  inTransitToDestination: "In transit to destination",
  viewAtCarrier: "View on carrier website",
  poweredBy: "Powered by Convertfy Tracking + 17track",
  stepOrderPlaced: "Order Placed",
  stepConfirmed: "Confirmed",
  stepPreparing: "Preparing",
  stepShipped: "Shipped",
  stepInTransit: "In Transit",
  stepCustoms: "Customs",
  stepLocalTransit: "Local Transit",
  stepOutForDelivery: "Out for Delivery",
  stepDelivered: "Delivered",
  installTitle: "Install on Your Site",
  installDesc: "Choose an option to add tracking to your site.",
  yourStoreId: "Your Store ID:",
  storeIdDesc: "Your store's unique ID, already included in the codes below.",
  widgetJs: "JavaScript Widget",
  widgetJsDesc: "Paste in the page HTML. Settings (color, type, language) are applied automatically.",
  recommended: "Recommended",
  iframeEmbed: "iFrame Embed",
  iframeDesc: "For platforms that don't allow external scripts (e.g. Nuvemshop).",
  directLink: "Tracking Page Link",
  directLinkDesc: "Use in confirmation emails or as a button in your store.",
  copy: "Copy",
  copied: "Copied",
  open: "Open",
  howToInstall: "How to Install",
  installStep1: "Configure the plugin in the \"Tracking Plugin\" tab (color, type, language).",
  installStep2: "Copy the code above (Widget JS or iFrame).",
  installStep3: "In your platform, create or access the tracking page.",
  installStep4: "Embed the HTML (look for \"Custom HTML\" or \"<>\" in the editor).",
  installStep5: "Save and publish. The widget appears with your settings.",
  platformNote: "Platforms like Nuvemshop may not accept scripts. Use iFrame or the Direct Link.",
  loadError: "Error loading",
  loadErrorDesc: "Could not load the data.",
  tryAgain: "Try again",
  saveError: "Error saving",
}

const de: TrackingTranslations = {
  pageTitle: "Sendungsverfolgung",
  pageSubtitle: "Lieferungen verwalten, Plugin konfigurieren und auf Ihrer Website installieren",
  tabDashboard: "Dashboard",
  tabPlugin: "Tracking-Plugin",
  tabInstallation: "Installation",
  totalOrders: "Bestellungen",
  inTransit: "Unterwegs",
  deliveredLabel: "Zugestellt",
  deliveryRate: "Zustellrate",
  recentOrders: "Letzte Bestellungen",
  searchPlaceholder: "Suchen...",
  allStatuses: "Alle",
  tableOrder: "Bestellung",
  tableCustomer: "Kunde",
  tableValue: "Wert",
  tableTracking: "Tracking",
  tableStatus: "Status",
  tableDate: "Datum",
  noOrdersFound: "Keine Bestellungen gefunden",
  noOrdersTracked: "Keine verfolgten Bestellungen. Konfigurieren Sie im Tab \"Tracking-Plugin\".",
  showingOrders: "{count} Bestellungen angezeigt",
  viewAll: "Alle anzeigen",
  statusPending: "Ausstehend",
  statusInfoReceived: "Info erhalten",
  statusInTransit: "Unterwegs",
  statusOutForDelivery: "In Zustellung",
  statusDelivered: "Zugestellt",
  statusFailedAttempt: "Fehlversuch",
  statusException: "Ausnahme",
  statusExpired: "Abgelaufen",
  settings: "Einstellungen",
  pluginType: "Typ",
  typeComplete: "Vollständig (9 Schritte)",
  typeBasic: "Basis (5 Schritte)",
  typeCompleteDesc: "Enthält Zoll und Verteilzentren.",
  typeBasicDesc: "Hauptschritte der Sendungsverfolgung.",
  color: "Farbe",
  language: "Sprache",
  hideCarrier: "Spediteur ausblenden",
  hideCarrierDesc: "Blendet Name/Icon des Spediteurs aus",
  hideRedirect: "Weiterleitung ausblenden",
  hideRedirectDesc: "Blendet Link zur Spediteur-Website aus",
  estimatedDelivery: "Voraussichtliche Lieferung",
  estimatedDeliveryDesc: "Zeigt voraussichtliches Datum",
  carrierLogo: "Spediteur-Logo",
  carrierLogoDesc: "Zeigt Logo an",
  blockedWords: "Blockierte Wörter",
  blockedWordsPlaceholder: "Wort1, Wort2",
  blockedWordsDesc: "Blendet diese Wörter aus Updates aus",
  notFoundMessage: "\"Nicht gefunden\"-Nachricht",
  saveSettings: "Einstellungen speichern",
  saved: "Gespeichert!",
  noStoreLinked: "Kein Tracking-Shop verknüpft.",
  livePreview: "Live-Vorschau",
  previewDescription: "So sehen Ihre Kunden die Sendungsverfolgung",
  trackYourOrder: "Bestellung verfolgen",
  enterTrackingNumber: "Tracking-Nummer eingeben",
  examplePlaceholder: "z.B. #1234",
  forecast: "Voraussichtlich",
  inTransitToDestination: "Unterwegs zum Ziel",
  viewAtCarrier: "Auf Spediteur-Website ansehen",
  poweredBy: "Powered by Convertfy Tracking + 17track",
  stepOrderPlaced: "Bestellt",
  stepConfirmed: "Bestätigt",
  stepPreparing: "In Vorbereitung",
  stepShipped: "Versandt",
  stepInTransit: "Unterwegs",
  stepCustoms: "Zoll",
  stepLocalTransit: "Lokaler Transport",
  stepOutForDelivery: "In Zustellung",
  stepDelivered: "Zugestellt",
  installTitle: "Auf Ihrer Website installieren",
  installDesc: "Wählen Sie eine Option, um Tracking zu Ihrer Website hinzuzufügen.",
  yourStoreId: "Ihre Store-ID:",
  storeIdDesc: "Einzigartige ID Ihres Shops, bereits in den Codes enthalten.",
  widgetJs: "JavaScript-Widget",
  widgetJsDesc: "Im HTML der Seite einfügen. Einstellungen (Farbe, Typ, Sprache) werden automatisch angewendet.",
  recommended: "Empfohlen",
  iframeEmbed: "iFrame-Einbettung",
  iframeDesc: "Für Plattformen, die keine externen Skripte erlauben.",
  directLink: "Tracking-Seiten-Link",
  directLinkDesc: "Verwenden Sie ihn in Bestätigungs-E-Mails oder als Button in Ihrem Shop.",
  copy: "Kopieren",
  copied: "Kopiert",
  open: "Öffnen",
  howToInstall: "Installationsanleitung",
  installStep1: "Konfigurieren Sie das Plugin im Tab \"Tracking-Plugin\" (Farbe, Typ, Sprache).",
  installStep2: "Kopieren Sie den Code oben (Widget JS oder iFrame).",
  installStep3: "Erstellen oder öffnen Sie die Tracking-Seite auf Ihrer Plattform.",
  installStep4: "Fügen Sie den HTML-Code ein (suchen Sie nach \"Benutzerdefiniertes HTML\" oder \"<>\" im Editor).",
  installStep5: "Speichern und veröffentlichen. Das Widget erscheint mit Ihren Einstellungen.",
  platformNote: "Einige Plattformen akzeptieren keine Skripte. Verwenden Sie iFrame oder den direkten Link.",
  loadError: "Ladefehler",
  loadErrorDesc: "Daten konnten nicht geladen werden.",
  tryAgain: "Erneut versuchen",
  saveError: "Speicherfehler",
}

const it: TrackingTranslations = {
  pageTitle: "Tracciamento",
  pageSubtitle: "Gestisci le consegne, configura il plugin e installalo sul tuo sito",
  tabDashboard: "Dashboard",
  tabPlugin: "Plugin di Tracciamento",
  tabInstallation: "Installazione",
  totalOrders: "Ordini Totali",
  inTransit: "In Transito",
  deliveredLabel: "Consegnati",
  deliveryRate: "Tasso Consegna",
  recentOrders: "Ordini Recenti",
  searchPlaceholder: "Cerca...",
  allStatuses: "Tutti",
  tableOrder: "Ordine",
  tableCustomer: "Cliente",
  tableValue: "Valore",
  tableTracking: "Tracciamento",
  tableStatus: "Stato",
  tableDate: "Data",
  noOrdersFound: "Nessun ordine trovato",
  noOrdersTracked: "Nessun ordine tracciato. Configura nella scheda \"Plugin di Tracciamento\".",
  showingOrders: "Mostrando {count} ordini",
  viewAll: "Vedi tutti",
  statusPending: "In attesa",
  statusInfoReceived: "Info ricevuta",
  statusInTransit: "In transito",
  statusOutForDelivery: "In consegna",
  statusDelivered: "Consegnato",
  statusFailedAttempt: "Tentativo fallito",
  statusException: "Eccezione",
  statusExpired: "Scaduto",
  settings: "Impostazioni",
  pluginType: "Tipo",
  typeComplete: "Completo (9 passaggi)",
  typeBasic: "Base (5 passaggi)",
  typeCompleteDesc: "Include dogana e centri di distribuzione.",
  typeBasicDesc: "Passaggi principali del tracciamento.",
  color: "Colore",
  language: "Lingua",
  hideCarrier: "Nascondi corriere",
  hideCarrierDesc: "Nasconde nome/icona del corriere",
  hideRedirect: "Nascondi reindirizzamento",
  hideRedirectDesc: "Nasconde il link al sito del corriere",
  estimatedDelivery: "Consegna stimata",
  estimatedDeliveryDesc: "Mostra la data stimata",
  carrierLogo: "Logo del corriere",
  carrierLogoDesc: "Mostra il logo",
  blockedWords: "Parole bloccate",
  blockedWordsPlaceholder: "parola1, parola2",
  blockedWordsDesc: "Nasconde queste parole dagli aggiornamenti",
  notFoundMessage: "Messaggio \"Non trovato\"",
  saveSettings: "Salva Impostazioni",
  saved: "Salvato!",
  noStoreLinked: "Nessun negozio di tracciamento collegato.",
  livePreview: "Anteprima dal Vivo",
  previewDescription: "Ecco come i tuoi clienti vedranno il tracciamento",
  trackYourOrder: "Traccia il tuo Ordine",
  enterTrackingNumber: "Inserisci il numero di tracciamento",
  examplePlaceholder: "es. #1234",
  forecast: "Previsto",
  inTransitToDestination: "In transito verso la destinazione",
  viewAtCarrier: "Vedi sul sito del corriere",
  poweredBy: "Powered by Convertfy Tracking + 17track",
  stepOrderPlaced: "Ordine Effettuato",
  stepConfirmed: "Confermato",
  stepPreparing: "In Preparazione",
  stepShipped: "Spedito",
  stepInTransit: "In Transito",
  stepCustoms: "Dogana",
  stepLocalTransit: "Trasporto Locale",
  stepOutForDelivery: "In Consegna",
  stepDelivered: "Consegnato",
  installTitle: "Installa sul Tuo Sito",
  installDesc: "Scegli un'opzione per aggiungere il tracciamento al tuo sito.",
  yourStoreId: "Il tuo Store ID:",
  storeIdDesc: "ID unico del tuo negozio, già incluso nei codici sottostanti.",
  widgetJs: "Widget JavaScript",
  widgetJsDesc: "Incolla nell'HTML della pagina. Le impostazioni (colore, tipo, lingua) vengono applicate automaticamente.",
  recommended: "Consigliato",
  iframeEmbed: "Incorporamento iFrame",
  iframeDesc: "Per piattaforme che non permettono script esterni.",
  directLink: "Link Pagina Tracciamento",
  directLinkDesc: "Usa nelle email di conferma o come pulsante nel negozio.",
  copy: "Copia",
  copied: "Copiato",
  open: "Apri",
  howToInstall: "Come Installare",
  installStep1: "Configura il plugin nella scheda \"Plugin di Tracciamento\" (colore, tipo, lingua).",
  installStep2: "Copia il codice sopra (Widget JS o iFrame).",
  installStep3: "Nella tua piattaforma, crea o accedi alla pagina di tracciamento.",
  installStep4: "Incorpora l'HTML (cerca \"HTML personalizzato\" o \"<>\" nell'editor).",
  installStep5: "Salva e pubblica. Il widget appare con le tue impostazioni.",
  platformNote: "Alcune piattaforme potrebbero non accettare script. Usa iFrame o il Link Diretto.",
  loadError: "Errore di caricamento",
  loadErrorDesc: "Impossibile caricare i dati.",
  tryAgain: "Riprova",
  saveError: "Errore di salvataggio",
}

const es: TrackingTranslations = {
  pageTitle: "Rastreo",
  pageSubtitle: "Gestiona entregas, configura el plugin e instálalo en tu sitio",
  tabDashboard: "Dashboard",
  tabPlugin: "Plugin de Rastreo",
  tabInstallation: "Instalación",
  totalOrders: "Total Pedidos",
  inTransit: "En Tránsito",
  deliveredLabel: "Entregados",
  deliveryRate: "Tasa Entrega",
  recentOrders: "Pedidos Recientes",
  searchPlaceholder: "Buscar...",
  allStatuses: "Todos",
  tableOrder: "Pedido",
  tableCustomer: "Cliente",
  tableValue: "Valor",
  tableTracking: "Rastreo",
  tableStatus: "Estado",
  tableDate: "Fecha",
  noOrdersFound: "No se encontraron pedidos",
  noOrdersTracked: "Sin pedidos rastreados. Configure en la pestaña \"Plugin de Rastreo\".",
  showingOrders: "Mostrando {count} pedidos",
  viewAll: "Ver todos",
  statusPending: "Pendiente",
  statusInfoReceived: "Info Recibida",
  statusInTransit: "En Tránsito",
  statusOutForDelivery: "En Reparto",
  statusDelivered: "Entregado",
  statusFailedAttempt: "Intento Fallido",
  statusException: "Excepción",
  statusExpired: "Expirado",
  settings: "Configuración",
  pluginType: "Tipo",
  typeComplete: "Completo (9 pasos)",
  typeBasic: "Básico (5 pasos)",
  typeCompleteDesc: "Incluye aduana y centros de distribución.",
  typeBasicDesc: "Pasos principales del rastreo.",
  color: "Color",
  language: "Idioma",
  hideCarrier: "Ocultar transportista",
  hideCarrierDesc: "Oculta nombre/icono del transportista",
  hideRedirect: "Ocultar redirección",
  hideRedirectDesc: "Oculta enlace al sitio del transportista",
  estimatedDelivery: "Entrega estimada",
  estimatedDeliveryDesc: "Muestra fecha estimada",
  carrierLogo: "Logo del transportista",
  carrierLogoDesc: "Muestra logotipo",
  blockedWords: "Palabras Bloqueadas",
  blockedWordsPlaceholder: "palabra1, palabra2",
  blockedWordsDesc: "Oculta estas palabras de las actualizaciones",
  notFoundMessage: "Mensaje \"No encontrado\"",
  saveSettings: "Guardar Configuración",
  saved: "¡Guardado!",
  noStoreLinked: "Ninguna tienda de rastreo vinculada.",
  livePreview: "Vista Previa en Vivo",
  previewDescription: "Así verán tus clientes el rastreo",
  trackYourOrder: "Rastrea tu Pedido",
  enterTrackingNumber: "Ingresa tu número de rastreo",
  examplePlaceholder: "Ej: #1234",
  forecast: "Estimado",
  inTransitToDestination: "En tránsito hacia el destino",
  viewAtCarrier: "Ver en sitio del transportista",
  poweredBy: "Powered by Convertfy Tracking + 17track",
  stepOrderPlaced: "Pedido Realizado",
  stepConfirmed: "Confirmado",
  stepPreparing: "Preparando",
  stepShipped: "Despachado",
  stepInTransit: "En Tránsito",
  stepCustoms: "Aduana",
  stepLocalTransit: "Transporte Local",
  stepOutForDelivery: "En Reparto",
  stepDelivered: "Entregado",
  installTitle: "Instalar en Tu Sitio",
  installDesc: "Elige una opción para agregar el rastreo a tu sitio.",
  yourStoreId: "Tu Store ID:",
  storeIdDesc: "ID único de tu tienda, ya incluido en los códigos de abajo.",
  widgetJs: "Widget JavaScript",
  widgetJsDesc: "Pega en el HTML de la página. La configuración (color, tipo, idioma) se aplica automáticamente.",
  recommended: "Recomendado",
  iframeEmbed: "Embed via iFrame",
  iframeDesc: "Para plataformas que no permiten scripts externos.",
  directLink: "Link de Página de Rastreo",
  directLinkDesc: "Usa en emails de confirmación o como botón en la tienda.",
  copy: "Copiar",
  copied: "Copiado",
  open: "Abrir",
  howToInstall: "Cómo Instalar",
  installStep1: "Configura el plugin en la pestaña \"Plugin de Rastreo\" (color, tipo, idioma).",
  installStep2: "Copia el código de arriba (Widget JS o iFrame).",
  installStep3: "En tu plataforma, crea o accede a la página de rastreo.",
  installStep4: "Incorpora el HTML (busca \"HTML personalizado\" o \"<>\" en el editor).",
  installStep5: "Guarda y publica. El widget aparece con tu configuración.",
  platformNote: "Algunas plataformas pueden no aceptar scripts. Usa iFrame o el Link Directo.",
  loadError: "Error al cargar",
  loadErrorDesc: "No se pudieron cargar los datos.",
  tryAgain: "Intentar de nuevo",
  saveError: "Error al guardar",
}

const translations: Record<TrackingLang, TrackingTranslations> = {
  "pt-BR": ptBR,
  en,
  de,
  it,
  es,
}

export function getTrackingTranslations(lang: string): TrackingTranslations {
  return translations[lang as TrackingLang] || translations["pt-BR"]
}

export function getStatusLabel(status: string, lang: string): string {
  const t = getTrackingTranslations(lang)
  const map: Record<string, string> = {
    pending: t.statusPending,
    info_received: t.statusInfoReceived,
    in_transit: t.statusInTransit,
    out_for_delivery: t.statusOutForDelivery,
    delivered: t.statusDelivered,
    failed_attempt: t.statusFailedAttempt,
    exception: t.statusException,
    expired: t.statusExpired,
  }
  return map[status] || status
}

export function getTimelineStepLabel(stepKey: string, lang: string): string {
  const t = getTrackingTranslations(lang)
  const map: Record<string, string> = {
    order_placed: t.stepOrderPlaced,
    confirmed: t.stepConfirmed,
    preparing: t.stepPreparing,
    shipped: t.stepShipped,
    in_transit: t.stepInTransit,
    customs: t.stepCustoms,
    local_transit: t.stepLocalTransit,
    out_for_delivery: t.stepOutForDelivery,
    delivered: t.stepDelivered,
  }
  return map[stepKey] || stepKey
}

export function getDateLocale(lang: string): string {
  const map: Record<string, string> = {
    "pt-BR": "pt-BR",
    en: "en-US",
    de: "de-DE",
    it: "it-IT",
    es: "es-ES",
  }
  return map[lang] || "pt-BR"
}

export function getCurrencyLocale(lang: string): string {
  return getDateLocale(lang)
}

export function getDefaultNotFoundMessage(lang: string): string {
  const messages: Record<string, string> = {
    "pt-BR": "Pedido não encontrado. Verifique o número informado e tente novamente.",
    en: "Order not found. Please check the number and try again.",
    de: "Bestellung nicht gefunden. Bitte überprüfen Sie die Nummer und versuchen Sie es erneut.",
    it: "Ordine non trovato. Verifica il numero inserito e riprova.",
    es: "Pedido no encontrado. Verifica el número ingresado e intenta de nuevo.",
  }
  return messages[lang] || messages["pt-BR"]
}
