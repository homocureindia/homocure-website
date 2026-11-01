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
    var configured = cfg.apiKey && cfg.apiKey.indexOf("PASTE_") !== 0;
    var A = window.HomocureAuth = { ready: false, configured: configured, user: null, TERMS_VERSION: TERMS_VERSION };
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
            "permission-denied": "You don't have permission to do that."
        };
        return m[e && e.code] || "Something went wrong. Please try again.";
    };

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
            if (!configured) console.warn("[Homocure] Firebase keys are not set — see js/firebase-config.js.");
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
    A.phoneSignIn = function (e164, containerId) {
        return auth.signInWithPhoneNumber(e164, A.recaptcha(containerId));
    };

    /* Verify & attach a phone number to the logged-in user (Google/email users) */
    A.linkPhone = function (e164, containerId) {
        return auth.currentUser.linkWithPhoneNumber(e164, A.recaptcha(containerId));
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
