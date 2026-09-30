# Serendipity Vintage — developer guide

A static single-page app: plain HTML, CSS and JavaScript, with no framework and no build step. GitHub Pages hosts it. Data lives in the user's Dropbox, which the browser talks to directly. It follows the same pattern as [tamarack-library](https://github.com/MattRailey/tamarack-library).

The files in `js/` are **classic scripts loaded with `defer` in a fixed order**. They share one global scope, and code that must run once everything exists goes in `app.js`, which loads last.

| File | What's in it |
|---|---|
| `core.js` | Helpers and local dates. The on-device store (IndexedDB, falling back to localStorage). Per-field change stamps (`ft`). Record-by-record merge across `items`, `hauls`, `expenses` and `stores`. `commit()`. Piece codes. IRS mileage rates. |
| `dropbox.js` | OAuth PKCE sign-in. Revision-checked sync of `vintage-shop.json`. The **photo upload queue**: photos wait in IndexedDB until online. Thumbnails. |
| `speech.js` | `parseDictation()`, which turns one spoken phrase into fields (tested in Node). The iPhone speech-recognition mic: one session that restarts itself, so the phone asks once. |
| `pieces.js` | Statuses, venues, the Pieces list in Feed / Cards / List views. |
| `piece.js` | The piece sheet: shot-list photos, dictation, Claude's Etsy and Vinted drafts, where it's listed, sale and profit. |
| `hauls.js` | Hauls (receipt → coded pieces with evenly split cost, and trip miles), expenses, stores. |
| `money.js` | Year totals for taxes, the to-do list, CSV exports. |
| `settings.js` | Shop settings, Dropbox, set-up link, backup and restore. |
| `app.js` | Tabs, the + menu, start-up. |

**The one rule for changing data:**
1. Change a record.
2. Call `touch(record)` to give it a new `updatedAt`.
3. Call `commit()`.

`commit()` stamps the changed fields, saves on the device, schedules a Dropbox sync and redraws. Because merges work field by field, an edit on her phone and a listing Claude wrote both survive. See `tests/app.spec.js`, "sync merges…".

Data format and Claude's workflow: see [CLAUDE.md](CLAUDE.md).

## Tests

```
npm install
npm test        # parser checks in Node, then Playwright (phone-sized Chromium, fake Dropbox)
```

## Releasing

- If you add or remove an app file, update `APP_FILES` in `sw.js` and bump `VERSION`.
- Commit and push. Pages serves the new version within a minute or two, and phones pick it up on the next open.
