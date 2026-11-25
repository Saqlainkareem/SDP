ALPHA BAKERS - Firebase version
===============================
Everything runs on Firebase (Supabase and InfinityFree/PHP/MySQL are gone):
  - Login ........ Firebase Authentication (Email/Password)
  - Data ......... Cloud Firestore (with an offline cache for the POS)
  - Hosting ...... Firebase Hosting (free)

Pages
  - order.html ........ customer website (no login). Customers place and track orders here.
  - ordermanage.html .. admin panel for online orders, menu, reviews and settings (login required).
  - index.html ........ back-office dashboard (POS, stock, kitchen, staff, accounts, reports...).

Do not open the pages by double-clicking the files. Open them from Hosting or with "firebase serve",
otherwise Firebase does not work.

ONE-TIME SETUP - Firebase Console: https://console.firebase.google.com -> project "bakery-alpha"
 1) Build > Authentication > Get started > Sign-in method > enable "Email/Password".
 2) Authentication > Users > Add user (your admin email and a strong password).
 3) Build > Firestore Database > Create database (Production mode, nearest location).
 4) Firestore > Rules tab > paste the text of firestore.rules and Publish.
    If your login email is different, replace 'scalesoft@gmail.com' in the rules with your email.
 5) Hosting: npm i -g firebase-tools ; firebase login ; firebase init (Hosting + Firestore, existing project) ;
    firebase deploy

How the online ordering works
 - A customer can only create a "pending" order, read an order if they know its random ID, and confirm
   delivery of their own order. Everything else (accept, prepare, edit, delete) is admin only.
 - Only approved reviews are public. Pending reviews and phone numbers stay private.
 - Bakery name, phone, hours, texts, prices, payment details and images are entered in the admin panel
   (Settings). Nothing is pre-filled on the customer website.

Other features
 - Ping / WiFi icon on every page: green = good, yellow = slow, red = bad/offline.
 - Kitchen Usage: stock deduction and the usage record are saved together in one transaction.

OLD DATA (from MySQL / Supabase)
 Old data does not move automatically. On the old server use Settings > Backup to download a file, then
 log in to the new system and use Settings > Restore.

SECURITY
 - The old InfinityFree database password is no longer used. Change it.
 - The Firebase config (apiKey) is public by design; real protection comes from firestore.rules.
 - Prices on online orders are calculated in the customer's browser. Always check the order total
   before accepting it.
   (NEW) ordermanage.html now re-checks every online order against the current menu, delivery area fee and
   member discount. A red warning shows in the order and a confirmation appears before accepting a mismatch.
   firestore.rules also rejects orders whose total != subtotal + delivery - discount.
 - (NEW) ab-sync.js now merges list changes by item id (stock, suppliers ...), so two devices editing at the
   same time keep each other's changes (stock quantity changes from both devices are added together).
   Other devices see the other device's changes after a page reload.
 - If your old database already holds seeded text, change it in the admin Settings.


V3 CHANGES
 - Open the pages ONLY through http (python -m http.server 8000 -> http://localhost:8000/login.html, firebase serve, or Hosting).
 - Ping badge is fixed at the top of every page. If the internet is slow / offline a bar says "wait for a stable
   connection"; cloud saving is held until it is stable (data stays on the device meanwhile).
 - Settings > Problem report (Diagnostics): copy a full report (connection, errors, data sizes, last log lines) and send it
   to the developer. The same "Copy problem report" button is in the ping badge on every page. "Test cloud connection"
   checks Firebase load, login, cloud read and cloud write.
 - Dates now use Pakistan local time with the POS business day (before 03:30 am counts as the previous day).
 - Stock: category, opening qty, low-stock level, weighted-average rate (old stock keeps its value), rounded quantities,
   duplicate-name check. Every movement stores: date/time, item, category, unit, qty, rate, total, balance before -> after,
   supplier/reason, description and the user. Supplier purchases, production and kitchen usage write the same detail.
 - Suppliers: total vs qty x rate check, "paid now" cannot exceed total, overpayment warning.
 - Staff: an advance bigger than the salary is no longer lost - the rest is carried to next month.
 - Profit (Accounts and Reports) now counts salaries as paid + advances deducted.

V4 - ONE MENU (FRAME) LAYOUT
 - index.html is now the ONLY page with the left menu, logo, ping badge and logout. Every other page opens inside its frame.
 - dashboard.html = the old dashboard (shown first). frame.js is loaded by every admin page: a page opened on its own
   (bookmark / old link) jumps to index.html#<page>; inside the frame its own sidebar and "home" buttons are hidden.
 - Menu: "Online Orders" = order manager (ordermanage.html). "Order Page (website)" = order.html (the customer page,
   https://scalesoft.wuaze.com/bakery/order.html); the arrow next to it opens it in a new tab.
 - Upload ALL files to the same folder (bakery/). Firebase Console > Authentication > Settings > Authorized domains must
   contain scalesoft.wuaze.com, otherwise login fails on that domain.

V5 FIXES
 - pos.html: deleting a menu item removed/asked about the WRONG item (!== instead of ===) - fixed. Invoice number is now
   (highest existing ALB number + 1) so deleting orders can no longer create duplicate invoice numbers.
 - ordermanage.html: saved customers (id guest_...) get 10% off by design - the check no longer shows a false red warning;
   any other discount amount is flagged.
 - kitchen.html: an offline entry rejected by the server (e.g. not enough stock) is moved to "kitchen_failed" instead of
   blocking the whole offline queue forever.
 - staffmanage / production / suppliers: user-typed text is HTML-escaped. firestore.rules: length limits on every free-text
   order field.
 - File names are unchanged on purpose: order.html = customer website (live link), ordermanage.html = order manager.

V6 - STOCK
 - Stock page: unit is a drop-down (pcs, kg, gram, L, ml, dozen, tray ... or "Other"). On entry kg<->gram, L<->ml, pcs<->dozen convert automatically.
 - Every stock entry records WHERE the material came from / went: Stock In = supplier (or market / returned from kitchen ...),
   Stock Out = Kitchen, Production, Counter/sale, Wastage, Return to supplier, Sample/staff, Other. Supplier purchases,
   kitchen usage and production write this automatically. Movements can be filtered per item and show received / issued / balance.
 - Upload ALL files of this zip together into the same folder.
