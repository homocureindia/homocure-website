/* ===========================================================
   HOMOCURE PHARMACEUTICALS — SITE SCRIPT
=========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ---------- 1. LOADER ----------
       Hide the loading screen once the page has fully loaded.
       A fallback timeout guarantees it never gets stuck even if
       the 'load' event is delayed by a slow image. */
    const loader = document.getElementById("loader");

    function hideLoader() {
        if (loader) loader.classList.add("loader-hide");
    }

    if (loader) {
        window.addEventListener("load", hideLoader);
        // Safety net: never let the loader block the site for more than 2.5s
        setTimeout(hideLoader, 2500);
    }

    /* ---------- 2. SCROLL PROGRESS BAR ---------- */
    const progressBar = document.getElementById("progress-bar");

    function updateProgressBar() {
        if (!progressBar) return;
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        progressBar.style.width = percent + "%";
    }

    /* ---------- 3. NAVBAR SCROLL EFFECT ---------- */
    const navbar = document.querySelector(".navbar");

    function updateNavbarState() {
        if (!navbar) return;
        navbar.classList.toggle("nav-scroll", window.scrollY > 40);
    }

    /* ---------- 4. BACK TO TOP BUTTON ---------- */
    const backToTop = document.getElementById("backToTop");

    function updateBackToTop() {
        if (!backToTop) return;
        backToTop.classList.toggle("show", window.scrollY > 400);
    }

    if (backToTop) {
        backToTop.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    /* Combine all scroll-driven updates into one listener */
    window.addEventListener("scroll", () => {
        updateProgressBar();
        updateNavbarState();
        updateBackToTop();
    });

    // Run once on load in case the page opens already scrolled
    updateProgressBar();
    updateNavbarState();
    updateBackToTop();

    /* ---------- 5. MOBILE HAMBURGER MENU ---------- */
    const menuToggle = document.querySelector(".menu-toggle");
    const mobileNav = document.querySelector(".nav-container nav");

    if (menuToggle && mobileNav) {
        menuToggle.addEventListener("click", () => {
            menuToggle.classList.toggle("active");
            mobileNav.classList.toggle("open");
        });

        // Close the menu whenever a link inside it is tapped
        mobileNav.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                menuToggle.classList.remove("active");
                mobileNav.classList.remove("open");
            });
        });
    }

    /* ---------- 6. SCROLL-REVEAL ANIMATIONS ---------- */
    const reveals = document.querySelectorAll(".fade-up, .slide-left, .slide-right");

    if (reveals.length) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("show");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        reveals.forEach((el, index) => {
            el.style.transitionDelay = `${index * 0.08}s`;
            observer.observe(el);
        });
    }

    /* ---------- 7. FAQ ACCORDION ---------- */
    const faqItems = document.querySelectorAll(".faq-item");

    faqItems.forEach((item) => {
        const question = item.querySelector(".faq-question");
        const answer = item.querySelector(".faq-answer");
        if (!question || !answer) return;

        question.addEventListener("click", () => {
            const isOpen = item.classList.contains("open");

            // Close any other open item in the same list for a clean accordion feel
            const list = item.closest(".faq-list");
            if (list) {
                list.querySelectorAll(".faq-item.open").forEach((openItem) => {
                    if (openItem !== item) {
                        openItem.classList.remove("open");
                        openItem.querySelector(".faq-answer").style.maxHeight = null;
                    }
                });
            }

            if (isOpen) {
                item.classList.remove("open");
                answer.style.maxHeight = null;
            } else {
                item.classList.add("open");
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    /* ---------- 8. ANIMATED STAT COUNTERS ----------
       Counts up from 0 to data-target once the element scrolls
       into view. Runs only once per element. */
    const counters = document.querySelectorAll(".stat-number[data-target]");

    if (counters.length) {
        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                const el = entry.target;
                const target = parseFloat(el.dataset.target);
                const suffix = el.dataset.suffix || "";
                const duration = 1400;
                const startTime = performance.now();

                function tick(now) {
                    const progress = Math.min((now - startTime) / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3); // ease-out
                    const value = Math.round(target * eased);
                    el.textContent = value + suffix;

                    if (progress < 1) {
                        requestAnimationFrame(tick);
                    } else {
                        el.textContent = target + suffix;
                    }
                }

                requestAnimationFrame(tick);
                counterObserver.unobserve(el);
            });
        }, { threshold: 0.4 });

        counters.forEach((el) => counterObserver.observe(el));
    }

});
