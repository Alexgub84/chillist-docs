# Frontend: subcategory management and multiple languages

Instructions for refactoring how the app handles **item subcategories** so it works with **Hebrew, Spanish, and English** (and stays aligned with the backend and AI behavior).

**Audience:** engineers working in `chillist-fe`. Backend details live in [`specs/ai-item-generation.md`](../specs/ai-item-generation.md) and `chillist-be/src/services/ai/subcategories.ts`.

---

## 1. What the backend guarantees

- **`items.subcategory` is free text** (`varchar(255)`), not an enum. It is stored exactly as sent from the client or returned from AI.
- **Plan language** comes from **`plans.defaultLang`** (`en` | `he` | `es`; missing/unknown is treated as English for AI).
- **AI item suggestions** (`POST /plans/:planId/ai-suggestions`): `name`, `subcategory`, and `reason` are generated in the **plan’s language**. `category` and `unit` stay **English** API enums (`group_equipment`, `pcs`, etc.).
- The backend maintains **English example lists** only for **prompting** the model (inspiration, not a closed set). The model may **invent** subcategory labels that fit the trip (e.g. fishing, ski, beach).
- There is **no separate “subcategory ID” or canonical English key** in the API. Grouping and display use the **string value** on each item.

Implication for the UI: you cannot rely on “subcategory === English catalog string” forever. Treat subcategory as **user- or AI-authored text in the plan’s language**, with optional **localized suggestions** for autocomplete and bulk-add.

---

## 2. Problems with an English-only mental model

If the frontend today assumes:

- Autocomplete or dropdowns only list **English** labels from one hardcoded array,  
- Group headers in the plan list **compare** item subcategories to that same English list, or  
- Copy like “Other” is the only fallback,

then **Hebrew/Spanish plans** (and AI suggestions in those languages) will look wrong: wrong grouping, wrong suggestions, or English leaking into a Hebrew UI.

Refactor so **language is explicit** and **display/suggestions** follow **`defaultLang`** (and the active UI locale where it differs).

---

## 3. Refactor goals

1. **Single source of truth per concern**
   - **Stored value:** always whatever the API returns or the user chose (`item.subcategory`). Do not silently rewrite it to English.
   - **Suggestion lists** (autocomplete, bulk-add categories): load from **locale-aware data** (see below), not one global English array in isolation.

2. **Align autocomplete with language**
   - For **manual item create/edit**, subcategory autocomplete should offer labels in the **plan’s language** (match `defaultLang`), or bilingual if you choose that product-wise.
   - English-only suggestion lists are fine **only** for `defaultLang === 'en'` (or UI locale English).

3. **Grouping and sorting**
   - Group items by **`subcategory` string** as stored (same string ⇒ same group).
   - **Sort** group titles using the **active locale** (`he` / `es` / `en`) so Hebrew/Spanish alphabetical rules apply where relevant.
   - **Fallback label** when `subcategory` is null/empty: use i18n (e.g. `t('items.subcategoryOther')`), not a hardcoded English `"Other"` in components.

4. **Bulk-add library (~700 items)**
   - Today this library is organized by **subcategory** names that may be English-only in data files.
   - Refactor so subcategory **section titles** and filters use **i18n keys** or **per-locale maps** from a canonical key (e.g. `cooking_equipment` → EN/HE/ES display strings). The **stored** `subcategory` on created items should still be **one** convention—product decision: either always store **localized** text matching the plan, or store a **stable key** and map to display (only if you introduce a key; the API today does **not** require a key).

5. **AI suggestion preview**
   - Show `subcategory` from the API **as returned** (already in plan language). No extra “translate to English” step unless you add a deliberate feature.

---

## 4. Suggested implementation checklist

| Area | Action |
|------|--------|
| Constants | Replace a single English `SUBCATEGORIES` array used everywhere with **per-locale lists** or **i18n keys** + one canonical id if you need stable analytics later. |
| Autocomplete | Feed options from the list that matches **`plan.defaultLang`** (or user UI locale, if product requires). |
| Group headers | Use stored string for grouping; use **locale-aware sort**; translate only the **empty** bucket via i18n. |
| Bulk add | Same as autocomplete: section headers from i18n or locale-specific JSON. |
| Expenses / assign flows | Any “group by subcategory” UI should use the same rules as the main item list. |
| Tests | Add cases for Hebrew/Spanish subcategory strings in grouping and autocomplete (snapshots or behavior tests). |

---

## 5. Edge cases to handle explicitly

- **Mixed-language items on one plan** (legacy imports + new AI): groups split by **exact string**; two groups may mean the “same” concept in two languages. Optional later: normalization or migration—out of scope unless product asks for it.
- **Custom AI subcategories**: any non-empty string is valid; UI should not break on unknown labels.
- **RTL**: subcategory labels in Hebrew appear correctly in group headers and chips (ellipsis, sorting).

---

## 6. Coordination with backend

- No API change is **required** for basic multilingual subcategories: the field remains a string.
- If you later want **canonical keys** in the API for analytics or cross-locale merging, that would be a **separate BE spec** (new column or enum)—do not assume it exists today.

---

## 7. Related docs

- [`specs/ai-item-generation.md`](../specs/ai-item-generation.md) — AI language behavior and `subcategory` semantics.
- [`specs/mvp-v1.md`](../specs/mvp-v1.md) — items, grouping, bulk assign by subcategory.
- [`rules/frontend.md`](../rules/frontend.md) — project conventions for the FE repo.
