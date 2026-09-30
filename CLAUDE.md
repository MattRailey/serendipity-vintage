# Serendipity Vintage: what Claude does with the shop folder

The app captures each piece (photos, dictated measurements, cost). Claude does the research and writing. Everything lives in the Dropbox folder `/Serendipity Vintage` (on Matt's laptop: `D:\Dropbox\Serendipity Vintage`).

```
vintage-shop.json            the whole shop: items, hauls, expenses, stores, settings
pieces/<code>/<code> NN <kind>.jpg   photos per piece; kind = front, back, tag, care, detail, flaw, worn, other
receipts/                    haul and expense receipt photos
etsy/                        Etsy CSV exports and monthly statements she drops in
imports/                     Claude's change logs (one file per run)
```

## The shop

- **Serendipity Vintage** — Sarah Railey, owner and curator.
- Etsy: https://www.etsy.com/shop/SerendipityvintageOR · Instagram: https://www.instagram.com/serendipityvintageco/
- Brand feel (from her card): soft, botanical, white trillium and leaf green. Warm and knowledgeable, not salesy. Descriptions can close with a short shop line in that voice.
- Her Etsy Stats search terms and her existing listings are the best guide to her voice and what buyers search. Read them when you can.

## "Check the shop folder"

1. Read `vintage-shop.json`. Work on items with `status: "ready"`.
2. For each item, look at its photos:
   - **Tags first** (`tag`, `care`). Identify the brand and date the piece from:
     - union labels, RN/WPL/CA numbers;
     - care-tag format, fiber content, country of origin;
     - zipper and snap makers, construction.
   - Say how sure you are, and why.
3. Research the brand and label, and look up comps. eBay sold listings are the best record; current Etsy asks are a second check.
4. Write `item.listing` (schema below), following **LISTING-GUIDE.md** exactly:
   - Etsy title under 15 words;
   - exactly 13 tags, each 20 characters or fewer;
   - every attribute filled;
   - the modern size worked out from the measurements.
   - Use her `measurements`, `size`, `condition` and `notes` fields as given. Don't invent measurements. If something needed is missing, say so in `listing.questions`.
5. Set `status: "draft"`, bump `updatedAt` (ms), and stamp the changed fields in `ft` (`ft.listing`, `ft.status` = the same time).
6. Save safely, the same way the app does:
   - Re-read the file just before writing.
   - Merge by record `id`.
   - Never drop records or fields you didn't touch.
   - Keep the indented, readable format.
   - If the app saved while you worked, reload and apply your changes again.
7. Write a short log to `imports/YYYY-MM-DD HHMM listings.md` covering what was written and anything uncertain.

## listing schema

```json
"listing": {
  "writtenAt": "2026-09-30",
  "etsy": {
    "title": "70s Western Pearl Snap Shirt, Brown Plaid Cotton Blend, Men's Medium",
    "tags": ["1970s western shirt", "pearl snap shirt", "... 13 total, each <= 20 chars"],
    "category": "Clothing › Men's Clothing › Shirts & Tees › Button-Downs",
    "attributes": { "Who made it": "Another company or person", "What is it": "A finished product", "When made": "1970-1979",
                    "Primary color": "Brown", "Secondary color": "Beige", "Material": "Cotton blend", "Size": "M", "Style": "Western" },
    "description": "First sentences restate era/brand/fabric/style…\n\nMeasurements (laid flat):\n…\n\nCondition: Very good. …"
  },
  "vinted": {
    "title": "70s Western Pearl Snap Shirt Brown Plaid M",
    "category": "Men › Tops › Shirts", "brand": "Kmart", "size": "M", "condition": "Very good",
    "colors": ["Brown", "Beige"], "material": "Cotton",
    "description": "… #70s #western #pearlsnap"
  },
  "price": { "suggested": 48, "low": 40, "high": 58, "vinted": 42, "note": "What the comps showed, in one line." },
  "research": { "era": "1970s", "brand": "Kmart", "summary": "How it was dated/identified and how sure.",
                "comps": [ { "title": "70s Sears western snap shirt", "price": 52, "where": "eBay", "sold": true, "url": "https://…" } ] },
  "questions": ["Anything she should check or add, e.g. 'No care-tag photo — fabric content guessed.'"]
}
```

## Monthly bookkeeping

When she drops Etsy's **Sold Orders** CSV and **monthly statement** in `etsy/`:

- **Match each Etsy sale to a piece.** Use the piece code if it's in the listing SKU (put the code in Etsy's SKU field when listing), otherwise the title. For each match set:
  - `status: "sold"`, `soldVia: "etsy"`, `soldAt`, `soldPrice` (item price the buyer paid, before fees);
  - `shipCost` if an Etsy label was bought.
- **Post the month's Etsy fees** (listing, transaction, processing, Etsy Ads) as expenses: `{ category: "etsyfees" | "ads", date: last day of month, vendor: "Etsy — <Month> statement", amount }`. Don't also put Etsy fees in item `fees`; `fees` is for consignment cuts and one-off per-piece fees.
- **Consignment statements:** set `soldVia: "consign"`, `soldPrice` = the sale price, and `fees` = the shop's cut.
- **Flag, don't guess:** unmatched sales, and deposits that don't reconcile. Record them in the log.

## Rules

- **Record shapes** (from `js/core.js`):
  - Codes are `YYMM-###`, and each is written on masking tape on the physical piece.
  - Dates are local `YYYY-MM-DD` strings.
  - Timestamps are ms.
- **Deleting:** a deleted record becomes `{ id, deleted: true, updatedAt }`. Never remove it outright.
- **Photos:** don't delete or rename them. The app shows them by path.
- **Advice:** this is bookkeeping support, not tax advice. Mileage uses the IRS standard rate in Settings.
