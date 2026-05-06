# Design Proposal — AI Autonomous Procurement ("מהנדס רכש וירטואלי")

**תאריך:** 2026-05-06
**מחבר:** Lead Architect (Cascade)
**סטטוס:** Draft for Management Review — לא מאושר לביצוע
**מודל מערכת קיים:** Next.js 16 · Supabase (Postgres + pgvector + RLS) · Vercel AI SDK · @ai-sdk/openai + @google/generative-ai

---

## 0. תקציר מנהלים (TL;DR)

**מומלץ:** **Copilot + Tools (גישה היברידית-קשיחה)** ולא Multi-Agent Crew. ה-AI אחראי **רק** על תרגום כוונה (intent parsing); כל המספרים והכללים ההנדסיים מגיעים מ-Postgres דרך SQL פונקציות וטבלאות חוקים. זה הופך הזיות מתמטיות לבלתי-אפשריות, מבטיח אודיט מלא, ומחזיק עלויות LLM בשליטה.

**Schema gap:** חסרות 4 ישויות יסוד — `product_assemblies` (עצי מוצר), `assembly_lines` (רכיבים), `engineering_rules` (חוקי תקן), `proj_locations` (היררכיית מיקומים בפרויקט). אלו הקרקע שעל גביה ה-AI יוכל בכלל "לחשוב".

**Roadmap:** 4 שלבים, ~9 שבועות סה״כ. **שלבים A+B דליברים ערך עסקי גם בלי AI** — UI מובנה ליצירת BOM. ה-AI מתווסף ב-Phase C על תשתית מוכחת. סיכון מינימלי, אימוץ הדרגתי.

---

## 1. בחירת ארכיטקטורת ה-AI — נימוק מפורט

### 1.1 שלוש האפשרויות הריאליסטיות

| גישה | מה זה | יתרונות | חסרונות עבור ERP |
|---|---|---|---|
| **Multi-Agent Crew** (CrewAI / AutoGen) | 3-5 agents במשא-ומתן: "PlannerAgent", "InventoryAgent", "ComplianceAgent" וכו'. כל agent הוא LLM call נפרד עם persona | מודולרי, נשמע מתקדם | **❌ Latency מוכפל ב-N**: 10-30 שניות לבקשה. **❌ Non-determinism**: שני runs של אותה בקשה → תוצאות שונות. **❌ הזיות מספריות מצטברות**: "PlannerAgent" יכול לבקש 47 תמיכות, "ComplianceAgent" יחליט שזה בסדר — ושניהם טועים. **❌ אודיט בלתי אפשרי**: למה הוצא DRAFT PO זה? "ה-agents הסכימו". זה לא הגנה משפטית. **❌ עלות tokens × N** |
| **Copilot + Tools** (Function Calling) | LLM יחיד מקבל בקשה → קורא ל-tools (פונקציות SQL/TS דטרמיניסטיות) → מחזיר תוצאה structured | **✅ Latency: 2-4 שניות**. **✅ דטרמיניזם בכל המספרים**: כל מספר מגיע מ-tool שמריץ SQL. הזיה מתמטית בלתי אפשרית. **✅ אודיט מלא**: כל tool call נשמר עם ארגומנטים ותוצאה. **✅ עלות נמוכה**: LLM call יחיד. **✅ ניתן לבדיקה**: כל tool ניתן ל-unit test בנפרד | פחות "מרשים שיווקית", אבל זה מה שעובד בפרודקשן |
| **Pure Rules Engine** (ללא LLM) | UI form עם dropdowns לבחירת assembly + מיקום + מידות → engine קלאסי | **✅ דטרמיניזם מוחלט**, **✅ אפס עלות** | **❌ אינו עומד ב-User Story** — אין הבנת טקסט חופשי / דיבור |

### 1.2 ההמלצה: Copilot + Tools

**הנימוק המכריע:** ב-ERP, השאלה אינה "האם ה-AI חכם" אלא "האם ה-AI אמין מספיק כדי לשבת בין הלקוח שלך לבין מיליוני שקלי הזמנה". ב-Multi-Agent כל קריאה היא הימור על קונצנזוס בין נציגי-LLM. ב-Tools, ה-LLM מנגן רק תפקיד אחד: parser. כל החלטה חישובית עוברת דרך SQL.

**חלוקת תפקידים מדויקת:**

