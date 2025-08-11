import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Exposes the server on your local network
    host: true, 
    
    // Fixes the "Blocked host" error - add common ngrok domains
    allowedHosts: [
      '.ngrok-free.app', 
      '.ngrok.app', 
      '.ngrok.io',
      '.ngrok-free.dev'
    ],

    // This is the key part for mobile compatibility
    hmr: {
      // For ngrok usage, we need to handle this differently
      port: 443
    },

    // Add headers to allow Telegram widget scripts
    headers: {
      'Cross-Origin-Embedder-Policy': 'cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
})