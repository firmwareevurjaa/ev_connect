/**
 * script.js — EV Connect 2026
 * Single source of truth for all frontend JS.
 * Loaded via <script src="script.js" defer> in index.html
 */

(function () {
    'use strict';

    /* ============================================================
       1. NAVBAR — scroll shrink + hamburger + mobile nav
    ============================================================ */
    const navbar    = document.getElementById('navbar');
    const menuBtn   = document.getElementById('menuBtn');
    const mobileNav = document.getElementById('mobileNav');

    /* Scroll: add/remove .scrolled class */
    window.addEventListener('scroll', function () {
        navbar.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    /* Hamburger toggle */
    if (menuBtn && mobileNav) {
        menuBtn.addEventListener('click', function () {
            const isOpen = mobileNav.classList.toggle('active');
            menuBtn.classList.toggle('open', isOpen);
            menuBtn.setAttribute('aria-expanded', String(isOpen));
        });

        /* Close when a nav link is tapped */
        mobileNav.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeMobileNav);
        });

        /* Close on outside click */
        document.addEventListener('click', function (e) {
            if (navbar && !navbar.contains(e.target)) {
                closeMobileNav();
            }
        });
    }

    function closeMobileNav() {
        if (!mobileNav || !menuBtn) return;
        mobileNav.classList.remove('active');
        menuBtn.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
    }

    /* ============================================================
       2. SMOOTH SCROLL — offset for fixed navbar
    ============================================================ */
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            closeMobileNav();

            const offset = parseInt(
                getComputedStyle(document.documentElement)
                    .getPropertyValue('--navbar-height') || '80',
                10
            );

            const top = target.getBoundingClientRect().top + window.pageYOffset - offset - 12;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });

    /* ============================================================
       3. MOBILE PORTRAIT BG VIDEO
       <source> is already in HTML with preload="metadata".
       CSS hides the video on desktop (display:none).
       JS just calls play() on mobile — pause() on desktop
       to avoid wasting bandwidth.
    ============================================================ */
    const mobileBgVideo = document.getElementById('mobileBgVideo');
    const mobileQuery   = window.matchMedia('(max-width: 768px)');

    function syncMobileVideo() {
        if (!mobileBgVideo) return;
        if (mobileQuery.matches) {
            mobileBgVideo.play().catch(function () {
                /* Autoplay policy blocked — CSS gradient overlay still shows */
            });
        } else {
            mobileBgVideo.pause();
        }
    }

    /* Run immediately and on viewport change (e.g. DevTools resize) */
    syncMobileVideo();
    mobileQuery.addEventListener('change', syncMobileVideo);

    /* ============================================================
       4. SCROLL REVEAL
    ============================================================ */
    const reveals = document.querySelectorAll('.reveal');

    function handleReveal() {
        reveals.forEach(function (el) {
            if (el.getBoundingClientRect().top < window.innerHeight - 80) {
                el.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', handleReveal, { passive: true });
    handleReveal(); /* trigger on load for above-fold elements */

    /* ============================================================
       5. BROCHURE BUTTON — gated behind registration
    ============================================================ */
    const brochureBtn = document.getElementById('brochureBtn');

    if (brochureBtn) {
        brochureBtn.addEventListener('click', function (e) {
            if (!localStorage.getItem('evconnect_registered')) {
                e.preventDefault();
                showNotification('Please complete registration first to download the brochure.', 'error');
                document.getElementById('register')
                    ?.scrollIntoView({ behavior: 'smooth' });
                return;
            }
            window.location.href = 'assets/EV-Connect-2026.pdf';
        });
    }

    /* ============================================================
       6. REGISTRATION FORM
    ============================================================ */
    const registrationForm = document.getElementById('registrationForm');

    if (registrationForm) {
        registrationForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();

            const name    = document.getElementById('name')?.value.trim();
            const email   = document.getElementById('email')?.value.trim();
            const phone   = document.getElementById('phone')?.value.trim();
            const type    = document.getElementById('type')?.value;
            const message = document.getElementById('message')?.value.trim();

            /* ── Client-side validation ── */
            if (!name || !email || !phone || !type) {
                showNotification('Please fill in all required fields.', 'error');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }

            if (!/^[0-9]{10}$/.test(phone)) {
                showNotification('Please enter a valid 10-digit phone number.', 'error');
                return;
            }

            /* ── Disable submit while sending ── */
            const submitBtn = registrationForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled    = true;
                submitBtn.textContent = 'Submitting…';
            }

            try {
                const response = await fetch('/api/register', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ name, email, phone, type, message })
                });

                const result = await response.json().catch(() => ({}));

                if (response.status === 201) {
                    /* Success */
                    localStorage.setItem('evconnect_registered', 'true');
                    showNotification(
                        '✅ Registration confirmed! Code: ' + result.code +
                        ' — Check your email for details.',
                        'success'
                    );
                    registrationForm.reset();

                } else if (response.status === 409) {
                    /* Duplicate email */
                    showNotification(
                        'This email is already registered. Your code: ' + result.code,
                        'info'
                    );
                    localStorage.setItem('evconnect_registered', 'true');

                } else {
                    showNotification(result.error || 'Registration failed. Please try again.', 'error');
                }

            } catch (err) {
                console.error('[EV Connect] Registration error:', err);
                showNotification('Network error. Please check your connection and try again.', 'error');

            } finally {
                if (submitBtn) {
                    submitBtn.disabled    = false;
                    submitBtn.textContent = 'Complete Registration';
                }
            }
        });
    }

    /* ============================================================
       7. TOAST NOTIFICATION SYSTEM
       Types: 'success' | 'error' | 'info'
    ============================================================ */

    /* Inject notification styles once */
    (function injectNotificationStyles() {
        if (document.getElementById('evc-notif-style')) return;
        const style = document.createElement('style');
        style.id = 'evc-notif-style';
        style.textContent = `
            .evc-notification {
                position: fixed;
                top: 90px;
                right: 20px;
                max-width: 380px;
                padding: 16px 22px;
                border-radius: 14px;
                color: #fff;
                font-family: 'Poppins', sans-serif;
                font-size: 0.92rem;
                font-weight: 500;
                line-height: 1.5;
                z-index: 99999;
                box-shadow: 0 8px 40px rgba(0,0,0,0.35);
                backdrop-filter: blur(14px);
                border: 1px solid rgba(255,255,255,0.12);
                animation: evcSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
                cursor: pointer;
            }
            .evc-notification.success {
                background: linear-gradient(135deg, rgba(0,200,120,0.85), rgba(0,180,100,0.85));
            }
            .evc-notification.error {
                background: linear-gradient(135deg, rgba(220,50,50,0.88), rgba(180,30,30,0.88));
            }
            .evc-notification.info {
                background: linear-gradient(135deg, rgba(0,170,255,0.85), rgba(0,130,220,0.85));
            }
            .evc-notification.evc-hiding {
                animation: evcSlideOut 0.3s ease forwards;
            }
            @keyframes evcSlideIn {
                from { transform: translateX(calc(100% + 24px)); opacity: 0; }
                to   { transform: translateX(0);                 opacity: 1; }
            }
            @keyframes evcSlideOut {
                from { transform: translateX(0);                 opacity: 1; }
                to   { transform: translateX(calc(100% + 24px)); opacity: 0; }
            }
            @media (max-width: 480px) {
                .evc-notification {
                    right: 12px;
                    left: 12px;
                    max-width: unset;
                    top: 76px;
                }
            }
        `;
        document.head.appendChild(style);
    })();

    function showNotification(message, type) {
        type = type || 'info';

        /* Remove any existing notification */
        document.querySelectorAll('.evc-notification').forEach(function (n) { n.remove(); });

        const el = document.createElement('div');
        el.className   = 'evc-notification ' + type;
        el.textContent = message;
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');

        /* Click to dismiss */
        el.addEventListener('click', function () { dismissNotification(el); });

        document.body.appendChild(el);

        /* Auto-dismiss after 6 seconds */
        setTimeout(function () { dismissNotification(el); }, 6000);
    }

    function dismissNotification(el) {
        if (!el || !el.parentNode) return;
        el.classList.add('evc-hiding');
        setTimeout(function () { el.remove(); }, 320);
    }

})();