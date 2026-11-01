/* ===========================================================
   Sign In / Sign Up page
   Google · Email+password (with email verification) · Mobile OTP
   Forgot password · Terms consent · validation · redirects
=========================================================== */
(function () {
    "use strict";
    var A = window.HomocureAuth;
    var $ = function (id) { return document.getElementById(id); };
    var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

    var mode = "signin";        // signin | signup
    var method = "email";       // email | phone
    var confirmation = null;    // phone OTP confirmation
    var lastPhone = "";
    var flowActive = false;     // true while a sign-in/up action is running (blocks auto-redirect)
    var cooldownTimer = null;

    /* ---------- helpers ---------- */
    function nextUrl() {
        var n = new URLSearchParams(location.search).get("next") || "";
        return /^[a-z0-9-]+\.html(#[a-z]+)?$/i.test(n) ? n : "account.html";   // same-site pages only
    }
    function done() { location.href = nextUrl(); }

    var msg = $("authMsg");
    function show(text, type) { msg.textContent = text; msg.className = "auth-msg show " + (type || "error"); }
    function clearMsg() { msg.className = "auth-msg"; msg.textContent = ""; }

    function fieldErr(id, text) {
        var el = $(id + "Err");
        if (el) el.textContent = text || "";
        var input = $(id);
        if (input) { if (text) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
    }
    function clearFieldErrors() {
        ["fullName", "email", "password", "password2", "phoneName", "phone", "otp", "forgotEmail", "terms"].forEach(function (id) { fieldErr(id, ""); });
    }

    // After a failed validation, move focus (and scroll) to the first invalid field
    function focusFirstError() {
        var el = document.querySelector('#viewMain:not(.hidden) [aria-invalid="true"], #viewForgot:not(.hidden) [aria-invalid="true"]');
        if (el && typeof el.focus === "function") el.focus();
    }

    function busy(btn, on) {
        btn.disabled = on;
        btn.classList.toggle("is-loading", on);
    }
    // Runs an async action with a loading button + guarded auto-redirect
    function run(btn, fn) {
        flowActive = true; clearMsg(); busy(btn, true);
        return Promise.resolve().then(fn).catch(function (e) {
            flowActive = false;
            show(A.err(e));
        }).then(function () { busy(btn, false); });
    }

    function needSetup() {
        if (A.configured) return false;
        show("Sign-in is not available yet — the site owner needs to finish the Firebase setup.");
        return true;
    }

    /* ---------- view / tab state ---------- */
    function setView(v) {
        ["viewMain", "viewForgot", "viewVerify"].forEach(function (id) { $(id).classList.toggle("hidden", id !== v); });
        $("tabSignin").parentNode.classList.toggle("hidden", v !== "viewMain");
        clearMsg(); clearFieldErrors();
        // The card changes height; bring it back into view below the fixed navbar
        // (otherwise its buttons can end up hidden behind the header).
        var card = document.querySelector(".auth-card");
        var top = card.getBoundingClientRect().top + window.pageYOffset - 110;
        if (top < window.pageYOffset || top - window.pageYOffset > 0) window.scrollTo(0, Math.max(0, top));
    }

    function render() {
        clearMsg(); clearFieldErrors();
        var up = mode === "signup";
        $("tabSignin").classList.toggle("active", !up); $("tabSignin").setAttribute("aria-selected", String(!up));
        $("tabSignup").classList.toggle("active", up);  $("tabSignup").setAttribute("aria-selected", String(up));
        all(".auth-methods button").forEach(function (b) { b.classList.toggle("active", b.dataset.method === method); });
        $("authTitle").textContent = up ? "Create your account" : "Welcome back";
        $("authSub").textContent = up ? "Join Homocure to manage your profile and orders." : "Sign in to continue to Homocure.";
        $("emailForm").classList.toggle("hidden", method !== "email");
        $("phoneForm").classList.toggle("hidden", method !== "phone");
        all(".only-signup").forEach(function (el) { el.classList.toggle("hidden", !up); });
        all(".only-signin").forEach(function (el) { el.classList.toggle("hidden", up); });
        // the "forgot" link lives only in the email form
        $("emailSubmit").textContent = up ? "Create account" : "Sign In";
        $("password").setAttribute("autocomplete", up ? "new-password" : "current-password");
        $("password").setAttribute("placeholder", up ? "Create a password" : "Enter your password");
        $("googleLabel").textContent = up ? "Sign up with Google" : "Continue with Google";
        history.replaceState(null, "", location.pathname + location.search + (up ? "#signup" : ""));
    }

    all(".auth-tabs button").forEach(function (b) { b.addEventListener("click", function () { mode = b.dataset.tab; render(); }); });
    all(".auth-methods button").forEach(function (b) { b.addEventListener("click", function () { method = b.dataset.method; render(); }); });

    // Deep links: login.html#signup  or  login.html?tab=signup
    if (location.hash === "#signup" || new URLSearchParams(location.search).get("tab") === "signup") mode = "signup";

    if (!A.configured) $("setupNote").classList.remove("hidden");

    // Already signed in (e.g. returning visitor) → go straight to the account / next page
    A.onChange(function (u) { if (u && !flowActive) done(); });

    /* ---------- password show/hide + strength ---------- */
    all(".pw-toggle").forEach(function (b) {
        b.addEventListener("click", function () {
            var input = $(b.dataset.target);
            var show = input.type === "password";
            input.type = show ? "text" : "password";
            b.textContent = show ? "Hide" : "Show";
            b.setAttribute("aria-label", show ? "Hide password" : "Show password");
        });
    });

    $("password").addEventListener("input", function () {
        fieldErr("password", "");
        var sc = A.passwordScore($("password").value);
        var meter = $("pwMeter");
        meter.setAttribute("data-score", String(sc));
        $("pwMeterLabel").textContent = ["", "Weak", "Fair", "Good", "Strong"][sc];
    });

    // clear a field's error as soon as the user edits it
    ["fullName", "email", "password2", "phoneName", "phone", "otp", "forgotEmail"].forEach(function (id) {
        $(id).addEventListener("input", function () { fieldErr(id, ""); });
    });
    $("terms").addEventListener("change", function () { fieldErr("terms", ""); });

    function termsOk() {
        if (mode !== "signup") return true;
        if ($("terms").checked) return true;
        fieldErr("terms", "Please accept the Terms & Conditions and Privacy Policy to create an account.");
        return false;
    }

    /* After ANY successful authentication */
    function afterAuth(isSignupAttempt) {
        var accepted = isSignupAttempt && $("terms").checked;
        return A.ensureProfile(accepted).catch(function () { return { exists: false, error: true }; });
    }

    /* ---------- Google ---------- */
    $("googleBtn").addEventListener("click", function () {
        if (needSetup()) return;
        clearFieldErrors();
        if (!termsOk()) return;
        run($("googleBtn"), function () {
            return A.setRemember($("remember").checked || mode === "signup")
                .then(function () { return A.google(); })
                .then(function () { return afterAuth(mode === "signup"); })
                .then(done);
        });
    });

    /* ---------- Email: sign in / sign up ---------- */
    $("emailForm").addEventListener("submit", function (e) {
        e.preventDefault();
        if (needSetup()) return;
        clearMsg(); clearFieldErrors();

        var email = $("email").value.trim();
        var pass = $("password").value;
        var ok = true;
        var up = mode === "signup";

        if (up && !A.validName($("fullName").value)) { fieldErr("fullName", "Please enter your full name (2–100 characters)."); ok = false; }
        if (!A.isEmail(email)) { fieldErr("email", "Please enter a valid email address."); ok = false; }
        if (up) {
            var issue = A.passwordIssue(pass);
            if (issue) { fieldErr("password", issue); ok = false; }
            else if (pass !== $("password2").value) { fieldErr("password2", "The two passwords don't match."); ok = false; }
            if (!termsOk()) ok = false;
        } else if (!pass) {
            fieldErr("password", "Please enter your password."); ok = false;
        }
        if (!ok) return focusFirstError();

        run($("emailSubmit"), function () {
            if (up) {
                var name = $("fullName").value.trim();
                return A.setRemember(true)
                    .then(function () { return A.signUp(name, email, pass); })
                    .then(function (res) {
                        return afterAuth(true).then(function () { return res; });
                    })
                    .then(function (res) {
                        $("verifyText").textContent = res.verificationSent
                            ? "We sent a verification link to " + email + ". Open it to confirm your email address."
                            : "Your account is ready, but we couldn't send the verification email just now. You can resend it from your account page.";
                        setView("viewVerify");
                        flowActive = true;   // stay on the verify screen
                    });
            }
            return A.setRemember($("remember").checked)
                .then(function () { return A.signIn(email, pass); })
                .then(function () { return afterAuth(false); })
                .then(done);
        });
    });

    /* ---------- Verify-email view ---------- */
    $("verifyContinue").addEventListener("click", done);
    $("verifyResend").addEventListener("click", function () {
        var btn = $("verifyResend");
        btn.disabled = true;
        A.resendVerification().then(function () { show("Verification email sent again.", "ok"); })
            .catch(function (e) { show(A.err(e)); })
            .then(function () { setTimeout(function () { btn.disabled = false; }, 30000); });
    });

    /* ---------- Forgot password ---------- */
    $("forgotBtn").addEventListener("click", function () {
        $("forgotEmail").value = $("email").value.trim();
        setView("viewForgot");
    });
    $("forgotBack").addEventListener("click", function () { setView("viewMain"); render(); });

    $("forgotForm").addEventListener("submit", function (e) {
        e.preventDefault();
        if (needSetup()) return;
        clearMsg(); fieldErr("forgotEmail", "");
        var email = $("forgotEmail").value.trim();
        if (!A.isEmail(email)) { fieldErr("forgotEmail", "Please enter a valid email address."); return focusFirstError(); }
        var btn = $("forgotSubmit");
        busy(btn, true);
        A.reset(email).catch(function (er) {
            // "user not found" must look identical to success (no account enumeration)
            if (er && er.code === "auth/user-not-found") return;
            throw er;
        }).then(function () {
            show("If an account exists for " + email + ", a password reset link is on its way. Check your inbox and spam folder.", "ok");
        }).catch(function (er) { show(A.err(er)); })
          .then(function () { busy(btn, false); });
    });

    /* ---------- Mobile OTP ---------- */
    function showOtpStep(on) {
        $("phoneStep1").classList.toggle("hidden", on);
        $("phoneStep2").classList.toggle("hidden", !on);
    }

    function startCooldown(seconds) {
        var btn = $("resendOtp");
        clearInterval(cooldownTimer);
        var left = seconds;
        btn.disabled = true; btn.textContent = "Resend OTP in " + left + "s";
        cooldownTimer = setInterval(function () {
            left--;
            if (left <= 0) { clearInterval(cooldownTimer); btn.disabled = false; btn.textContent = "Resend OTP"; }
            else btn.textContent = "Resend OTP in " + left + "s";
        }, 1000);
    }

    function sendOtp(phone, btn) {
        return run(btn, function () {
            return A.setRemember($("remember").checked || mode === "signup")
                .then(function () { return A.phoneSignIn(phone, "recaptcha-container"); })
                .then(function (c) {
                    flowActive = false;
                    confirmation = c; lastPhone = phone;
                    $("otpTo").textContent = phone;
                    $("otp").value = "";
                    showOtpStep(true);
                    startCooldown(30);
                    show("OTP sent. It may take a few seconds to arrive.", "ok");
                });
        });
    }

    $("phoneStep1").addEventListener("submit", function (e) {
        e.preventDefault();
        if (needSetup()) return;
        clearMsg(); clearFieldErrors();
        var ok = true;
        var phone = A.normalizePhone($("phone").value);
        if (mode === "signup" && !A.validName($("phoneName").value)) { fieldErr("phoneName", "Please enter your full name (2–100 characters)."); ok = false; }
        if (!phone) { fieldErr("phone", "Please enter a valid 10-digit mobile number."); ok = false; }
        if (!termsOk()) ok = false;
        if (!ok) return focusFirstError();
        sendOtp(phone, $("sendOtp"));
    });

    $("resendOtp").addEventListener("click", function () { if (lastPhone) sendOtp(lastPhone, $("resendOtp")); });

    $("phoneStep2").addEventListener("submit", function (e) {
        e.preventDefault();
        clearMsg(); fieldErr("otp", "");
        var code = $("otp").value.trim();
        if (!/^\d{6}$/.test(code)) return fieldErr("otp", "Please enter the 6-digit code.");
        if (!confirmation) return show("Please request a new OTP.");
        run($("verifyOtp"), function () {
            return confirmation.confirm(code).then(function (res) {
                var name = $("phoneName").value.trim();
                var up = mode === "signup";
                var p = Promise.resolve();
                if (up && name && res.user && !res.user.displayName) p = res.user.updateProfile({ displayName: name }).catch(function () {});
                return p.then(function () { return afterAuth(up); });
            }).then(done);
        });
    });

    $("changeNumber").addEventListener("click", function () {
        confirmation = null; clearInterval(cooldownTimer); clearMsg(); showOtpStep(false);
    });

    render();
})();
