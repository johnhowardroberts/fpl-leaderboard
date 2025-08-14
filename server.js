const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 8000;

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// Proxy endpoint for FPL API
app.get('/api/*', async (req, res) => {
    try {
        const fplUrl = `https://fantasy.premierleague.com/api${req.url.replace('/api', '')}`;
        console.log(`Proxying request to: ${fplUrl}`);
        
        const response = await fetch(fplUrl);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch data from FPL API' });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log('🚀 FPL Leaderboard Server running on http://localhost:8000');
    console.log('📱 Open your browser to: http://localhost:8000');
    console.log('🛑 Press Ctrl+C to stop the server');
}); 