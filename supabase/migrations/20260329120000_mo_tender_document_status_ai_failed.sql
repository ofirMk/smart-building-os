-- שגיאת ניתוח AI (קליטת מכרז) — ערך סטטוס נוסף
alter type public.mo_tender_document_status add value if not exists 'ai_failed';
