# Serendipity Vintage

A phone-first helper for a vintage clothing shop. Each piece gets a code and its photos, with measurements dictated out loud. Claude writes the Etsy and Vinted listings. Receipts, costs, mileage and sales roll up into a year-end summary for taxes.

There is no server and no account: the app runs in the browser, and everything is saved in one Dropbox folder.

- **App:** https://mattrailey.github.io/serendipity-vintage/vintage-shop
- **How Claude works with the folder:** [CLAUDE.md](CLAUDE.md)
- **Listing/SEO playbook:** [LISTING-GUIDE.md](LISTING-GUIDE.md)
- **For developers:** [DEVELOPER.md](DEVELOPER.md)

## Day to day

1. **At the store:** tap **+ → New haul**.
   - Snap the receipt, pick the store, type the total and how many pieces you're buying for resale.
   - Each piece gets a code (e.g. `2609-014`). Write it on masking tape.
   - The cost is split evenly across the pieces, and the trip's miles fill in from the store list.
2. **At home, for each piece:**
   - Open it and tap the shot buttons: **Front, Back, Brand tag, Care tag**, then any detail or flaw shots.
   - Tap the **mic** and say the measurements, e.g. *"tag size medium, pit to pit eighteen and a half, length twenty-seven, small pinhole left cuff."*
   - Tap **Ready for Claude**.
3. **Ask Claude to "check the shop folder."** The Etsy and Vinted drafts (title, 13 tags, attributes, description, price range and comps) appear on each piece, with copy buttons. From the desktop app, Claude can also fill in the Etsy or Vinted listing form for you to review and publish.
4. **When you list it,** turn on **Etsy / Vinted / Consignment** under *Where it's listed*.
5. **When it sells,** set *Sold on*, the date and the price. If it's still live on another site, the app says so until you take it down.
6. **Once a month,** download Etsy's *Sold Orders* CSV and monthly statement into the folder's `etsy/` subfolder and ask Claude to reconcile.
7. **At tax time,** open **Money** and download the summary and the records for your preparer.

## Set up (one time, about ten minutes)

1. **Create a Dropbox app** at [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps). You can reuse the library's Dropbox app if you prefer.
   - Choose *Scoped access* and *Full Dropbox*.
   - Under Permissions, tick `files.content.read` and `files.content.write`, then click Submit.
   - Under Settings, add the redirect URI `https://mattrailey.github.io/serendipity-vintage/vintage-shop`.
   - Copy the **App key**.
2. **Connect your own phone or computer.** Open the app, go to **Settings → Dropbox**, paste the app key, tap **Connect Dropbox**, and sign in. The shop folder is `/Serendipity Vintage`.
3. **Set up her iPhone.**
   - In Settings, tap **Copy set-up link for another phone** and send her the link.
   - She opens it in Safari and taps **Connect Dropbox**. Sign in with your Dropbox; it stays signed in.
   - Then **Share → Add to Home Screen**.
4. **Stores:** in **Settings → Stores**, add the thrift stores she visits, with round-trip miles from home.

The first time she taps the mic, Safari asks for permission to use the microphone and speech recognition. If it's declined, the text box still takes the keyboard's own dictation mic.
