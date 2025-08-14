# FPL Live Leaderboard

A live leaderboard for Fantasy Premier League classic leagues with monthly scoring tracking.

## Features

- Live gameweek scores
- Live monthly totals (for money leagues)
- Manual refresh + automatic periodic refresh
- Timestamp showing last update
- Classic league standings

## Setup

1. Clone this repository
2. Open `index.html` in your browser
3. Enter your league ID when prompted

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

## Version History

- v1.0.0 - Initial setup with basic leaderboard
- v1.1.0 - Added monthly scoring tracking
- v1.2.0 - Added live refresh functionality
- v1.3.0 - Added timestamp and manual refresh

## Local Development

This app runs locally to avoid CORS issues with the FPL API. Simply open `index.html` in your browser.

## Future Enhancements

- Server-side implementation to avoid CORS
- Real-time updates during live gameweeks
- Historical performance graphs
- Transfer tracking 