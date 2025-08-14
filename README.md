# FPL Live Leaderboard

A live leaderboard for Fantasy Premier League classic leagues with monthly scoring tracking.

## Features

- Live gameweek scores
- Live monthly totals (for money leagues)
- Manual refresh + automatic periodic refresh
- Timestamp showing last update
- Classic league standings
- Pre-season support (shows league members before season starts)

## Setup

### Option 1: Quick Start (Recommended)
1. Clone this repository
2. Run the startup script: `./start-server.sh`
3. Open your browser to: http://localhost:8000
4. Enter your league ID when prompted

### Option 2: Manual Server
1. Clone this repository
2. Open terminal in the project directory
3. Run: `python3 -m http.server 8000`
4. Open your browser to: http://localhost:8000
5. Enter your league ID when prompted

### Option 3: Alternative Servers
If you don't have Python, you can use:
- **Node.js**: `npx http-server`
- **PHP**: `php -S localhost:8000`
- **Ruby**: `ruby -run -e httpd . -p 8000`

## How to get your League ID

1. Log in to https://fantasy.premierleague.com/
2. Go to "Leagues & Cups" tab
3. Click on your league
4. Copy the league ID from the URL

## API Endpoints Used

- `leagues-classic/{league_id}/standings/` - League standings
- `entry/{manager_id}/` - Manager summary
- `entry/{manager_id}/history/` - Manager history
- `event/{event_id}/live/` - Live gameweek data

## CORS Solution

This app runs on a local server to avoid CORS issues with the FPL API. The FPL API blocks requests from `file://` origins, so we need to serve the files via HTTP.

## Version History

- v1.0.0 - Initial setup with basic leaderboard
- v1.1.0 - Added pre-season support and CORS fix
- v1.2.0 - Added live refresh functionality
- v1.3.0 - Added timestamp and manual refresh

## Local Development

### Starting the Server
```bash
# Quick start
./start-server.sh

# Or manually
python3 -m http.server 8000
```

### Stopping the Server
Press `Ctrl+C` in the terminal where the server is running.

## Future Enhancements

- Server-side implementation to avoid CORS
- Real-time updates during live gameweeks
- Historical performance graphs
- Transfer tracking
- Push notifications for score updates 