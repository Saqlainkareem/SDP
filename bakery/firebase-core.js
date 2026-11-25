/* =====================================================================
   Alpha Bakers - Firebase core (replaces api.php + MySQL + Supabase)
   Auth  : Firebase Authentication (Email / Password)
   Data  : Cloud Firestore, collection "tree"  (path -> JSON value)
   Loaded as: <script type="module" src="firebase-core.js"></script>
   ===================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs,
  writeBatch, onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC3dRaBG9NGXCBqGUacxBDpCWcJYj64_GE",
  authDomain: "bakery-alpha.firebaseapp.com",
  projectId: "bakery-alpha",
  storageBucket: "bakery-alpha.firebasestorage.app",
  messagingSenderId: "871466956166",
  appId: "1:871466956166:web:b81561c13448a02b602807",
  measurementId: "G-C4TD19TVPY"
};

const app = initializeApp(firebaseConfig);
try { isSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {}); } catch (e) {}

const auth = getAuth(app);
let db;
try {
  // offline cache: POS keeps working when internet drops, syncs when it returns
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) { db = getFirestore(app); }

/* ---------- helpers ---------- */
const TREE = "tree";
const CHUNK = 300000;                         // Firestore doc limit is ~1MB (UTF-8 bytes), big values are split into safe pieces
const enc = p => encodeURIComponent(p);
const okPath = p => typeof p === "string" && !p.includes("..") && /^(alpha_bakers|hub)\/[A-Za-z0-9_\-./]{1,230}$/.test(p);
const bad = p => { throw new Error("bad path: " + p); };
const race = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const rangeQ = prefix => query(collection(db, TREE), where("path", ">=", prefix + "/"), where("path", "<", prefix + "0"));

