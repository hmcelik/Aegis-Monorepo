import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { API_BASE_URL, TELEGRAM_BOT_USERNAME } from '../../services/api';

// NOTE: `botUsername` must be WITHOUT '@'. Display '@' to users if you want.
const TelegramLoginWidget = ({ onAuth, botUsername = TELEGRAM_BOT_USERNAME }) => {
  const elementRef = useRef(null);
  const [loadingState, setLoadingState] = useState('initializing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!botUsername) {
      console.warn('No bot username provided. Falling back to TELEGRAM_BOT_USERNAME from config:', TELEGRAM_BOT_USERNAME);
    }

    setLoadingState('loading');
    setErrorMessage('');

    // unique callback to avoid collisions
    const callbackName = `onTelegramAuth_${Date.now()}`;
    const element = elementRef.current;

    // global callback the widget will call
    window[callbackName] = (telegramUser) => {
      console.log('🔐 Telegram login widget callback received:', telegramUser);
      toast.success('Telegram callback received! Authenticating...', { duration: 2000 });

      // basic validation from Telegram docs
      if (!telegramUser.id || !telegramUser.first_name || !telegramUser.auth_date || !telegramUser.hash) {
        toast.error('Invalid Telegram data received');
        console.error('❌ Invalid Telegram data:', telegramUser);
        return;
      }

      setLoadingState('authenticated');
      onAuth?.(telegramUser);
    };

    // build <script> tag
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', String(botUsername).replace(/^@/, '')); // attr must be without '@'
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-onauth', callbackName);
    script.setAttribute('data-request-access', 'write');

    script.onload = () => {
      console.log('✅ Telegram widget script loaded successfully');
      setLoadingState('loaded');

      setTimeout(() => {
        const iframe = element?.querySelector('iframe');
        if (iframe) {
          console.log('✅ Telegram widget iframe created');
          setLoadingState('ready');
        } else {
          console.warn('⚠️ Telegram widget iframe not found - possible domain issue');
          setLoadingState('domain_error');
          setErrorMessage('Widget not loading - domain may not be configured with @BotFather');
        }
      }, 1000);
    };

    script.onerror = (error) => {
      console.error('❌ Failed to load Telegram widget script:', error);
      setLoadingState('script_error');
      setErrorMessage('Failed to load Telegram widget script');
    };

    if (element) {
      element.innerHTML = '';
      element.appendChild(script);
    }

    return () => {
      if (element) element.innerHTML = '';
      if (window[callbackName]) delete window[callbackName];
    };
  }, [onAuth, botUsername]);

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const renderLoadingState = () => {
    switch (loadingState) {
      case 'initializing': return <div>🔄 Initializing Telegram widget...</div>;
      case 'loading':      return <div>⏳ Loading Telegram widget script...</div>;
      case 'loaded':       return <div>🔄 Setting up Telegram widget...</div>;
      case 'ready':        return <div>✅ Telegram Login Widget ready! Click to login.</div>;
      case 'authenticated':return <div>🎉 Authentication successful!</div>;
      case 'script_error': return (
        <div style={{ color: 'red' }}>
          ❌ Failed to load Telegram widget script
          <br />
          <small>Check your internet connection and try refreshing the page</small>
        </div>
      );
      case 'domain_error': return (
        <div style={{ color: 'orange' }}>
          ⚠️ Widget loaded but not showing - Domain configuration issue
          <br />
          <small>Configure domain with @BotFather (see instructions below)</small>
        </div>
      );
      case 'error':        return <div style={{ color: 'red' }}>❌ {errorMessage}</div>;
      default:             return <div>🔄 Initializing...</div>;
    }
  };

  return (
    <div>
      <p>Click the button below to login with Telegram:</p>
      <div style={{ marginBottom: '10px', padding: '10px', background: '#e3f2fd', borderRadius: '4px', fontSize: '0.9rem' }}>
        <strong>🤖 Bot:</strong> @{String(botUsername).replace(/^@/, '')}<br/>
        <strong>🌐 Domain:</strong> {host}<br/>
        <strong>🔗 Protocol:</strong> {protocol}<br/>
        <strong>📡 API:</strong> {API_BASE_URL}/auth/login-widget<br/>
        <strong>📊 Status:</strong> {renderLoadingState()}
      </div>

      <div
        ref={elementRef}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
          border:
            loadingState === 'ready' ? '2px solid #4CAF50' :
            loadingState === 'domain_error' ? '2px solid #FF9800' :
            (loadingState === 'script_error' || loadingState === 'error') ? '2px solid #f44336' :
            '2px solid #0088cc',
          borderRadius: '8px',
          backgroundColor: '#f8f9fa',
          minHeight: '60px'
        }}
      />

      <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#666' }}>
        <strong>🔧 Bot Configuration Required:</strong><br/>
        Your bot needs domain authorization with @BotFather:<br/>
        <div style={{ background: '#f8f9fa', padding: '8px', margin: '8px 0', borderRadius: '4px', fontFamily: 'monospace' }}>
          1. Send <code>/setdomain</code> to @BotFather<br/>
          2. Select: <code>@{String(botUsername).replace(/^@/, '')}</code><br/>
          3. Enter domain: <code style={{ color: '#0088cc', fontWeight: 'bold' }}>{host}</code>
        </div>

        <strong>Current Environment:</strong><br/>
        • Domain: <code>{host}</code><br/>
        • Protocol: <code>{protocol}</code><br/>
        • Full URL: <code>{origin}</code><br/>

        <div style={{ marginTop: '8px', padding: '8px', background: '#fff3cd', borderRadius: '4px' }}>
          <strong>⚠️ Common Issues:</strong><br/>
          • Script fails to load: Check connection<br/>
          • Button doesn’t appear: Domain not configured with @BotFather<br/>
          • “Bot domain invalid”: Use <code>/setdomain</code> in @BotFather<br/>
          • Widget disappears: Domain configuration removed or bot username changed
        </div>

        {(loadingState === 'domain_error' || loadingState === 'script_error') && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#ffebee', borderRadius: '4px', border: '1px solid #f44336' }}>
            <strong>🚨 Debug Information:</strong><br/>
            • Loading State: <code>{loadingState}</code><br/>
            • Error: <code>{errorMessage}</code><br/>
            • Bot Username: <code>@{String(botUsername).replace(/^@/, '')}</code><br/>
            • Current Domain: <code>{host}</code><br/>
            • Widget Container: {elementRef.current ? 'Present' : 'Missing'}<br/>
            • Iframe Elements: <code>{elementRef.current?.querySelectorAll('iframe').length || 0}</code>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelegramLoginWidget;
