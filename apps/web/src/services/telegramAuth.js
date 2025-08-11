// Telegram Login Widget Implementation
// This file handles the Telegram Login Widget integration for external websites

class TelegramLoginWidget {
    constructor(options = {}) {
        this.botUsername = options.botUsername || 'your_bot_username';
        this.requestAccess = options.requestAccess || 'write';
        this.size = options.size || 'large';
        this.cornerRadius = options.cornerRadius || 20;
        this.onAuth = options.onAuth || this.defaultOnAuth;
        this.widgetContainer = null;
    }

    // Initialize the widget
    init(containerId) {
        this.widgetContainer = document.getElementById(containerId);
        if (!this.widgetContainer) {
            console.error('Container not found:', containerId);
            return;
        }

        this.renderWidget();
    }

    // Render the Telegram Login Widget
    renderWidget() {
        // Create widget HTML
        const widgetHtml = `
            <div class="telegram-login-widget-container">
                <script async src="https://telegram.org/js/telegram-widget.js?22" 
                        data-telegram-login="${this.botUsername}" 
                        data-size="${this.size}" 
                        data-corner-radius="${this.cornerRadius}"
                        data-request-access="${this.requestAccess}" 
                        data-onauth="onTelegramAuth(user)" 
                        data-auth-url="${window.location.origin}/auth/telegram">
                </script>
            </div>
        `;

        this.widgetContainer.innerHTML = widgetHtml;

        // Set up global callback
        window.onTelegramAuth = this.onAuth.bind(this);
    }

    // Default authentication handler
    defaultOnAuth(user) {
        console.log('Telegram authentication successful:', user);
        
        // Store user data
        localStorage.setItem('telegram_user', JSON.stringify(user));
        
        // Trigger custom event
        const event = new CustomEvent('telegramAuth', { detail: user });
        window.dispatchEvent(event);
    }

    // Manual login button (fallback)
    renderManualButton() {
        const buttonHtml = `
            <button class="telegram-login-manual" onclick="this.openTelegramLogin()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.52.36-.99.54-1.42.53-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.74 4.02-1.76 6.7-2.92 8.03-3.49 3.82-1.58 4.62-1.85 5.14-1.86.11 0 .37.03.54.17.14.11.18.26.2.37.02.06.05.22.03.34z"/>
                </svg>
                Login with Telegram
            </button>
        `;

        this.widgetContainer.innerHTML = buttonHtml;
    }

    // Open Telegram login in new window
    openTelegramLogin() {
        const authUrl = `https://oauth.telegram.org/auth?bot_id=${this.botId}&origin=${encodeURIComponent(window.location.origin)}&request_access=${this.requestAccess}`;
        
        const popup = window.open(
            authUrl,
            'telegram-login',
            'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        // Listen for popup close
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                this.checkAuthStatus();
            }
        }, 1000);
    }

    // Check authentication status after popup closes
    checkAuthStatus() {
        const userData = localStorage.getItem('telegram_user');
        if (userData) {
            const user = JSON.parse(userData);
            this.onAuth(user);
        }
    }

    // Validate Telegram authentication data
    static validateAuthData() {
        // Implementation of Telegram auth data validation
        // This should be done on the backend for security
        console.warn('Hash validation skipped - should be done server-side');
        return true; // Accept all data for now (validation should be server-side)
    }
}

// Export for ES6 modules
export default TelegramLoginWidget;