async function valOf(d) {
  const x = d.data();
  if (!x.n || x.n < 2) return JSON.parse(x.val);
  let s = x.val;
  for (let i = 1; i < x.n; i++) {
    const c = await getDoc(doc(db, TREE, enc("__c/" + x.path + "/" + i)));
    s += c.exists() ? c.data().val : "";
  }
  return JSON.parse(s);
}
function putNode(batch, path, val) {
  const s = JSON.stringify(val), parts = [];
  for (let i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
  if (!parts.length) parts.push("null");
  batch.set(doc(db, TREE, enc(path)), { path, val: parts[0], n: parts.length, ts: Date.now() });
  for (let i = 1; i < parts.length; i++) {
    const cp = "__c/" + path + "/" + i;
    batch.set(doc(db, TREE, enc(cp)), { path: cp, val: parts[i] });
  }
}
async function childrenOf(path, docs) {
  const o = {}; let any = false; const n = path.length + 1;
  for (const d of docs) {
    const rest = d.data().path.slice(n);
    if (rest.includes("/")) continue;          // direct children only
    o[rest] = await valOf(d); any = true;
  }
  return any ? o : null;
}
async function node(path) {
  const d = await getDoc(doc(db, TREE, enc(path)));
  if (d.exists()) return valOf(d);
  return childrenOf(path, (await getDocs(rangeQ(path))).docs);
}

/* ---------- auth ---------- */
const authReady = new Promise(res => {
  const un = onAuthStateChanged(auth, u => { res(u); un(); });
});
function authError(e) {
  const c = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "Wrong email or password";
  if (c === "auth/too-many-requests") return "Too many attempts. Please try again in a little while";
  if (c === "auth/network-request-failed") return "No internet connection, or the connection is too slow";
  if (c === "auth/operation-not-allowed") return "Please enable Email/Password sign-in in the Firebase Console";
  return (e && e.message) || "Login failed";
}

const FB = {
  app, auth, db,
  fs: { doc, getDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs, writeBatch, onSnapshot, runTransaction },
  user: null,
  authReady,

  async login(email, password) {
    try {
      const r = await signInWithEmailAndPassword(auth, String(email || "").trim(), password || "");
      FB.user = r.user; return { ok: true };
    } catch (e) { throw new Error(authError(e)); }
  },
  async logout() { try { await signOut(auth); } catch (e) {} FB.user = null; try { localStorage.removeItem("fb_user"); } catch (e) {} },
  me() { return { ok: true, email: auth.currentUser ? auth.currentUser.email : "" }; },
  onAuth(cb) { return onAuthStateChanged(auth, cb); },

  async changecred(current, email, password) {
    const u = auth.currentUser;
    if (!u) throw new Error("login required");
    try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current || "")); }
    catch (e) { throw new Error("Current password is wrong"); }
    email = String(email || "").trim().toLowerCase();
    if (password) {
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      await updatePassword(u, password);
    }
    let note = "";
    if (email && email !== (u.email || "").toLowerCase()) {
      await verifyBeforeUpdateEmail(u, email);
      note = "A verification link has been sent to the new email address. After opening the link, log in with the new email (do not forget to add the new email to firestore.rules).";
    }
    return { ok: true, note };
  },

  /* ---------- data (same behaviour as the old api.php) ---------- */
  node,
  async getmany(paths) {
    const d = {};
    await Promise.all((paths || []).map(async p => { if (okPath(p)) d[p] = await node(p); }));
    return d;
  },
  async pull(hubOnly) {
    const hub = {};
    for (const d of (await getDocs(rangeQ("hub"))).docs) hub[d.data().path.slice(4)] = await valOf(d);
    const res = { hub };
    if (!hubOnly) { res.orders = await node("alpha_bakers/orders"); res.menu = await node("alpha_bakers/menu"); }
    return res;
  },
  /* queued write: returns when the server confirms (offline writes wait in the local cache) */
  async set(path, val) {
    if (!okPath(path)) bad(path);
    const b = writeBatch(db);
    if (path.split("/").length <= 2 && !path.startsWith("hub/")) {
      (await getDocs(rangeQ(path))).docs.forEach(d => b.delete(d.ref));   // replace whole subtree
    }
    if (val === null || val === undefined) b.delete(doc(db, TREE, enc(path)));
    else putNode(b, path, val);
    await b.commit();
    return { ok: true };
  },
  async remove(path) {
    if (!okPath(path)) bad(path);
    const b = writeBatch(db);
    b.delete(doc(db, TREE, enc(path)));
    if (path.split("/").length <= 2) (await getDocs(rangeQ(path))).docs.forEach(d => b.delete(d.ref));
    await b.commit();
    return { ok: true };
  },
  /* immediate write for POS: fails fast when offline so the POS can keep the bill in its offline queue */
  async setNow(path, val) {
    if (!navigator.onLine) throw new Error("offline");
    return race(FB.set(path, val), 12000);
  },
  async removeNow(path) {
    if (!navigator.onLine) throw new Error("offline");
    return race(FB.remove(path), 12000);
  },

  /* realtime listener for a path (exact node or its children) */
  listen(path, cb, errCb) {
    let exact = null, kids = null, last = "__init__", t = null;
    const run = async () => {
      try {
        let v = null;
        if (exact && exact.exists()) v = await valOf(exact);
        else if (kids) v = await childrenOf(path, kids.docs);
        const j = JSON.stringify(v);
        if (j !== last) { last = j; cb(v); }
      } catch (e) { if (errCb) errCb(e); }
    };
    const kick = () => { clearTimeout(t); t = setTimeout(run, 30); };
    const e = err => { if (errCb) errCb(err); else console.warn("listen", path, err); };
    const u1 = onSnapshot(doc(db, TREE, enc(path)), s => { exact = s; kick(); }, e);
    const u2 = onSnapshot(rangeQ(path), s => { kids = s; kick(); }, e);
    return () => { u1(); u2(); clearTimeout(t); };
  },

  /* Kitchen usage: deduct stock + save record in ONE transaction (replaces api.php?a=kitchen_commit) */
  kitchenCommit(p) {
    if (!navigator.onLine) return Promise.reject(new Error("offline"));
    return race(FB._kitchen(p), 15000);
  },
  async _kitchen(p) {
    const refStock = doc(db, TREE, enc("hub/ab_stock"));
    const refUse = doc(db, TREE, enc("hub/ab_kitchen_usage"));
    const refMoves = doc(db, TREE, enc("hub/ab_moves"));
    /* values can be split into several documents (see putNode): read ALL pieces, and fail loudly on unreadable data
       instead of treating it as empty (an empty list would be written back and wipe the history) */
    const rd = async (tx, r, path) => {
      const s = await tx.get(r);
      if (!s.exists()) return [];
      const x = s.data(); let str = x.val;
      for (let i = 1; i < (x.n || 1); i++) {
        const c = await tx.get(doc(db, TREE, enc("__c/" + path + "/" + i)));
        if (!c.exists()) throw new Error("Stored data for " + path + " is incomplete. Please try again.");
        str += c.data().val;
      }
      const v = JSON.parse(JSON.parse(str));
      if (!Array.isArray(v)) throw new Error("Stored data for " + path + " is not a list. Please contact support.");
      return v;
    };
    const wr = (tx, r, path, arr) => {
      const s = JSON.stringify(JSON.stringify(arr)), parts = [];
      for (let i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
      if (!parts.length) parts.push("null");
      tx.set(r, { path, val: parts[0], n: parts.length, ts: Date.now() });
      for (let i = 1; i < parts.length; i++) { const cp = "__c/" + path + "/" + i; tx.set(doc(db, TREE, enc(cp)), { path: cp, val: parts[i] }); }
    };
    const fail = m => { const e = new Error(m); e.validation = true; return e; };
    return runTransaction(db, async tx => {
      const stock = await rd(tx, refStock, "hub/ab_stock"), usage = await rd(tx, refUse, "hub/ab_kitchen_usage"), moves = await rd(tx, refMoves, "hub/ab_moves");
      const dup = usage.find(x => x && x.id === p.usageId);
      if (dup) return { record: dup, stock };               // already saved earlier (offline retry) - never deduct twice
      if (!p.items || !p.items.length) throw fail("Select at least one stock item");
      const record = { id: p.usageId, usageNo: p.usageId, date: p.date, time: p.time, reference: p.reference || "", note: p.note || "", createdBy: p.createdBy || (auth.currentUser && auth.currentUser.email) || "", createdAt: p.createdAt || new Date().toISOString(), items: [] };
      for (const it of p.items) {
        const s = stock.find(y => y.id === it.stockItemId);
        const used = Number(it.usedQty);
        if (!s) throw fail("Stock item was not found");
        if (!Number.isFinite(used) || used <= 0) throw fail("Enter a valid used quantity for " + s.name);
        const old = Number(s.qty);
        if (used > old) throw fail("Insufficient stock for " + s.name);
        const rem = Math.round((old - used + Number.EPSILON) * 1e6) / 1e6;
        record.items.push({ stockItemId: s.id, itemName: s.name, oldQty: old, usedQty: used, remainingQty: rem, unit: s.unit || "pcs" });
        s.qty = rem;
        const rate = Number(s.rate) || 0;
        moves.push({ id: "mv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: record.date, time: record.time || "", itemId: s.id, name: s.name, category: s.category || "", unit: s.unit || "pcs", kind: "out", qty: used, rate, total: Math.round(used * rate * 100) / 100, before: old, after: rem, by: record.createdBy, party: "Kitchen", note: "Kitchen usage " + record.id + (record.reference ? " / " + record.reference : "") });
      }
      usage.unshift(record);
      wr(tx, refStock, "hub/ab_stock", stock);
      wr(tx, refUse, "hub/ab_kitchen_usage", usage);
      wr(tx, refMoves, "hub/ab_moves", moves);
      return { record, stock };
    });
  }
};

authReady.then(u => { FB.user = u; });
window.FB = FB;
if (window.__fbResolve) window.__fbResolve(FB);
window.dispatchEvent(new Event("fb-ready"));
export default FB;