| מי עושה מה | אחריות | טכנולוגיה |
|---|---|---|
| **LLM (יחיד, GPT-4o או Gemini 2.5)** | תרגום טקסט חופשי → JSON intent מובנה | Vercel AI SDK `generateObject` + Zod schema |
| **Tool: `findAssembly`** | חיפוש semantic על עצי מוצר | pgvector cosine similarity על `assembly_aliases.embedding` |
| **Tool: `findProjectLocation`** | זיהוי "מפלס -1 בגינדי סביון" | LLM-בלי, fuzzy text match על `proj_locations` |
| **Tool: `resolveBom`** | חישוב כמויות נדרשות | SQL function `erp_resolve_bom()` — אריתמטיקה טהורה |
| **Tool: `netAgainstInventory`** | קיזוז מלאי קיים | SQL function על `purchase_order_lines.received_qty` minus consumed |
| **Tool: `validateEngineeringRules`** | בדיקת חוקי תקן | SQL function שמעריכה כל rule בנפרד |
| **Tool: `createDraftPo`** | יצירת DRAFT PO | RPC קיים, פשוט עוטף |

**ההזיה היחידה האפשרית** היא ב-intent parsing (LLM יזהה assembly לא נכון). פתרון: ה-UI מציג את ה-BOM שחושב **לפני** יצירת PO, עם "האם זה מה שהתכוונת?" המשתמש מאשר. אם לא — הוא בוחר ידנית. ה-AI אף פעם לא יוצר PO באוטומציה מלאה ללא human-in-the-loop ב-MVP.

### 1.3 הגנות נוספות

- **JSON Schema validation** על תוצאת ה-LLM (Zod) — אם ה-LLM מחזיר שדה לא חוקי, fallback ל-UI ידני.
- **Confidence scoring** — pgvector מחזיר distance score; אם < 0.7 (לא בטוח) → מציגים top-3 ל-disambiguation.
- **Hard limits** — אסור לשלב יוצר PO מעל ₪50,000 (configurable) ללא אישור אנושי כפול.
- **Audit log** של כל בקשה: `erp_ai_bom_requests` (ראה §2.5) — כולל raw_input, parsed_intent, tool_calls, final_action.

---

## 2. Schema & Data Modeling — Gap Analysis

המערכת היום יודעת לנהל פריטים בודדים (`erp_md_items`) ולעטוף אותם בהזמנות (`erp_purchase_orders`). מה שחסר זה **שכבת ה-domain knowledge** שתאפשר ל-AI להבין הקשר.

### 2.1 שכבה חדשה #1 — עצי מוצר (Product Assemblies / BOM)

| טבלה | תפקיד | שדות מפתח |
|---|---|---|
| **`erp_md_product_assemblies`** | "מתכון" — מה זה "תעלת חשמל סטנדרטית למפלס שירותים" | `id`, `company_id`, `code`, `name`, `description`, `category` (electrical/plumbing/finishing/...), `unit_of_measure` ('METER' / 'SQM' / 'UNIT'), `version`, `parent_assembly_id` (variants), `embedding` (vector(1536)) |
| **`erp_md_assembly_lines`** | רכיבים — מה הולך פנימה | `id`, `assembly_id`, `item_id` (FK ל-`erp_md_items`), `quantity_per_unit` (numeric — למשל 0.667 תמיכות לכל מטר תעלה), `role` ('PRIMARY' / 'SUPPORT' / 'FASTENER' / 'CONSUMABLE'), `is_optional`, `notes` |
| **`erp_md_assembly_aliases`** | מילים נרדפות לחיפוש NL | `id`, `assembly_id`, `alias_text`, `alias_embedding` (vector), `language` ('he'/'en') |

**עיצוב מפתח:** ה-`quantity_per_unit` הוא **יחס לתוך unit_of_measure**. אם assembly הוא "תעלת חשמל" עם UoM=METER, ושורה היא "תמיכה דגם X" עם qty=0.667, פירוש: 1 תמיכה לכל 1.5 מטר של תעלה. ה-`erp_resolve_bom(assembly_id, total_meters=20)` יחזיר 20 × 0.667 = 13.33 → מעוגל ל-14 תמיכות. זו אריתמטיקה דטרמיניסטית, אין מקום ל-LLM להזות.

### 2.2 שכבה חדשה #2 — חוקי תקן הנדסי

| טבלה | תפקיד | שדות מפתח |
|---|---|---|
| **`erp_md_engineering_rules`** | חוקים מקודדים מתקנים | `id`, `company_id`, `code` ('EL-CHANNEL-SUPPORT-SPACING-1419'), `description`, `regulatory_source` ('ת"י 1419 §4.3'), `applicable_assembly_ids` (uuid[]), `rule_type` (enum), `parameters` (jsonb), `tolerance_pct`, `violation_action` ('WARN' / 'BLOCK' / 'ESCALATE'), `is_active`, `effective_from`, `effective_until` |
| **`erp_md_engineering_rule_violations`** | לוג הפעלות (אודיט) | `id`, `rule_id`, `bom_request_id`, `severity`, `actual_value`, `expected_value`, `delta_pct`, `decided_action` |

