class FPLLeaderboard {
    constructor() {
        this.leagueId = null;
        this.currentView = 'monthly'; // Default to monthly view
        this.currentMonth = null;
        this.availableMonths = [];
        this.autoRefreshInterval = null;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.gameweekDates = new Map(); // Cache for gameweek to date mapping
        
        this.initializeElements();
        this.bindEvents();
        this.loadStoredLeagueId();
    }

    initializeElements() {
        this.elements = {
            setupSection: document.getElementById('setupSection'),
            leaderboardSection: document.getElementById('leaderboardSection'),
            leagueIdInput: document.getElementById('leagueIdInput'),
            loadLeagueBtn: document.getElementById('loadLeagueBtn'),
            leagueName: document.getElementById('leagueName'),
            leagueDetails: document.getElementById('leagueDetails'),
            leaderboardTable: document.getElementById('leaderboardTable'),
            leaderboardBody: document.getElementById('leaderboardBody'),
            scoreHeader: document.getElementById('scoreHeader'),
            refreshBtn: document.getElementById('refreshBtn'),
            lastUpdated: document.getElementById('lastUpdated'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage'),
            viewButtons: document.querySelectorAll('.view-btn'),
            monthControls: document.getElementById('monthControls'),
            monthFilter: document.getElementById('monthFilter')
        };
    }

    bindEvents() {
        this.elements.loadLeagueBtn.addEventListener('click', () => this.loadLeague());
        this.elements.leagueIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadLeague();
        });
        
        this.elements.refreshBtn.addEventListener('click', () => this.refreshData());
        
