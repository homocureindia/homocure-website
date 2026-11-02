/* ===========================================================
   HOMOCURE AUTH — Firebase Authentication
   • Google / Email+Password / Phone OTP
   • Navbar login state on every page
   • window.HomocureAuth API used by login, account & orders
=========================================================== */
(function () {
    "use strict";

    /* Version of the Terms & Privacy text accepted at sign-up.
       Must equal termsVersion() in firestore.rules. */
    var TERMS_VERSION = "2026-10";

    var cfg = window.HOMOCURE_FIREBASE || {};

    /* Why would sign-in be unavailable? (shown only in the console / diagnose(), never to visitors)
       - config-file-missing-or-broken : js/firebase-config.js 404 or has a JavaScript syntax error
       - config-incomplete-or-placeholder : a required field is empty or still says PASTE_...
       - sdk-not-loaded : the Firebase scripts from gstatic.com did not load (blocked / offline) */
    var REQUIRED = ["apiKey", "authDomain", "projectId", "appId"];
    var badFields = REQUIRED.filter(function (f) {
        var v = cfg[f];
        return typeof v !== "string" || !v.trim() || /PASTE_/.test(v);
    });
    var reason = null;
    if (!window.HOMOCURE_FIREBASE) reason = "config-file-missing-or-broken";
    else if (badFields.length) reason = "config-incomplete-or-placeholder";
    else if (!window.firebase) reason = "sdk-not-loaded";
    var configured = !reason;

    var A = window.HomocureAuth = { ready: false, configured: configured, reason: reason, user: null, TERMS_VERSION: TERMS_VERSION };

    // Safe to run in the browser console on any page:  HomocureAuth.diagnose()
    // (never prints the API key)
    A.diagnose = function () {
        function safe(v) { return typeof v === "string" && v && !/PASTE_/.test(v) ? v : null; }
        return {
            reason: reason,
            configured: configured,
            sdkLoaded: !!window.firebase,
            configFileLoaded: !!window.HOMOCURE_FIREBASE,
            fieldsMissingOrPlaceholder: badFields,
            projectId: safe(cfg.projectId),
            authDomain: safe(cfg.authDomain),
            pageHost: location.hostname,
            ordersOpenFlag: window.HOMOCURE_ORDERS_OPEN,
            lastError: A._last || null
        };
    };

    var REASON_HELP = {
        "config-file-missing-or-broken": "js/firebase-config.js did not define window.HOMOCURE_FIREBASE. The file is missing (404) or has a JavaScript syntax error (check the Console for 'SyntaxError' and the Network tab for the file).",
        "config-incomplete-or-placeholder": "These Firebase config fields are empty or still placeholders: " + badFields.join(", ") + ". Paste your web-app config (Firebase Console > Project settings > Your apps).",
        "sdk-not-loaded": "The Firebase SDK (gstatic.com/firebasejs) did not load — blocked by a network filter, ad/privacy blocker, or you are offline."
    };
    var listeners = [];

    A.onChange = function (fn) { listeners.push(fn); if (A.ready) fn(A.user); };

    function emit() { listeners.forEach(function (fn) { fn(A.user); }); }

    /* ---------- Validators (shared by login + account pages) ---------- */
    A.isEmail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim()); };

    // null = OK, otherwise the message to show
    A.passwordIssue = function (pw) {
        pw = String(pw || "");
        if (pw.length < 8) return "Password must be at least 8 characters.";
        if (pw.length > 128) return "Password is too long (max 128 characters).";
        if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use at least one letter and one number.";
        return null;
    };

    // 0..4 for the strength meter
    A.passwordScore = function (pw) {
        pw = String(pw || "");
        if (!pw) return 0;
        var sc = 0;
        if (pw.length >= 8) sc++;
        if (pw.length >= 12) sc++;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) sc++;
        if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) sc++;
        return Math.min(sc, 4);
    };

    A.validName = function (v) { var n = String(v || "").trim(); return n.length >= 2 && n.length <= 100; };

    /* ---------- Friendly error messages (generic on purpose for sign-in:
       we never reveal whether an email exists) ---------- */
    A.err = function (e) {
        var m = {
            "auth/invalid-email": "Please enter a valid email address.",
            "auth/user-not-found": "Incorrect email or password.",
            "auth/wrong-password": "Incorrect email or password.",
            "auth/invalid-credential": "Incorrect email or password.",
            "auth/user-disabled": "This account has been disabled. Please contact support.",
            "auth/email-already-in-use": "An account with this email already exists. Please sign in instead.",
            "auth/account-exists-with-different-credential": "An account with this email already exists using a different sign-in method. Please sign in with that method.",
            "auth/weak-password": "Please choose a stronger password.",
            "auth/popup-closed-by-user": "The Google window was closed before finishing. Please try again.",
            "auth/cancelled-popup-request": "Another sign-in window is already open.",
            "auth/popup-blocked": "Your browser blocked the sign-in popup. Please allow popups and try again.",
            "auth/invalid-phone-number": "Please enter a valid mobile number.",
            "auth/missing-phone-number": "Please enter your mobile number.",
            "auth/invalid-verification-code": "That OTP is incorrect. Please check and try again.",
            "auth/missing-verification-code": "Please enter the OTP.",
            "auth/code-expired": "This OTP has expired. Please request a new one.",
            "auth/session-expired": "This OTP has expired. Please request a new one.",
            "auth/quota-exceeded": "SMS limit reached. Please try again later.",
            "auth/captcha-check-failed": "Security check failed. Please refresh the page and try again.",
            "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
            "auth/credential-already-in-use": "This mobile number is already linked to another account.",
            "auth/provider-already-linked": "A mobile number is already linked to this account.",
            "auth/requires-recent-login": "For your security, please sign in again and retry.",
            "auth/network-request-failed": "Network error. Please check your internet connection.",
            "auth/operation-not-allowed": "This sign-in method is not enabled yet.",
            "auth/unauthorized-domain": "This website domain is not authorised for sign-in yet.",
            "auth/invalid-api-key": "Sign-in is temporarily unavailable. Please try again later.",
            "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Sign-in is temporarily unavailable. Please try again later.",
            "auth/configuration-not-found": "Sign-in is temporarily unavailable. Please try again later.",
            "auth/app-not-authorized": "Sign-in is temporarily unavailable. Please try again later.",
            "auth/invalid-app-credential": "Security check failed. Please refresh the page and try again.",
            "auth/missing-app-credential": "Security check failed. Please refresh the page and try again.",
            "auth/billing-not-enabled": "Mobile OTP is temporarily unavailable. Please sign in with Google or email for now.",
            "auth/internal-error": "Something went wrong on our side. Please try again in a moment.",
            "permission-denied": "You don't have permission to do that."
        };
        var CONFIG_HINT = {
            "auth/invalid-api-key": "the API key in js/firebase-config.js is wrong or restricted for this domain (Google Cloud > Credentials > browser key > website restrictions)",
            "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "the API key in js/firebase-config.js is wrong or restricted for this domain (Google Cloud > Credentials > browser key > website restrictions)",
            "auth/configuration-not-found": "Firebase Authentication is not set up for this project (Console > Authentication > Get started, then enable the sign-in methods)",
            "auth/app-not-authorized": "this website is not authorised for the API key (Google Cloud > Credentials > website restrictions)",
            "auth/unauthorized-domain": "add " + location.hostname + " to Firebase Console > Authentication > Settings > Authorized domains",
            "auth/operation-not-allowed": "enable this sign-in method in Firebase Console > Authentication > Sign-in method",
            "auth/captcha-check-failed": "the reCAPTCHA check was rejected: reload and retry once; then check Authorized domains and App Check enforcement for Authentication",
            "auth/invalid-app-credential": "the reCAPTCHA token was rejected or expired: reload and retry once (each token works once); if it persists check App Check enforcement for Authentication and the reCAPTCHA settings",
            "auth/missing-app-credential": "no reCAPTCHA token reached Firebase: reload and retry; check that no extension blocks google.com/recaptcha",
            "auth/billing-not-enabled": "Firebase says this project has no billing account linked, which SMS sign-in requires (test phone numbers work without it) — see Firebase Console > Billing",
            "auth/quota-exceeded": "the SMS quota for this project is used up (Firebase Console > Authentication > Usage)"
        };
        if (e && CONFIG_HINT[e.code]) console.error("[Homocure] " + e.code + " — " + CONFIG_HINT[e.code] + ".");

        // Exact error for debugging (visible in the browser console and HomocureAuth.lastError()).
        // Routine user mistakes are not logged. The API key is never logged.
        var EXPECTED = { "auth/invalid-credential": 1, "auth/wrong-password": 1, "auth/user-not-found": 1, "auth/invalid-email": 1,
            "auth/weak-password": 1, "auth/email-already-in-use": 1, "auth/popup-closed-by-user": 1, "auth/cancelled-popup-request": 1,
            "auth/invalid-verification-code": 1, "auth/missing-verification-code": 1, "auth/invalid-phone-number": 1, "auth/missing-phone-number": 1 };
        if (e && (e.code || e.message) && !EXPECTED[e.code]) {
            var srv = serverMessage(e);
            A._last = { context: e._phoneFlow ? "phone-otp" : "auth", code: e.code || null, server: srv, message: String(e.message || "").slice(0, 200), host: location.hostname, time: new Date().toISOString() };
            console.error("[Homocure] " + A._last.context + " error — code: " + A._last.code + (srv ? " | server: " + srv : "") + " | message: " + A._last.message);
        }

        if (m[e && e.code]) return m[e.code];
        if (e && e._phoneFlow) return "Mobile OTP is temporarily unavailable. Please sign in with Google or email, or try again later.";
        return "Something went wrong. Please try again.";
    };

    // the real server error (e.g. BILLING_NOT_ENABLED) when the SDK exposes it
    function serverMessage(e) {
        try {
            var r = e && e.customData && e.customData._serverResponse;
            if (!r) return null;
            if (typeof r === "string") return r.slice(0, 200);
            if (r.error && r.error.message) return String(r.error.message).slice(0, 200);
            return JSON.stringify(r).slice(0, 200);
        } catch (x) { return null; }
    }
    A.lastError = function () { return A._last || null; };

    /* Small toast helper shared by other scripts */
    A.toast = function (msg, type) {
        var t = document.createElement("div");
        t.className = "hc-toast " + (type || "");
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(function () { t.classList.add("show"); });
        setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 400); }, 3800);
    };

    /* ---------- Not configured: keep site working, show nav link only ---------- */
    if (!configured || !window.firebase) {
        A.configured = false;      // also covers "Firebase SDK failed to load" (blocked CDN / offline)
        document.addEventListener("DOMContentLoaded", function () {
            console.error("[Homocure] Sign-in is disabled (" + reason + "). " + REASON_HELP[reason] + " Run HomocureAuth.diagnose() for details.");
            buildNav();
            A.ready = true; emit();
        });
        return;
    }

    firebase.initializeApp(cfg);
    var auth = firebase.auth();
    auth.languageCode = "en";
    A.auth = auth;
    A.db = firebase.firestore();

    /* ---------- Session persistence ("Keep me signed in") ---------- */
    A.setRemember = function (remember) {
        var P = firebase.auth.Auth.Persistence;
        return auth.setPersistence(remember === false ? P.SESSION : P.LOCAL).catch(function () {});
    };

    /* ---------- Sign-in actions ---------- */
    A.google = function () {
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        return auth.signInWithPopup(provider);
    };

    // Creates the account, sets the name and sends the verification email.
    // Resolves { user, verificationSent } — a failed email never blocks sign-up.
    A.signUp = function (name, email, pass) {
        return auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
            return cred.user.updateProfile({ displayName: name }).catch(function () {}).then(function () {
                return cred.user.sendEmailVerification().then(
                    function () { return { user: cred.user, verificationSent: true }; },
                    function () { return { user: cred.user, verificationSent: false }; }
                );
            });
        });
    };

    A.signIn  = function (email, pass) { return auth.signInWithEmailAndPassword(email, pass); };
    A.reset   = function (email) { return auth.sendPasswordResetEmail(email); };
    A.signOut = function () { return auth.signOut(); };

    /* ---------- Email verification ---------- */
    A.resendVerification = function () {
        if (!auth.currentUser) return Promise.reject({ code: "auth/requires-recent-login" });
        return auth.currentUser.sendEmailVerification();
    };

    // Re-reads the account from Firebase (picks up emailVerified / phone changes)
    A.refreshUser = function () {
        if (!auth.currentUser) return Promise.resolve(null);
        return auth.currentUser.reload().then(function () {
            A.user = auth.currentUser; renderNav(); emit(); return A.user;
        });
    };

    A.providers = function () {
        return (A.user ? A.user.providerData : []).map(function (p) { return p.providerId; });
    };
    A.hasPassword = function () { return A.providers().indexOf("password") !== -1; };

    /* ---------- Profile document: users/{uid} ---------- */
    A.getProfile = function () {
        var u = auth.currentUser;
        return A.db.collection("users").doc(u.uid).get().then(function (snap) {
            return snap.exists ? snap.data() : null;
        });
    };

    // Creates the profile (and records terms acceptance) if it doesn't exist.
    // Resolves { exists:boolean }. Never overwrites an existing profile.
    A.ensureProfile = function (termsAccepted) {
        var u = auth.currentUser;
        var ref = A.db.collection("users").doc(u.uid);
        return ref.get().then(function (snap) {
            if (snap.exists) return { exists: true };
            if (!termsAccepted) return { exists: false };
            var ts = firebase.firestore.FieldValue.serverTimestamp();
            return ref.set({
                displayName: (u.displayName || "").slice(0, 100),
                termsAccepted: true,
                termsVersion: TERMS_VERSION,
                termsAcceptedAt: ts,
                createdAt: ts,
                updatedAt: ts
            }).then(function () { return { exists: true, created: true }; });
        });
    };

    A.updateName = function (name) {
        var u = auth.currentUser;
        var ref = A.db.collection("users").doc(u.uid);
        return u.updateProfile({ displayName: name }).then(function () {
            return ref.get();
        }).then(function (snap) {
            if (!snap.exists) return null;
            return ref.update({ displayName: name, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }).then(function () { A.user = auth.currentUser; renderNav(); emit(); });
    };

    /* ---------- Sensitive actions need a fresh login (re-authentication) ---------- */
    A.reauthPassword = function (currentPassword) {
        var u = auth.currentUser;
        return u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, currentPassword));
    };
    A.changePassword = function (currentPassword, newPassword) {
        return A.reauthPassword(currentPassword).then(function () {
            return auth.currentUser.updatePassword(newPassword);
        });
    };

    /* Invisible reCAPTCHA (needed by Firebase for phone OTP) */
    A.recaptcha = function (containerId) {
        if (A._verifier) { try { A._verifier.clear(); } catch (e) {} }
        A._verifier = new firebase.auth.RecaptchaVerifier(containerId, { size: "invisible" });
        return A._verifier;
    };

    /* Phone sign-in (new or existing user) */
    function tagPhone(p) { return p.catch(function (e) { if (e && typeof e === "object") e._phoneFlow = true; throw e; }); }
    A.phoneSignIn = function (e164, containerId) {
        return tagPhone(auth.signInWithPhoneNumber(e164, A.recaptcha(containerId)));
    };

    /* Verify & attach a phone number to the logged-in user (Google/email users) */
    A.linkPhone = function (e164, containerId) {
        return tagPhone(auth.currentUser.linkWithPhoneNumber(e164, A.recaptcha(containerId)));
    };

    A.hasPhone = function () { return !!(A.user && A.user.phoneNumber); };

    /* India-friendly normalisation → +91XXXXXXXXXX */
    A.normalizePhone = function (raw) {
        var d = String(raw || "").replace(/[^\d+]/g, "");
        if (d.indexOf("+") === 0) return /^\+\d{10,14}$/.test(d) ? d : null;
        d = d.replace(/^0+/, "");
        if (d.indexOf("91") === 0 && d.length === 12) d = d.slice(2);
        return /^[6-9]\d{9}$/.test(d) ? "+91" + d : null;
    };

    auth.onAuthStateChanged(function (u) {
        A.user = u; A.ready = true;
        renderNav(); emit();
    });

    /* ===========================================================
       NAVBAR (every page)
    =========================================================== */
    var slot, mobileLi;

    // Only https image URLs, with HTML-attribute escaping (defence in depth)
    function safePhoto(url) {
        if (typeof url !== "string" || url.indexOf("https://") !== 0) return "";
        return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
                  .replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function initials(u) {
        var n = (u.displayName || u.email || u.phoneNumber || "U").trim();
        return n.charAt(0).toUpperCase();
    }

    function buildNav() {
        var container = document.querySelector(".nav-container");
        var links = document.querySelector(".nav-links");
        if (!container) return;

        slot = document.createElement("div");
        slot.className = "auth-slot";
        var cta = container.querySelector(":scope > .btn-primary");
        container.insertBefore(slot, cta);

        if (links) {
            mobileLi = document.createElement("li");
            mobileLi.className = "auth-mobile-li";
            links.appendChild(mobileLi);
        }
        renderNav();
    }

    function renderNav() {
        if (!slot) return;
        var u = A.user;

        if (!u) {
            slot.innerHTML = '<a href="login.html" class="auth-login-btn">Login</a>';
            if (mobileLi) mobileLi.innerHTML = '<a href="login.html">Login / Sign Up</a>';
            return;
        }

        var name = u.displayName || u.email || u.phoneNumber || "My Account";
        slot.innerHTML =
            '<div class="auth-user">' +
                '<button class="auth-avatar" aria-label="Account menu">' +
                    (safePhoto(u.photoURL) ? '<img src="' + safePhoto(u.photoURL) + '" alt="" referrerpolicy="no-referrer">' : initials(u)) +
                '</button>' +
                '<div class="auth-menu">' +
                    '<div class="auth-menu-name"></div>' +
                    '<a href="account.html">My Account</a>' +
                    '<a href="account.html#orders">My Orders</a>' +
                    '<button class="auth-logout">Logout</button>' +
                '</div>' +
            '</div>';
        slot.querySelector(".auth-menu-name").textContent = name;

        var wrap = slot.querySelector(".auth-user");
        slot.querySelector(".auth-avatar").addEventListener("click", function (e) {
            e.stopPropagation(); wrap.classList.toggle("open");
        });
        slot.querySelector(".auth-logout").addEventListener("click", function () {
            A.signOut().then(function () { location.href = "index.html"; });
        });

        if (mobileLi) {
            mobileLi.innerHTML = '<a href="account.html">My Account</a>' +
                '<a href="#" class="auth-mobile-logout">Logout</a>';
            mobileLi.querySelector(".auth-mobile-logout").addEventListener("click", function (e) {
                e.preventDefault();
                A.signOut().then(function () { location.href = "index.html"; });
            });
        }
    }

    document.addEventListener("click", function () {
        var w = document.querySelector(".auth-user.open");
        if (w) w.classList.remove("open");
    });

    document.addEventListener("DOMContentLoaded", buildNav);

})();
