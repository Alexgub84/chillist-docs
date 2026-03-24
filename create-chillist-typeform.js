#!/usr/bin/env node

/**
 * Chillist User Research Questionnaire v3 — Typeform Creator
 * 
 * Discovery-first: understand how people organize and what hurts,
 * then validate specific features with informed context.
 * 
 * Usage:
 *   TYPEFORM_TOKEN=your_token_here node create-chillist-typeform.js
 */

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TYPEFORM_TOKEN;
const ICON_PATH = path.join(__dirname, "chillist-logo-no-text.png");

if (!TOKEN) {
  console.error("\n❌  Missing API token.\n");
  console.error("Run with:  TYPEFORM_TOKEN=your_token_here node create-chillist-typeform.js\n");
  console.error("Get your token at: https://www.typeform.com/developers/get-started/personal-access-token/\n");
  process.exit(1);
}

/**
 * Upload an image to Typeform and return the image href.
 */
async function uploadImage(filePath) {
  console.log("📤  Uploading icon to Typeform...");
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString("base64");
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mediaType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

  const response = await fetch("https://api.typeform.com/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image: base64,
      media_type: mediaType,
      file_name: fileName
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("❌  Image upload failed:", JSON.stringify(error, null, 2));
    process.exit(1);
  }

  const data = await response.json();
  console.log(`✅  Icon uploaded: ${data.src}`);
  return data;
}

