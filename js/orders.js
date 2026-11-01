/* ===========================================================
   ORDER FLOW (products page)
   Login required → verified phone required → order saved to Firestore
   Controlled by window.HOMOCURE_ORDERS_OPEN (js/firebase-config.js)
=========================================================== */
(function () {
    "use strict";
    if (!window.HOMOCURE_ORDERS_OPEN) return;

    var A = window.HomocureAuth;
    if (!A) return;

    var bg, confirmation = null, product = "", productId = "";

    function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

    function build() {
        bg = document.createElement("div");
        bg.className = "hc-modal-bg";
        bg.innerHTML = '<div class="hc-modal" role="dialog" aria-modal="true"><button class="hc-modal-x" aria-label="Close">✕</button><div id="ordBody"></div><div id="ord-recaptcha"></div></div>';
        document.body.appendChild(bg);
        bg.addEventListener("click", function (e) { if (e.target === bg) close(); });
        bg.querySelector(".hc-modal-x").addEventListener("click", close);
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    }
    function open() { bg.classList.add("open"); }
    function close() { bg.classList.remove("open"); }
    function body() { return document.getElementById("ordBody"); }

    function note(text, type) {
        var m = body().querySelector(".auth-msg");
        if (!m) return;
        m.textContent = text; m.className = "auth-msg show " + (type || "error");
    }

    /* ---------- Step: verify phone ---------- */
    function stepPhone() {
        body().innerHTML =
            '<h3>Verify your mobile number</h3>' +
            '<p class="auth-sub">A verified mobile number is required to place an order. We will confirm your order on this number.</p>' +
            '<form id="ordP1" novalidate><div class="hc-field"><label>Mobile Number</label>' +
            '<div class="hc-phone"><span>+91</span><input id="ordPhone" type="tel" inputmode="numeric" placeholder="10-digit mobile number" maxlength="13"></div></div>' +
            '<button class="hc-btn" type="submit" id="ordSend">Send OTP</button></form>' +
            '<form id="ordP2" class="hidden" novalidate><div class="hc-field"><label>Enter OTP</label>' +
            '<input id="ordOtp" class="hc-otp" type="text" inputmode="numeric" maxlength="6" placeholder="••••••"></div>' +
            '<button class="hc-btn" type="submit" id="ordVerify">Verify &amp; Continue</button></form>' +
            '<div class="auth-msg"></div>';

        document.getElementById("ordP1").addEventListener("submit", function (e) {
            e.preventDefault();
            var phone = A.normalizePhone(document.getElementById("ordPhone").value);
            if (!phone) return note("Please enter a valid 10-digit mobile number.");
            var b = document.getElementById("ordSend"); b.disabled = true;
            A.linkPhone(phone, "ord-recaptcha").then(function (c) {
                confirmation = c;
                document.getElementById("ordP1").classList.add("hidden");
                document.getElementById("ordP2").classList.remove("hidden");
                note("OTP sent to " + phone + ".", "ok");
            }).catch(function (er) { note(A.err(er)); }).then(function () { b.disabled = false; });
        });

        document.getElementById("ordP2").addEventListener("submit", function (e) {
            e.preventDefault();
            var code = document.getElementById("ordOtp").value.trim();
            if (!/^\d{6}$/.test(code)) return note("Please enter the 6-digit code.");
            var b = document.getElementById("ordVerify"); b.disabled = true;
            confirmation.confirm(code)
                .then(function () { return A.auth.currentUser.getIdToken(true); })
                .then(function () { return A.auth.currentUser.reload(); })
                .then(function () { A.user = A.auth.currentUser; stepForm(); })
                .catch(function (er) { note(A.err(er)); b.disabled = false; });
        });
    }

    /* ---------- Step: order form ---------- */
    function stepForm() {
        var u = A.user;
        body().innerHTML =
            '<h3>Order: ' + esc(product) + '</h3>' +
            '<p class="auth-sub">Please fill in the details — our team will confirm on your verified number.</p>' +
            '<div class="hc-verified">✓ Verified mobile: ' + esc(u.phoneNumber) + '</div>' +
            '<form id="ordForm" novalidate>' +
            '<div class="hc-two"><div class="hc-field"><label>Quantity</label><input id="oQty" type="number" min="1" max="100" value="1"></div>' +
            '<div class="hc-field"><label>Potency / Pack size</label><input id="oPack" type="text" maxlength="60" placeholder="e.g. 30C, 30 ml"></div></div>' +
            '<div class="hc-field"><label>Delivery Address</label><textarea id="oAddr" maxlength="300" placeholder="House no., street, area"></textarea></div>' +
            '<div class="hc-two"><div class="hc-field"><label>City</label><input id="oCity" type="text" maxlength="60"></div>' +
            '<div class="hc-field"><label>Pincode</label><input id="oPin" type="text" inputmode="numeric" maxlength="6"></div></div>' +
            '<div class="hc-field"><label>Notes (optional)</label><input id="oNote" type="text" maxlength="200"></div>' +
            '<button class="hc-btn" type="submit" id="oSubmit">Place Order Request</button></form>' +
            '<div class="auth-msg"></div>';

        document.getElementById("ordForm").addEventListener("submit", function (e) {
            e.preventDefault();
            var qty = parseInt(document.getElementById("oQty").value, 10);
            var addr = document.getElementById("oAddr").value.trim();
            var city = document.getElementById("oCity").value.trim();
            var pin = document.getElementById("oPin").value.trim();
            if (!(qty >= 1 && qty <= 100)) return note("Quantity must be between 1 and 100.");
            if (addr.length < 8) return note("Please enter the full delivery address.");
            if (!city) return note("Please enter your city.");
            if (!/^\d{6}$/.test(pin)) return note("Please enter a valid 6-digit pincode.");

            var b = document.getElementById("oSubmit"); b.disabled = true; b.textContent = "Placing…";
            A.db.collection("orders").add({
                uid: u.uid,
                name: (u.displayName || "").slice(0, 100),
                email: u.email || "",
                phone: u.phoneNumber,
                productId: productId,
                product: product,
                qty: qty,
                pack: document.getElementById("oPack").value.trim(),
                address: addr, city: city, pincode: pin,
                notes: document.getElementById("oNote").value.trim(),
                status: "new",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(function () {
                body().innerHTML = '<div style="text-align:center;padding:10px 0">' +
                    '<div style="font-size:54px">✅</div><h3>Order request received!</h3>' +
                    '<p class="auth-sub">Thank you. Our team will contact you shortly on ' + esc(u.phoneNumber) + '.</p>' +
                    '<a class="hc-btn" style="display:block;text-decoration:none;text-align:center" href="account.html#orders">View My Orders</a></div>';
            }).catch(function (err) {
                // Ordering is controlled by the database (config/public.ordersOpen), not by this page.
                if (err && err.code === "permission-denied") {
                    note("Ordering isn't open yet, or the order couldn't be accepted. Please try again later.");
                } else {
                    note("We couldn't save your order. Please try again.");
                }
                b.disabled = false; b.textContent = "Place Order Request";
            });
        });
    }

    /* ---------- Entry ---------- */
    function start(name, id) {
        product = name; productId = id;
        if (!A.user) { location.href = "login.html?next=products.html"; return; }
        open();
        if (A.hasPhone()) stepForm(); else stepPhone();
    }

    document.addEventListener("DOMContentLoaded", function () {
        build();
        document.querySelectorAll("[data-order]").forEach(function (btn) {
            btn.textContent = "Order Now";
            btn.addEventListener("click", function (e) { e.preventDefault(); start(btn.dataset.order, btn.dataset.productId); });
        });
    });
})();