        this.elements.viewButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.target.dataset.view);
            });
        });

        this.elements.monthFilter.addEventListener('change', (e) => {
            this.switchMonth(e.target.value);
        });

        // Auto-refresh every 2 minutes
        this.startAutoRefresh();
    }

    loadStoredLeagueId() {
        const storedId = localStorage.getItem('fpl_league_id');
        if (storedId) {
            this.elements.leagueIdInput.value = storedId;
            this.loadLeague();
        }
    }

    async loadLeague() {
        const leagueId = this.elements.leagueIdInput.value.trim();
        if (!leagueId) {
            alert('Please enter a League ID');
            return;
        }

        this.leagueId = leagueId;
        localStorage.setItem('fpl_league_id', leagueId);
        
        this.showLoading();
        this.hideError();
        
        try {
            await this.loadLeagueData();
            this.elements.setupSection.style.display = 'none';
            this.elements.leaderboardSection.style.display = 'block';
        } catch (error) {
            this.showError('Failed to load league. Please check the League ID and try again.');
            console.error('Error loading league:', error);
        }
    }

    async loadLeagueData() {
        const [leagueData, currentEvent, fixtures] = await Promise.all([
            this.fetchLeagueStandings(),
            this.fetchCurrentEvent(),
            this.fetchFixtures()
        ]);

        this.updateLeagueInfo(leagueData);
        await this.updateLeaderboard(leagueData, currentEvent, fixtures);
        this.updateTimestamp();
    }

    async fetchLeagueStandings() {
        const url = `/api/leagues-classic/${this.leagueId}/standings/`;
        return await this.fetchWithCache(url, 'league_standings');
    }

    async fetchCurrentEvent() {
        const url = '/api/event-status/';
        return await this.fetchWithCache(url, 'event_status', 60000); // 1 minute cache
    }

    async fetchFixtures() {
        const url = '/api/fixtures/';
        return await this.fetchWithCache(url, 'fixtures', 5 * 60 * 1000); // 5 minutes cache
    }

    async fetchManagerHistory(managerId) {
        const url = `/api/entry/${managerId}/history/`;
        return await this.fetchWithCache(url, `manager_${managerId}_history`);
    }

    async fetchManagerTeam(managerId, currentGameweek) {
        const url = `/api/entry/${managerId}/event/${currentGameweek}/picks/`;
        return await this.fetchWithCache(url, `manager_${managerId}_team_${currentGameweek}`, 60000); // 1 minute cache
    }

    async fetchLiveGameData(currentGameweek) {
        const url = `/api/event/${currentGameweek}/live/`;
        return await this.fetchWithCache(url, `live_game_${currentGameweek}`, 30000); // 30 second cache for live data
    }

    async fetchPlayerData() {
        const url = '/api/bootstrap-static/';
        return await this.fetchWithCache(url, 'bootstrap_static', 5 * 60 * 1000); // 5 minutes cache
    }

    async fetchWithCache(url, key, timeout = this.cacheTimeout) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < timeout) {
            return cached.data;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
    }

    updateLeagueInfo(leagueData) {
        this.elements.leagueName.textContent = leagueData.league.name;
        
        // Check if we're in pre-season (no standings yet)
        const isPreSeason = leagueData.standings.results.length === 0;
        const memberCount = leagueData.new_entries.results.length;
        
        if (isPreSeason) {
            this.elements.leagueDetails.textContent = 
                `${memberCount} teams • Season starts soon • Created by ${leagueData.league.entry_name}`;
        } else {
            this.elements.leagueDetails.textContent = 
                `${leagueData.standings.results.length} teams • Created by ${leagueData.league.entry_name}`;
        }
    }

    async updateLeaderboard(leagueData, currentEvent, fixtures) {
        const isPreSeason = leagueData.standings.results.length === 0;
        
        if (isPreSeason) {
            this.renderPreSeasonLeaderboard(leagueData);
        } else {
            // Build gameweek to date mapping
            this.buildGameweekDateMapping(fixtures);
            this.buildAvailableMonths(); // Call the new method here
            
            const currentGameweek = currentEvent.status.find(s => s.status === 'a')?.event || 1;
            
            // Get manager histories for monthly calculations
            const managerHistories = await this.getManagerHistories(leagueData.standings.results);
            
            // Get manager teams to calculate played players
            const managerTeams = await this.getManagerTeams(leagueData.standings.results, currentGameweek);
            
            // Get live game data to see which players have played
            const liveGameData = await this.fetchLiveGameData(currentGameweek);

            // Get player data to map IDs to names
            const playerData = await this.fetchPlayerData();

            // Calculate scores for different views
            const scores = this.calculateScores(leagueData.standings.results, managerHistories, managerTeams, liveGameData, playerData, currentGameweek);
            
            this.renderLeaderboard(scores);
        }
    }

    buildGameweekDateMapping(fixtures) {
        this.gameweekDates.clear();
        
        fixtures.forEach(fixture => {
            if (fixture.event && fixture.kickoff_time) {
                const gameweek = fixture.event;
                const kickoffDate = new Date(fixture.kickoff_time);
                
                if (!this.gameweekDates.has(gameweek) || 
                    kickoffDate < this.gameweekDates.get(gameweek)) {
                    this.gameweekDates.set(gameweek, kickoffDate);
                }
            }
        });
    }

    buildAvailableMonths() {
        const months = new Set();
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        
        // Add current month
        months.add(`${currentYear}-${currentMonth}`);
        
        // Add all months that have gameweeks
        this.gameweekDates.forEach((date, gameweek) => {
            const month = date.getMonth();
            const year = date.getFullYear();
            months.add(`${year}-${month}`);
        });
        
        this.availableMonths = Array.from(months).sort();
        
        // Set current month as default
        this.currentMonth = `${currentYear}-${currentMonth}`;
        
        this.populateMonthFilter();
    }

    populateMonthFilter() {
        const monthFilter = this.elements.monthFilter;
        monthFilter.innerHTML = '';
        
        this.availableMonths.forEach(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = new Date(parseInt(year), parseInt(month)).toLocaleDateString('en-US', { 
                month: 'long', 
                year: 'numeric' 
            });
            
            const option = document.createElement('option');
            option.value = monthKey;
            option.textContent = monthName;
            option.selected = monthKey === this.currentMonth;
            
            monthFilter.appendChild(option);
        });
        
        // Show month controls only if we have multiple months
        this.elements.monthControls.style.display = this.availableMonths.length > 1 ? 'block' : 'none';
    }

    renderPreSeasonLeaderboard(leagueData) {
        const members = leagueData.new_entries.results;
        
        // Sort by join date (most recent first)
        const sortedMembers = [...members].sort((a, b) => 
            new Date(b.joined_time) - new Date(a.joined_time)
        );
        
        this.elements.leaderboardBody.innerHTML = '';
        
        sortedMembers.forEach((member, index) => {
            const row = this.createPreSeasonRow(member, index + 1);
            this.elements.leaderboardBody.appendChild(row);
        });
        
        // Update headers for pre-season view
        this.elements.scoreHeader.textContent = 'Join Date';
        this.elements.viewButtons.forEach(btn => btn.style.display = 'none');
    }

    createPreSeasonRow(member, rank) {
        const row = document.createElement('tr');
        const joinDate = new Date(member.joined_time).toLocaleDateString();
        
        row.innerHTML = `
            <td class="rank">${rank}</td>
            <td class="manager-name">${member.player_name || 'Unknown Manager'}</td>
            <td class="team-name">${member.entry_name}</td>
            <td class="join-date">${joinDate}</td>
            <td class="status">Ready for Season</td>
            <td class="played-players">-</td>
            <td class="captain">-</td>
        `;
        
        return row;
    }

    async getManagerHistories(managers) {
        const histories = {};
        const promises = managers.map(async (manager) => {
            try {
                const history = await this.fetchManagerHistory(manager.entry);
                histories[manager.entry] = history;
            } catch (error) {
                console.warn(`Failed to fetch history for manager ${manager.entry}:`, error);
            }
        });
        
        await Promise.all(promises);
        return histories;
    }

    async getManagerTeams(managers, currentGameweek) {
        const teams = {};
        const promises = managers.map(async (manager) => {
            try {
                const team = await this.fetchManagerTeam(manager.entry, currentGameweek);
                teams[manager.entry] = team;
            } catch (error) {
                console.warn(`Failed to fetch team for manager ${manager.entry}:`, error);
            }
        });
        
        await Promise.all(promises);
        return teams;
    }

    calculatePlayedPlayers(team, liveGameData, currentGameweek) {
        if (!team || !team.picks || !liveGameData) return 0;
        
        console.log('Team data:', team);
        console.log('Live game data:', liveGameData);
        
        let playedCount = 0;
        
        // Count ALL 15 players in the squad (including bench) for testing
        const allPicks = team.picks;
        
        console.log('All picks (15 players):', allPicks);
        console.log('All picks with multipliers:', allPicks.map(p => ({ id: p.element, multiplier: p.multiplier, is_captain: p.is_captain })));
        
        allPicks.forEach((pick, index) => {
            console.log(`Pick ${index}:`, pick);
            
            // Check if this player has played using live game data
            const playerId = pick.element;
            const playerLiveData = liveGameData.elements && liveGameData.elements[playerId];
            
            console.log(`Player ${playerId} live data:`, playerLiveData);
            
            // Player has played if they have minutes or points in live data
            const hasMinutes = playerLiveData && playerLiveData.stats && playerLiveData.stats.minutes !== null && playerLiveData.stats.minutes > 0;
            const hasPoints = playerLiveData && playerLiveData.stats && playerLiveData.stats.total_points !== null && playerLiveData.stats.total_points > 0;
            
            console.log(`Player ${playerId} - hasMinutes: ${hasMinutes}, hasPoints: ${hasPoints}`);
            
            const hasPlayed = hasMinutes || hasPoints;
            
            console.log(`Player ${playerId} has played: ${hasPlayed}`);
            
            if (hasPlayed) {
                playedCount++;
                console.log(`Player ${playerId} counted as played! Total so far: ${playedCount}`);
            }
        });
        
        console.log('Final played count:', playedCount);
        return playedCount;
    }

    getCaptainInfo(team, liveGameData, playerData) {
        if (!team || !team.picks || !liveGameData) return { name: 'Unknown', hasPlayed: false };
        
        // Find the captain (highest multiplier)
        const captain = team.picks.find(pick => pick.is_captain === true) || 
                       team.picks.reduce((max, pick) => pick.multiplier > max.multiplier ? pick : max);
        
        if (!captain) return { name: 'Unknown', hasPlayed: false };
        
        // Get captain's live data
        const playerId = captain.element;
        const playerLiveData = liveGameData.elements && liveGameData.elements[playerId];
        
        // Check if captain has played
        const hasPlayed = playerLiveData && (
            (playerLiveData.stats && playerLiveData.stats.minutes !== null && playerLiveData.stats.minutes > 0) ||
            (playerLiveData.stats && playerLiveData.stats.total_points !== null && playerLiveData.stats.total_points > 0)
        );
        
        // Get captain's name from player data
        let captainName = 'Unknown';
        if (playerData && playerData.elements) {
            const player = playerData.elements.find(p => p.id === playerId);
            if (player) {
                captainName = player.web_name || player.first_name + ' ' + player.second_name || 'Unknown';
            }
        }
        
        return {
            name: captainName,
            hasPlayed: hasPlayed
        };
    }

    calculateScores(managers, histories, managerTeams, liveGameData, playerData, currentGameweek) {
        const [selectedYear, selectedMonth] = this.currentMonth.split('-').map(Number);
        
        return managers.map(manager => {
            const history = histories[manager.entry];
            const team = managerTeams[manager.entry];
            const playedPlayers = this.calculatePlayedPlayers(team, liveGameData, currentGameweek);
            const captainInfo = this.getCaptainInfo(team, liveGameData, playerData);
            const gameweekPoints = this.getGameweekPoints(history, currentGameweek);
            const monthlyPoints = this.getMonthlyPoints(history, selectedMonth, selectedYear, gameweekPoints);
            
            return {
                ...manager,
                gameweekPoints,
                monthlyPoints,
                overallPoints: manager.total,
                playedPlayers: playedPlayers,
                captainInfo: captainInfo
            };
        });
    }

    getGameweekPoints(history, gameweek) {
        if (!history || !history.current) return 0;
        
        const gameweekData = history.current.find(gw => gw.event === gameweek);
        return gameweekData ? gameweekData.points : 0;
    }

    getMonthlyPoints(history, month, year, currentGameweekPoints) {
        if (!history || !history.current) return 0;
        
        let monthlyTotal = 0;
        const currentDate = new Date();
        const isCurrentMonth = month === currentDate.getMonth() && year === currentDate.getFullYear();
        
        // Sum points from all gameweeks in the selected month
        history.current.forEach(gameweek => {
            const gameweekDate = this.gameweekDates.get(gameweek.event);
            
            if (gameweekDate && 
                gameweekDate.getMonth() === month && 
                gameweekDate.getFullYear() === year) {
                monthlyTotal += gameweek.points;
            }
        });
        
        // For current month, we might have live/partial gameweek data
        // For past months, we only use completed gameweek data
        return monthlyTotal;
    }

    renderLeaderboard(scores) {
        // Always sort by monthly score (descending) as primary sort
        const sortedScores = this.sortScores(scores);
        
        this.elements.leaderboardBody.innerHTML = '';
        
        sortedScores.forEach((manager, index) => {
            const row = this.createLeaderboardRow(manager, index + 1);
            this.elements.leaderboardBody.appendChild(row);
        });
        
        // Show view buttons for regular season
        this.elements.viewButtons.forEach(btn => btn.style.display = 'inline-block');
    }

    sortScores(scores) {
        // Always sort by monthly score first, then by gameweek score as tiebreaker
        return [...scores].sort((a, b) => {
            if (b.monthlyPoints !== a.monthlyPoints) {
                return b.monthlyPoints - a.monthlyPoints;
            }
            return b.gameweekPoints - a.gameweekPoints;
        });
    }

    createLeaderboardRow(manager, rank) {
        const row = document.createElement('tr');
        
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        
        row.innerHTML = `
            <td class="rank ${rankClass}">${rank}</td>
            <td class="manager-name">${manager.player_name || 'Unknown Manager'}</td>
            <td class="team-name">${manager.entry_name}</td>
            <td class="points gameweek-points">${manager.gameweekPoints}</td>
            <td class="points monthly-points">${manager.monthlyPoints}</td>
            <td class="played-players">${manager.playedPlayers}/15</td>
            <td class="captain">${manager.captainInfo.name} ${manager.captainInfo.hasPlayed ? '✅' : '⏳'}</td>
        `;
        
        return row;
    }

    switchView(view) {
        this.currentView = view;
        
        // Update button states
        this.elements.viewButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        // Update header based on current view
        const viewLabels = {
            monthly: 'Live Monthly Score',
            gameweek: 'Live Gameweek Score'
        };
        this.elements.scoreHeader.textContent = viewLabels[view];
        
        // Re-render leaderboard (still sorted by monthly score)
        if (this.leagueId) {
            this.refreshData();
        }
    }

    switchMonth(monthKey) {
        this.currentMonth = monthKey;
        
        // Re-render leaderboard with new month filter
        if (this.leagueId) {
            this.refreshData();
        }
    }

    async refreshData() {
        if (!this.leagueId) return;
        
        this.showLoading();
        this.hideError();
        
        try {
            await this.loadLeagueData();
        } catch (error) {
            this.showError('Failed to refresh data. Please try again.');
            console.error('Error refreshing data:', error);
        }
    }

    startAutoRefresh() {
        this.autoRefreshInterval = setInterval(() => {
            if (this.leagueId) {
                this.refreshData();
            }
        }, 2 * 60 * 1000); // 2 minutes
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    showLoading() {
        this.elements.loadingIndicator.style.display = 'block';
        this.elements.leaderboardTable.style.display = 'none';
    }

    hideLoading() {
        this.elements.loadingIndicator.style.display = 'none';
        this.elements.leaderboardTable.style.display = 'table';
    }

    showError(message) {
        this.elements.errorMessage.querySelector('p').textContent = message;
        this.elements.errorMessage.style.display = 'block';
        this.hideLoading();
    }

    hideError() {
        this.elements.errorMessage.style.display = 'none';
    }

    updateTimestamp() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        this.elements.lastUpdated.textContent = `Last updated: ${timeString}`;
        this.hideLoading();
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FPLLeaderboard();
}); 