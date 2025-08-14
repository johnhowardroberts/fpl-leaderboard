#!/bin/bash

echo "🚀 Starting FPL Leaderboard Server..."
echo "📱 Open your browser to: http://localhost:8000"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Check if Node.js is available
if command -v node &> /dev/null; then
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        npm install
    fi
    
    # Start the server
    npm start
else
    echo "❌ Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js to run this server"
    echo "Download from: https://nodejs.org/"
    exit 1
fi 