const formPayload = {
  title: "Chillist — סקר קצר",
  settings: {
    language: "he",
    is_public: true,
    show_progress_bar: true,
    progress_bar: "percentage",
    show_time_to_complete: true,
    show_question_number: true,
    show_key_hint_on_choices: true,
    hide_navigation: false
  },

  welcome_screens: [
    {
      ref: "welcome",
      title: "היי! 👋 עוזרים לנו לרגע?",
      properties: {
        description: "אנחנו חוקרים איך אנשים מארגנים אירועים עם חברים ומשפחה — מנגלים, טיולים, ימי הולדת, ארוחות חג.\n\nרוצים להבין מה עובד, מה לא, ומה היה חוסך לכם כאב ראש.\n\nשתי דקות, 10 שאלות. התשובות שלכם יעזרו לנו לבנות משהו שבאמת פותר את הבעיה.",
        show_button: true,
        button_text: "יאללה"
      }
    }
  ],

  thankyou_screens: [
    {
      ref: "thanks",
      title: "תודה! 🎯",
      properties: {
        show_button: true,
        button_text: "לאתר של Chillist",
        button_mode: "redirect",
        redirect_url: "https://chillist.app",
        share_icons: false,
        description: "התשובות שלך יעזרו לנו לבנות את הכלי שיסדר את הבלגן.\nנשמח לעדכן אותך כשנצא לאוויר!"
      }
    }
  ],

  fields: [
    // ── Phase 1: Discovery — understand their world ──

    {
      ref: "role_in_events",
      title: "מה התפקיד שלך באירועים עם חברים או משפחה?",
      type: "multiple_choice",
      properties: {
        allow_multiple_selection: false,
        randomize: false,
        choices: [
          { ref: "role_organizer", label: "אני בדרך כלל מי שמארגן/ת" },
          { ref: "role_helper", label: "אני עוזר/ת לארגן אבל מישהו אחר מוביל" },
          { ref: "role_participant", label: "אני בא/ה ומשתתף/ת" },
          { ref: "role_depends", label: "משתנה לפי המקרה" }
        ]
      },
      validations: { required: true }
    },

    {
      ref: "event_types",
      title: "באילו אירועים קבוצתיים את/ה בדרך כלל משתתף/ת?",
      type: "multiple_choice",
      properties: {
        description: "אפשר לבחור כמה שמתאים",
        allow_multiple_selection: true,
        randomize: false,
        choices: [
          { ref: "evt_camping", label: "טיולים / קמפינג" },
          { ref: "evt_birthday", label: "ימי הולדת" },
          { ref: "evt_bbq", label: "על האש / מנגל" },
          { ref: "evt_holiday", label: "ארוחות חג (שבת, חגים)" },
          { ref: "evt_potluck", label: "ארוחות משותפות (כל אחד מביא משהו)" },
          { ref: "evt_roadtrip", label: "טיולי רכב / יום כיף" },
          { ref: "evt_celebration", label: "חתונות / אירועים משפחתיים" },
          { ref: "evt_beach", label: "ים / בריכה" },
          { ref: "evt_other", label: "אחר" }
        ]
      },
      validations: { required: true }
    },

    {
      ref: "group_size",
      title: "כמה אנשים בדרך כלל משתתפים באירועים שלך?",
      type: "multiple_choice",
      properties: {
        allow_multiple_selection: false,
        randomize: false,
        choices: [
          { ref: "size_small", label: "2–5" },
          { ref: "size_medium", label: "6–12" },
          { ref: "size_large", label: "13–25" },
          { ref: "size_xlarge", label: "מעל 25" }
        ]
      },
      validations: { required: true }
    },

    {
      ref: "current_tools",
      title: "איך אתם מתאמים היום מי מביא מה לאירוע?",
      type: "multiple_choice",
      properties: {
        description: "סמנו את כל מה שאתם משתמשים בו",
        allow_multiple_selection: true,
        randomize: false,
        choices: [
          { ref: "tool_whatsapp", label: "קבוצת וואטסאפ" },
          { ref: "tool_google_docs", label: "גוגל דוקס / שיטס" },
          { ref: "tool_notes", label: "פתקים / אפליקציית הערות בטלפון" },
          { ref: "tool_calls", label: "שיחות טלפון / פגישה" },
          { ref: "tool_one_person", label: "בן אדם אחד פשוט מסדר הכל" },
          { ref: "tool_app", label: "אפליקציה ייעודית (Splitwise, Trello, אחר)" },
          { ref: "tool_wing_it", label: "לא באמת מתאמים — מקווים לטוב" },
          { ref: "tool_other", label: "אחר" }
        ]
      },
      validations: { required: true }
    },

    {
      ref: "biggest_frustration",
      title: "תחשבו על הפעם האחרונה שארגנתם משהו עם חברים. מה היה הכי מתסכל?",
      type: "long_text",
      properties: {
        description: "אין תשובה נכונה או לא נכונה — פשוט ספרו מהניסיון"
      },
      validations: { required: true }
    },

    {
      ref: "what_goes_wrong",
      title: "מה בדרך כלל משתבש כשמארגנים אירוע קבוצתי?",
      type: "multiple_choice",
      properties: {
        description: "סמנו את כל מה שמוכר לכם",
        allow_multiple_selection: true,
        randomize: true,
        choices: [
          { ref: "wrong_no_response", label: "אנשים לא עונים ולא מאשרים" },
          { ref: "wrong_duplicates", label: "כמה אנשים מביאים את אותו דבר" },
          { ref: "wrong_forgotten", label: "משהו חשוב נשכח ומגלים ברגע האחרון" },
          { ref: "wrong_one_carries", label: "בן אדם אחד נושא את כל העבודה" },
          { ref: "wrong_tracking", label: "קשה לעקוב מי אחראי על מה" },
          { ref: "wrong_money", label: "מביך לדבר על כסף — מי משלם כמה" },
          { ref: "wrong_dietary", label: "לא יודעים מי צמחוני, טבעוני או עם אלרגיות — ומגלים מאוחר מדי" },
          { ref: "wrong_weather", label: "מזג האוויר מפתיע ולא התכוננו" },
          { ref: "wrong_scattered", label: "המידע מפוזר — חצי בצ׳אט, חצי בראש" }
        ]
      },
      validations: { required: true }
    },

    // ── Phase 2: Feature validation — now that we understand ──

    {
      ref: "shared_checklist_interest",
      title: "דמיינו: רשימה משותפת שבה כל אחד רואה מה צריך להביא, בוחר פריטים, ומסמן שהוא מטפל בזה. בלי כפילויות, בלי \"מי מביא מה?\" בקבוצה.",
      type: "opinion_scale",
      properties: {
        description: "כמה זה היה עוזר לך?",
        steps: 5,
        start_at_one: true,
        labels: {
          left: "לא צריך את זה",
          right: "בדיוק מה שחסר לי"
        }
      },
      validations: { required: true }
    },

    {
      ref: "feature_priorities",
      title: "אם היה כלי שעוזר לארגן אירועים — מה הכי חשוב שיהיה בו?",
      type: "multiple_choice",
      properties: {
        description: "בחרו עד 4 דברים שהכי ישנו לכם את החיים",
        allow_multiple_selection: true,
        randomize: true,
        choices: [
          { ref: "feat_shared_list", label: "רשימה משותפת — כולם רואים מי מביא מה" },
          { ref: "feat_whatsapp", label: "עדכונים בוואטסאפ — תזכורות ושינויים" },
          { ref: "feat_no_download", label: "משתתפים נכנסים דרך לינק — בלי להוריד אפליקציה" },
          { ref: "feat_templates", label: "רשימות מוכנות לפי סוג אירוע (קמפינג, מנגל...)" },
          { ref: "feat_reminders", label: "תזכורות אוטומטיות לפני האירוע" },
          { ref: "feat_money", label: "חלוקת הוצאות — מי שילם מה, מי חייב למי" },
          { ref: "feat_dietary", label: "מעקב העדפות אוכל ואלרגיות לכל משתתף" },
          { ref: "feat_weather", label: "תחזית מזג אוויר ליום האירוע" },
          { ref: "feat_suggestions", label: "הצעות חכמות מה להביא לפי סוג האירוע" }
        ]
      },
      validations: { required: true, max_selection: 4 }
    },

    {
      ref: "willingness_to_pay",
      title: "כלי כזה יהיה חינמי לשימוש בסיסי. אם היו יכולות מתקדמות — מה שווה לך לשלם עליו?",
      type: "multiple_choice",
      properties: {
        description: "בחרו עד 3",
        allow_multiple_selection: true,
        randomize: false,
        choices: [
          { ref: "pay_suggestions", label: "הצעות חכמות מה להביא לפי סוג האירוע" },
          { ref: "pay_budget", label: "הערכת עלות וקישור למחירים בסופר" },
          { ref: "pay_collect", label: "גביית כסף מהמשתתפים (ביט / פייבוקס)" },
          { ref: "pay_unlimited", label: "אירועים פעילים ללא הגבלה" },
          { ref: "pay_recurring", label: "אירועים חוזרים — רשימה שמתעדכנת מאירוע לאירוע" },
          { ref: "pay_calendar", label: "סנכרון עם יומן (גוגל / אפל) ותזכורות" },
          { ref: "pay_photos", label: "אלבום תמונות משותף מהאירוע" },
          { ref: "pay_chatbot", label: "בוט בוואטסאפ — לנהל את הרשימה ישירות מהצ׳אט" },
          { ref: "pay_nothing", label: "לא הייתי משלם על שום דבר" }
        ]
      },
      validations: { required: true, max_selection: 3 }
    },

    {
      ref: "open_feedback",
      title: "יש משהו שלא שאלנו ואתם חושבים שחשוב?",
      type: "long_text",
      properties: {
        description: "לא חייבים — אבל נשמח לשמוע"
      },
      validations: { required: false }
    }
  ]
};