**Rule Types נתמכים:**
- `RATIO` — יחס בין שני items: "מספר תמיכות / אורך תעלה ≤ 0.667 +20% tolerance"
- `PER_LENGTH` — מינימום per יחידת אורך: "לפחות 1 תמיכה לכל 1.5 מטר"
- `PER_AREA` — מינימום per יחידת שטח: "1 תאורת חירום לכל 30 מ״ר"
- `ABSOLUTE_MIN` / `ABSOLUTE_MAX` — חסמים מוחלטים
- `COMPATIBILITY` — "אם בחרת item A → חובה item B" (קוואדים תואמים)

**הפעלת החוק:** SQL function `erp_validate_engineering_rules(bom_lines jsonb, context jsonb)` תרוץ פר rule פעיל שמתאים, תחזיר list של violations. ה-AI **לא** מעריך את החוק — הוא רק קורא לפונקציה. זה הופך את "כלל ה-1.5 מטר" לאמת מתמטית, לא להמלצה של LLM.

**איך ה-Anomaly Detection מהדוגמה שלך עובד:**

> "אם הדרישה מהשטח כוללת כמות תמיכות הגבוהה ב-20% מהתקן (ביחס לאורך), ה-AI יתריע."

זה לא AI — זה rule פשוט:
```
rule_code: 'EL-CHANNEL-SUPPORT-EXCESS'
rule_type: 'RATIO'
parameters: { numerator_role: 'SUPPORT', denominator_uom: 'METER', expected_ratio: 0.667 }
tolerance_pct: 20
violation_action: 'BLOCK'
```
ה-engine מחשב `actual_ratio = sum(qty where role=SUPPORT) / sum(meters of channel)`, משווה ל-0.667 × 1.20 = 0.80, ואם > 0.80 → BLOCK. **דטרמיניסטי, מתועד, ניתן להסבר ללקוח** ("חרגת מ-20% מעל ת"י 1419 §4.3").

### 2.3 שכבה חדשה #3 — היררכיית מיקומים בפרויקט

קיים: `erp_proj_projects`. חסר: עומק. "מפלס -1 בפרויקט גינדי סביון" דורש ידיעה שגינדי סביון מורכב מ-{floors} × {zones}.

| טבלה | שדות מפתח |
|---|---|
| **`erp_proj_locations`** | `id`, `project_id`, `parent_id` (self-FK להיררכיה), `code` ('B1' / 'F-01-N'), `name` ('מפלס -1' / 'אגף צפוני קומה 1'), `level_type` ('FLOOR' / 'ZONE' / 'ROOM'), `length_m`, `area_sqm`, `geom` (postgis אופציונלי לעתיד) |

זה גם מאפשר sub-projects, sub-zones, ועתיד של חיבור ל-BIM/CAD.

### 2.4 שכבה חדשה #4 — מלאי ברמת פרויקט

קיים בעיגון: `erp_purchase_order_lines.received_qty` (כמה הגיע פיזית). חסר: יציאות (consumed). אופציות:

- **MVP (מהיר):** view מחושב `erp_proj_inventory_balance` שסוכם `received_qty` per project+item. ל-MVP נניח consumed=0 או נשתמש בטבלת תעודות-יציאה קיימת אם יש (לבדוק `erp_warehouse_outbound_*`).
- **גרסה מלאה:** טבלה חדשה `erp_proj_material_consumption` עם רישום פיזי (יומני שטח / scan ברקודים).

ל-Phase B מספיק ה-view; consumption נכנס ב-Phase D עם feedback מ-shop-floor.

### 2.5 שכבה חדשה #5 — Audit Trail של ה-AI

| טבלה | תפקיד |
|---|---|
| **`erp_ai_bom_requests`** | רשומה אחת לכל בקשת user. שדות: `id`, `company_id`, `project_id`, `requested_by`, `raw_input` (text), `input_modality` ('TEXT'/'VOICE'), `parsed_intent` (jsonb), `confidence_score`, `tool_call_log` (jsonb[] — כל tool call עם args+result), `generated_bom` (jsonb), `engineering_violations` (jsonb), `final_action` ('DRAFT_PO_CREATED' / 'BLOCKED' / 'USER_OVERRIDE' / 'CANCELLED'), `draft_po_id` (FK), `latency_ms`, `llm_tokens_used`, `created_at` |

זו גם **dataset לעתיד** — אם יום אחד ירצו fine-tune מודל יעודי, יש להם training data איכותי (raw_input → final_bom).

### 2.6 הרחבות ל-pgvector

- index `ivfflat` או `hnsw` על `assembly_aliases.alias_embedding` ועל `product_assemblies.embedding`
- HNSW לפעולות real-time (חיפוש בזמן הקלדה), `m=16, ef_construction=64`
- Embedding model: `text-embedding-3-small` (OpenAI) או `text-embedding-004` (Gemini) — שניהם תומכים בעברית; הראשון פי 5 זול

---

## 3. Roadmap — 4 שלבים, ~9 שבועות

### Phase A — Knowledge Foundation (~2-3 שבועות)
**מטרה:** יש ל-DB את ה-domain knowledge. אין AI עדיין.

1. מיגרציות SQL לכל הטבלאות מ-§2.1-2.4
2. הפעלת pgvector (extension כבר אמור להיות מותקן ב-Supabase)
3. UI אדמין ל-CRUD על assemblies + lines + aliases
4. UI אדמין ל-CRUD על engineering_rules
5. Seed: 5-10 assemblies של חשמל/תקשורת + 5-10 rules — מתועד עם איש המקצוע של הלקוח (לא Cascade!)
6. **קריטי:** המסמך הראשון — חתימה של מהנדס מוסמך מטעם הלקוח על נכונות ה-rules. בלי זה אנחנו אחראים משפטית.

**Deliverable:** מנהל יכול להגדיר עצי מוצר וחוקים. אפס שורות LLM.

### Phase B — Deterministic Engine (~2 שבועות)
**מטרה:** "מהנדס וירטואלי" עובד **ידנית** דרך טופס. מוכיח שהאריתמטיקה תקינה.

1. SQL functions: `erp_resolve_bom()`, `erp_validate_engineering_rules()`, `erp_net_inventory_against_bom()`
2. Endpoint: `POST /api/procurement/bom/preview` — מקבל `{assembly_id, location_id, length_m, area_sqm}` → מחזיר preview + violations
3. Endpoint: `POST /api/procurement/bom/create-draft-po` — אם אין BLOCK violations, יוצר DRAFT PO
4. UI: מסך "תכנון רכש" עם dropdowns + מספרים + preview של BOM + רשימת violations + "צור DRAFT PO"
5. בדיקת קצה-לקצה עם הלקוח על pilot project אחד

**Deliverable:** משתמש בלי AI יכול לייצר BOM סטנדרטי בלחיצות. **ערך עסקי כבר עכשיו** — חוסך 30 דקות בכל הזמנה. אם שלב C ייכשל מסיבה כלשהי, הלקוח כבר הרוויח.

### Phase C — AI Intent Layer (~2 שבועות)
**מטרה:** הוספת שכבת LLM שתופסת בקשת טקסט חופשי ומפעילה את Phase B.

1. הגדרת tools ל-AI SDK (Vercel AI SDK תומך ב-`tool()` מובנה):
   - `findAssemblyByDescription(query: string)` → top-3 candidates עם confidence
   - `findProjectLocation(query: string, projectId?: string)` → location_id + measurements
   - ועוטפים את ה-endpoints מ-Phase B
2. System prompt בעברית עם few-shot examples של בקשות טיפוסיות
3. Endpoint: `POST /api/procurement/ai/bom-request` — מקבל raw text, מריץ LLM עם tools, מחזיר structured intent + preview
4. UI: input chat-style → preview BOM (אותו component מ-Phase B!) → אישור משתמש → DRAFT PO
5. אכיפת `confidence_score < 0.7` → "מצאתי 3 אפשרויות, מה התכוונת?" disambiguation
6. **כל בקשה נשמרת ל-`erp_ai_bom_requests` לאודיט**
7. Voice input: Web Speech API (חינם, native ב-Chrome/Edge), נופל חזרה לטקסט

**Deliverable:** ה-User Story עובד פעם ראשונה. "אני מעוניין להזמין תעלות חשמל למפלס -1 בגינדי סביון" → מסך שמראה BOM + violations + CTA.

### Phase D — Anomaly Detection + Continuous Learning (~2 שבועות)
**מטרה:** המערכת לומדת ומשתפרת.

1. Statistical anomaly layer: השוואת BOM נוכחי ל-historical BOMs דומים (כיצד? pgvector מ-`generated_bom` הקודמים)
2. Active learning: אם משתמש *עורך* את ה-BOM שה-AI יצר → רושמים את הדלתא → משפרים את ה-aliases אוטומטית
3. הרחבת engineering_rules לאזורים נוספים (אינסטלציה, גמר)
4. Dashboards: KPIs של AI accuracy, override rate, blocked-violations rate
5. Alerts: אם override rate > 30% — דרישת התערבות אנושית מצוות התוכן (engineer review)

**Deliverable:** מערכת בוגרת עם feedback loop. KPI: 70%+ מבקשות עוברות ללא user-edit.

---

## 4. סיכונים ושאלות פתוחות להנהלה

| סיכון | חומרה | מיטיגציה |
|---|---|---|
| **אחריות משפטית** על BOM שגוי שגרם לתקלת בנייה | 🔴 גבוה | Engineering rules חתומים על-ידי מהנדס מוסמך של הלקוח. גם DRAFT PO דורש אישור אנושי לפני שליחה. EULA מתעדכן. |
| **תוכן ראשוני** — מי מקטלג assemblies + rules? | 🟠 בינוני | חצי שבוע engineering לבד מ-Cascade. הקבצים נשארים IP של הלקוח. |
| **הזיה ב-intent parsing** (LLM בוחר assembly לא נכון) | 🟠 | confidence score + disambiguation UI + audit log + human-in-the-loop |
| **עלות LLM tokens** | 🟢 נמוך | Tools approach = call יחיד, ~3K tokens ממוצע = $0.005 לבקשה. 1000 בקשות/חודש = $5. |
| **Embedding drift** — assemblies מתעדכנות, embeddings ישנים | 🟡 | re-embed cron weekly. כבר יש ב-`erp-weekly-pulse` תשתית cron. |
| **תלות ב-spec לקוח-ספציפי** — האם להציע כפלטפורמה לרבים? | 🟢 שאלה אסטרטגית | תכנון multi-tenant — `engineering_rules.company_id` כבר scope. |

### שאלות הנהלה לפני אישור:

1. **Pilot project:** איזה פרויקט יהיה הראשון? (ממליץ: גינדי סביון = הדוגמה שלך = יש בעלי-מקצוע זמינים)
2. **תוכן ראשוני:** האם הלקוח מקצה מהנדס לקטלג 10 assemblies + 10 rules ב-Phase A?
3. **תקציב LLM:** API key של מי משתמשים? (ממליץ: של הלקוח עצמו, max-tier ב-OpenAI/Gemini)
4. **Hard limits:** מה ה-PO ceiling שאסור ל-AI לעבור גם עם human approval? (ממליץ: ₪50K ב-MVP)
5. **מטריקה לסקסס Phase C:** מה ה-acceptance criteria? (מציע: 70% מבקשות = DRAFT PO תקין שאושר ע"י משתמש ללא עריכת BOM)
6. **שיווק:** האם זה פיצ'ר שיווקי גם ללקוחות אחרים, או advantage בלעדי לפיילוט? משפיע על priorities של multi-tenant.

---

## 5. למה זה ינצח את התחרות (זווית עסקית)

חברות ERP מתחרות (Priority, SAP B1) **לא יכולות** לבנות זאת בקצב שלכם, כי:

1. **הן engine-בלעדי** — לא בנויות סביב טקסט חופשי. שינוי כזה דורש שכתוב ארכיטקטוני שלהן.
2. **הן multi-tenant SaaS גדול** — לא יכולות להרשות לעצמן לטעון domain rules ספציפיים ללקוח. אתם **כן**.
3. **הן לא Hebrew-first** — pgvector + LLM מודרני נותן לכם אדוונטג' עברית מובנה.

ה-IP האמיתי כאן הוא **`engineering_rules` + `assemblies` של הלקוח**. ה-AI עצמו הוא commodity. הלקוח שמקטלג את הידע שלו בטבלאות שלכם — נעול אצלכם לעולמים.

---

## 6. המלצה — סדר ביצוע

הצעתי הקונקרטית להנהלה:

1. **אישור עקרוני להמשך** ולשיוך מהנדס תוכן מהלקוח לקטלוג ראשוני.
2. **אישור Phase A+B (5 שבועות, ללא AI)** כסטנדאלון — ערך מוכח גם בלבד.
3. **Go/No-Go ל-Phase C** רק אחרי שלב B עובד וגם הצוות החתום על rules.
4. **Phase D** מוצמד ל-Q3 — אחרי איסוף נתונים.

זה מאזן: שווי מצטבר, סיכון מוקטן, יציאה אפשרית בכל שלב.

---

**המתנה לתשובת ההנהלה.**
**Owner:** ofirMk · **Architect:** Cascade · **Decision needed by:** TBD
