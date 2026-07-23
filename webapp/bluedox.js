document.addEventListener('DOMContentLoaded', () => {
    // 1. Device Detection & Body Classes
    detectDevice();

    // 2. Sidebar Navigation Toggle for Mobile
    setupMobileSidebar();

    // 3. Search Filter functionality
    setupSearchFilter();

    // 4. Android Ripple Effect Simulation
    setupRippleEffect();

    // 5. Active Navigation & Alerts mock interactions
    setupInteractiveMocks();
});

/**
 * Detects whether the user is on an iOS or Android device and applies classes to body.
 */
function detectDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const body = document.body;

    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        body.classList.add('device-ios');
        body.classList.add('device-mobile');
        console.log('[BlueDox] iOS Device Detected');
    } else if (/android/i.test(userAgent)) {
        body.classList.add('device-android');
        body.classList.add('device-mobile');
        console.log('[BlueDox] Android Device Detected');
    } else {
        body.classList.add('device-desktop');
        console.log('[BlueDox] Desktop Browser Detected');
    }
}

/**
 * Handles sidebar drawer toggles on mobile viewport.
 */
function setupMobileSidebar() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('drawer-backdrop');

    if (!menuToggle || !sidebar || !backdrop) return;

    function openSidebar() {
        sidebar.classList.add('open');
        backdrop.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        backdrop.style.display = 'none';
        document.body.style.overflow = '';
    }

    menuToggle.addEventListener('click', openSidebar);
    backdrop.addEventListener('click', closeSidebar);

    // Also allow closing by clicking on a link inside the menu on mobile
    const sidebarLinks = sidebar.querySelectorAll('.nav-item-link');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
}

/**
 * Allows the user to filter the widgets on screen using the main banner input.
 */
function setupSearchFilter() {
    const searchInput = document.getElementById('banner-search-input');
    const searchBtn = document.getElementById('banner-search-btn');
    const widgetCards = document.querySelectorAll('.widget-card');

    if (!searchInput) return;

    function performSearch() {
        const query = searchInput.value.toLowerCase().trim();

        widgetCards.forEach(card => {
            const title = card.querySelector('.widget-title').textContent.toLowerCase();
            const desc = card.querySelector('.widget-description').textContent.toLowerCase();

            if (title.includes(query) || desc.includes(query)) {
                card.style.display = 'flex';
                card.style.animation = 'fadeIn 0.4s ease forwards';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Trigger on enter key
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }
}

/**
 * Simulates Android Material design ripple effect on elements.
 */
function setupRippleEffect() {
    const rippleElements = document.querySelectorAll('.widget-card, .banner-search-btn, .quick-action-item, .nav-item-link, .bottom-nav-item');

    rippleElements.forEach(element => {
        element.addEventListener('click', function(e) {
            // Ripple only is active on Android or simulated mobile triggers
            if (!document.body.classList.contains('device-android') && !document.body.classList.contains('device-mobile')) {
                return;
            }

            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const ripple = document.createElement('span');
            ripple.classList.add('ripple-effect');
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;

            this.appendChild(ripple);

            ripple.addEventListener('animationend', () => {
                ripple.remove();
            });
        });
    });
}

/**
 * Sets up basic interactivity (e.g. notifications badge, profiles, alert triggers)
 */
function setupInteractiveMocks() {
    // Nav Items Active switching
    const navLinks = document.querySelectorAll('.nav-item-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Widgets clicks
    const widgetCards = document.querySelectorAll('.widget-card');
    widgetCards.forEach(card => {
        card.addEventListener('click', () => {
            const title = card.querySelector('.widget-title').textContent;
            showPopup(`Módulo Selecionado: ${title}`, `Você clicou no widget para gerenciar: ${title}.`);
        });
    });

    // Profile Click
    const profile = document.querySelector('.user-profile');
    if (profile) {
        profile.addEventListener('click', () => {
            showPopup('Perfil do Usuário', 'Visualizando perfil de Michelle White / David. Permissões de Administrador.');
        });
    }

    // Bell/Notification click
    const notifyBtn = document.querySelector('.header-action-btn:first-child');
    if (notifyBtn) {
        notifyBtn.addEventListener('click', () => {
            showPopup('Notificações', 'Você tem 15 novos elementos de UI e 8 páginas prontas para revisão.');
        });
    }
}

/**
 * Basic popup utility instead of boring browser alert.
 */
function showPopup(title, text) {
    // Clean up existing popups
    const existing = document.querySelector('.bluedox-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'bluedox-popup';
    popup.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 24px;
        background-color: var(--dark-navy);
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        z-index: 1000;
        max-width: 320px;
        font-size: 14px;
        animation: slideUp 0.3s ease forwards;
        border-left: 4px solid var(--primary-blue);
    `;

    popup.innerHTML = `
        <strong style="display:block;margin-bottom:4px;color:#90A4AE;">${title}</strong>
        <span>${text}</span>
    `;

    document.body.appendChild(popup);

    setTimeout(() => {
        popup.style.animation = 'slideDown 0.3s ease forwards';
        popup.addEventListener('animationend', () => popup.remove());
    }, 4000);
}

// Add CSS keyframes dynamically for animations
const styleSheet = document.createElement('style');
styleSheet.innerHTML = `
@keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
@keyframes slideDown {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(20px); opacity: 0; }
}
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
`;
document.head.appendChild(styleSheet);