async function createForm() {
  console.log("\n🚀  Creating Chillist questionnaire v3 on Typeform...\n");

  try {
    // Step 1: Upload the icon
    let imageData;
    if (fs.existsSync(ICON_PATH)) {
      imageData = await uploadImage(ICON_PATH);
    } else {
      console.warn(`⚠️  Icon not found at ${ICON_PATH} — creating form without icon.\n`);
    }

    // Step 2: Attach icon to welcome screen if uploaded
    if (imageData) {
      formPayload.welcome_screens[0].attachment = {
        type: "image",
        href: imageData.src
      };
      formPayload.welcome_screens[0].layout = {
        type: "float",
        placement: "right",
        attachment: {
          type: "image",
          href: imageData.src
        }
      };
    }

    // Step 3: Create the form
    const response = await fetch("https://api.typeform.com/forms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(formPayload)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("❌  Typeform API error:", JSON.stringify(error, null, 2));
      process.exit(1);
    }

    const data = await response.json();

    console.log("✅  Form created successfully!\n");
    console.log("─────────────────────────────────────────");
    console.log(`📋  Title:    ${data.title}`);
    console.log(`🆔  Form ID:  ${data.id}`);
    console.log(`🔗  Edit:     https://admin.typeform.com/form/${data.id}/create`);
    console.log(`🌐  Share:    https://form.typeform.com/to/${data.id}`);
    console.log("─────────────────────────────────────────\n");

  } catch (err) {
    console.error("❌  Request failed:", err.message);
    process.exit(1);
  }
}

createForm();