/* ===========================================================
   Account page
   Profile · email verification · mobile verification ·
   password change (re-authenticates) · terms gate · orders
=========================================================== */
(function () {
    "use strict";
    var A = window.HomocureAuth;
    var $ = function (id) { return document.getElementById(id); };
    var confirmation = null;
    var ordersLoadedFor = null;
    var resendTimer = null;

    function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
    function fmtDate(v) {
        var d = v && v.toDate ? v.toDate() : (v ? new Date(v) : null);
        return d && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
    }
    function fieldErr(id, text) {
        var el = $(id + "Err"); if (el) el.textContent = text || "";
        var input = $(id); if (input) { if (text) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
    }
    function busy(btn, on) { btn.disabled = on; btn.classList.toggle("is-loading", on); }
    function phoneMsg(text, type) { var m = $("accMsg"); m.textContent = text; m.className = "auth-msg show " + (type || "error"); }
    function clearPhoneMsg() { $("accMsg").className = "auth-msg"; }

    /* ---------- rendering ---------- */
    function providerName(id) {
        return { "password": "Email & password", "google.com": "Google", "phone": "Mobile OTP" }[id] || id;
    }

    function renderProfile(u) {
        var name = u.displayName || (u.email ? u.email.split("@")[0] : "Homocure customer");
        $("accName").textContent = name;
        $("accEmail").textContent = u.email || u.phoneNumber || "";
        $("accAvatar").innerHTML = u.photoURL && u.photoURL.indexOf("https://") === 0
            ? '<img src="' + esc(u.photoURL).replace(/"/g, "&quot;") + '" alt="" referrerpolicy="no-referrer">'
            : esc(name.charAt(0).toUpperCase());

        $("accEmailBadge").innerHTML = u.email
            ? esc(u.email) + ' ' + (u.emailVerified ? '<span class="badge ok">Verified ✓</span>' : '<span class="badge warn">Not verified</span>')
            : '<span class="badge warn">Not added</span>';
        $("accPhoneBadge").innerHTML = u.phoneNumber
            ? esc(u.phoneNumber) + ' <span class="badge ok">Verified ✓</span>'
            : '<span class="badge warn">Not verified</span>';
        $("accMethods").innerHTML = A.providers().map(function (p) { return '<span class="chip">' + esc(providerName(p)) + '</span>'; }).join("") || '<span class="chip">—</span>';
        $("accSince").textContent = u.metadata && u.metadata.creationTime ? fmtDate(u.metadata.creationTime) : "—";

        if (document.activeElement !== $("profName")) $("profName").value = u.displayName || "";
        $("profEmail").value = u.email || "";
        $("profPhone").value = u.phoneNumber || "";

        // email verification banner (only for accounts that have an email)
        var needsVerify = !!u.email && !u.emailVerified;
        $("verifyBanner").classList.toggle("hidden", !needsVerify);
        $("bannerEmail").textContent = u.email || "";

        $("phoneCard").classList.toggle("hidden", !!u.phoneNumber);

        var hasPw = A.hasPassword();
        $("pwForm").classList.toggle("hidden", !hasPw);
        $("noPwNote").classList.toggle("hidden", hasPw);
    }

    function loadOrders(u) {
        if (ordersLoadedFor === u.uid) return;
        ordersLoadedFor = u.uid;
        var box = $("orderList");
        if (!A.db) { box.innerHTML = '<div class="empty">Orders are unavailable right now.</div>'; return; }
        A.db.collection("orders").where("uid", "==", u.uid).get().then(function (snap) {
            var rows = [];
            snap.forEach(function (d) { var o = d.data(); o.id = d.id; rows.push(o); });
            rows.sort(function (a, b) {
                var x = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
                var y = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
                return y - x;
            });
            if (!rows.length) { box.innerHTML = '<div class="empty">You have no orders yet.</div>'; return; }
            box.innerHTML = rows.map(function (o) {
                return '<div class="order-item"><div class="order-top"><b>' + esc(o.product) + ' × ' + esc(o.qty) +
                    '</b><span class="badge ok">' + esc(o.status || "new") + '</span></div>' +
                    '<div class="order-meta">' + esc(fmtDate(o.createdAt)) + ' · ' + esc(o.city || "") + ' ' + esc(o.pincode || "") +
                    (o.pack ? ' · ' + esc(o.pack) : '') + '</div></div>';
            }).join("");
        }).catch(function () {
            box.innerHTML = '<div class="empty">We couldn\'t load your orders. Please try again later.</div>';
        });
    }

    /* ---------- state: guest / terms gate / full account ---------- */
    function showGate(on) {
        $("termsGate").classList.toggle("hidden", !on);
        $("accContent").classList.toggle("hidden", on);
    }

    function onUser(u) {
        $("accLoading").classList.add("hidden");
        if (!u) { $("accMain").classList.add("hidden"); $("accGuest").classList.remove("hidden"); return; }
        $("accGuest").classList.add("hidden");
        $("accMain").classList.remove("hidden");
        renderProfile(u);

        if (!A.db) { showGate(false); loadOrders(u); return; }
        // Profile record: if it doesn't exist the account must accept the terms first.
        A.getProfile().then(function (p) {
            $("profileNotice").classList.add("hidden");
            showGate(!p);
            if (p) loadOrders(u);
        }).catch(function () {
            // Firestore rules not published yet (or offline): keep the page usable.
            showGate(false);
            $("profileNotice").textContent = "Your profile record couldn't be loaded right now. Some details may be unavailable.";
            $("profileNotice").classList.remove("hidden");
            loadOrders(u);
        });
    }
    A.onChange(onUser);

    /* ---------- terms gate ---------- */
    $("gateAccept").addEventListener("click", function () {
        fieldErr("gateTerms", "");
        if (!$("gateTerms").checked) return fieldErr("gateTerms", "Please accept the Terms & Conditions and Privacy Policy to continue.");
        var btn = $("gateAccept"); busy(btn, true);
        A.ensureProfile(true).then(function () { onUser(A.user); })
            .catch(function (e) { fieldErr("gateTerms", A.err(e)); })
            .then(function () { busy(btn, false); });
    });
    $("gateLogout").addEventListener("click", function () { A.signOut().then(function () { location.href = "index.html"; }); });

    /* ---------- sign out ---------- */
    $("accLogout").addEventListener("click", function () { A.signOut().then(function () { location.href = "index.html"; }); });

    /* ---------- email verification ---------- */
    function cooldown(btn, label, secs) {
        var left = secs; btn.disabled = true; btn.textContent = label + " (" + left + "s)";
        clearInterval(resendTimer);
        resendTimer = setInterval(function () {
            left--; if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = label; }
            else btn.textContent = label + " (" + left + "s)";
        }, 1000);
    }
    $("bannerResend").addEventListener("click", function () {
        var btn = $("bannerResend");
        A.resendVerification().then(function () {
            A.toast("Verification email sent. Please check your inbox.", "ok");
            cooldown(btn, "Resend email", 60);
        }).catch(function (e) { A.toast(A.err(e), "error"); });
    });
    $("bannerRefresh").addEventListener("click", function () {
        var btn = $("bannerRefresh"); busy(btn, true);
        A.refreshUser().then(function (u) {
            if (u && u.emailVerified) A.toast("Email verified ✓", "ok");
            else A.toast("Not verified yet. Please open the link in the email first.", "error");
        }).catch(function (e) { A.toast(A.err(e), "error"); })
          .then(function () { busy(btn, false); });
    });

    /* ---------- profile ---------- */
    $("profName").addEventListener("input", function () { fieldErr("profName", ""); });
    $("profileForm").addEventListener("submit", function (e) {
        e.preventDefault();
        fieldErr("profName", "");
        var name = $("profName").value.trim();
        if (!A.validName(name)) return fieldErr("profName", "Please enter your full name (2–100 characters).");
        var btn = $("profSave"); busy(btn, true);
        A.updateName(name).then(function () { A.toast("Profile updated ✓", "ok"); })
            .catch(function (er) { fieldErr("profName", A.err(er)); })
            .then(function () { busy(btn, false); });
    });

    /* ---------- change password (re-authenticates with the current password) ---------- */
    all(".pw-toggle").forEach(function (b) {
        b.addEventListener("click", function () {
            var input = $(b.dataset.target), reveal = input.type === "password";
            input.type = reveal ? "text" : "password";
            b.textContent = reveal ? "Hide" : "Show";
            b.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        });
    });
    function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
    ["curPw", "newPw", "newPw2"].forEach(function (id) { $(id).addEventListener("input", function () { fieldErr(id, ""); }); });

    $("pwForm").addEventListener("submit", function (e) {
        e.preventDefault();
        ["curPw", "newPw", "newPw2"].forEach(function (id) { fieldErr(id, ""); });
        var cur = $("curPw").value, nw = $("newPw").value, nw2 = $("newPw2").value, ok = true;
        if (!cur) { fieldErr("curPw", "Please enter your current password."); ok = false; }
        var issue = A.passwordIssue(nw);
        if (issue) { fieldErr("newPw", issue); ok = false; }
        else if (nw === cur) { fieldErr("newPw", "Your new password must be different from the current one."); ok = false; }
        else if (nw !== nw2) { fieldErr("newPw2", "The two passwords don't match."); ok = false; }
        if (!ok) { var bad = document.querySelector('#pwForm [aria-invalid="true"]'); if (bad) bad.focus(); return; }

        var btn = $("pwSave"); busy(btn, true);
        A.changePassword(cur, nw).then(function () {
            $("pwForm").reset();
            A.toast("Password updated ✓", "ok");
        }).catch(function (er) {
            var bad = er && (er.code === "auth/wrong-password" || er.code === "auth/invalid-credential");
            if (bad) fieldErr("curPw", "Your current password is incorrect.");
            else if (er && er.code === "auth/weak-password") fieldErr("newPw", "Please choose a stronger password.");
            else A.toast(A.err(er), "error");
        }).then(function () { busy(btn, false); });
    });

    /* ---------- verify / link mobile number ---------- */
    $("accPhoneInput").addEventListener("input", function () { fieldErr("accPhoneInput", ""); });
    $("accPhone1").addEventListener("submit", function (e) {
        e.preventDefault(); clearPhoneMsg(); fieldErr("accPhoneInput", "");
        var phone = A.normalizePhone($("accPhoneInput").value);
        if (!phone) return fieldErr("accPhoneInput", "Please enter a valid 10-digit mobile number.");
        var btn = $("accSend"); busy(btn, true);
        A.linkPhone(phone, "acc-recaptcha").then(function (c) {
            confirmation = c;
            $("accPhone1").classList.add("hidden");
            $("accPhone2").classList.remove("hidden");
            phoneMsg("OTP sent to " + phone + ".", "ok");
        }).catch(function (er) { phoneMsg(A.err(er)); }).then(function () { busy(btn, false); });
    });
    $("accPhone2").addEventListener("submit", function (e) {
        e.preventDefault(); clearPhoneMsg(); fieldErr("accOtp", "");
        var code = $("accOtp").value.trim();
        if (!/^\d{6}$/.test(code)) return fieldErr("accOtp", "Please enter the 6-digit code.");
        if (!confirmation) return phoneMsg("Please request a new OTP.");
        var btn = $("accVerify"); busy(btn, true);
        confirmation.confirm(code).then(function () {
            return A.auth.currentUser.getIdToken(true);       // refresh token so rules see phone_number
        }).then(function () { return A.refreshUser(); })
          .then(function () {
            $("accPhone2").classList.add("hidden"); $("accPhone1").classList.remove("hidden"); $("accPhone2").reset();
            A.toast("Mobile number verified ✓", "ok");
        }).catch(function (er) { phoneMsg(A.err(er)); })
          .then(function () { busy(btn, false); });
    });

    if (location.hash === "#orders") setTimeout(function () { var o = $("orders"); if (o) o.scrollIntoView({ behavior: "smooth" }); }, 600);
})();
