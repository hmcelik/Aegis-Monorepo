import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.DEV_SERVER_PORT || 8080;

// Serve static files from examples directory
app.use(express.static(path.join(__dirname, '../examples')));

// Add CORS headers for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Telegram-Init-Data');
    next();
});

// Serve the external website example as default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../examples/external-website.html'));
});

// Serve other examples
app.get('/miniapp', (req, res) => {
    res.sendFile(path.join(__dirname, '../examples/telegram-miniapp.html'));
});

app.get('/external', (req, res) => {
    res.sendFile(path.join(__dirname, '../examples/external-website.html'));
});

app.listen(PORT, () => {
    console.log(`📱 Development server running on http://localhost:${PORT}`);
    console.log(`🌐 External website demo: http://localhost:${PORT}/external`);
    console.log(`📲 Mini app demo: http://localhost:${PORT}/miniapp`);
});
