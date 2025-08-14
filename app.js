class FPLLeaderboard {
    constructor() {
        this.leagueId = null;
        this.currentView = 'gameweek';
        this.autoRefreshInterval = null;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
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
            viewButtons: document.querySelectorAll('.view-btn')
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
        const [leagueData, currentEvent] = await Promise.all([
            this.fetchLeagueStandings(),
            this.fetchCurrentEvent()
        ]);

        this.updateLeagueInfo(leagueData);
        await this.updateLeaderboard(leagueData, currentEvent);
        this.updateTimestamp();
    }

    async fetchLeagueStandings() {
        const url = `https://fantasy.premierleague.com/api/leagues-classic/${this.leagueId}/standings/`;
        return await this.fetchWithCache(url, 'league_standings');
    }

    async fetchCurrentEvent() {
        const url = 'https://fantasy.premierleague.com/api/event-status/';
        return await this.fetchWithCache(url, 'event_status', 60000); // 1 minute cache
    }

    async fetchManagerHistory(managerId) {
        const url = `https://fantasy.premierleague.com/api/entry/${managerId}/history/`;
        return await this.fetchWithCache(url, `manager_${managerId}_history`);
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
        this.elements.leagueDetails.textContent = 
            `${leagueData.standings.results.length} teams • Created by ${leagueData.league.entry_name}`;
    }

    async updateLeaderboard(leagueData, currentEvent) {
        const currentGameweek = currentEvent.status.find(s => s.status === 'a')?.event || 1;
        
        // Get manager histories for monthly calculations
        const managerHistories = await this.getManagerHistories(leagueData.standings.results);
        
        // Calculate scores for different views
        const scores = this.calculateScores(leagueData.standings.results, managerHistories, currentGameweek);
        
        this.renderLeaderboard(scores);
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

    calculateScores(managers, histories, currentGameweek) {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        return managers.map(manager => {
            const history = histories[manager.entry];
            const gameweekPoints = this.getGameweekPoints(history, currentGameweek);
            const monthlyPoints = this.getMonthlyPoints(history, currentMonth, currentYear);
            
            return {
                ...manager,
                gameweekPoints,
                monthlyPoints,
                overallPoints: manager.total
            };
        });
    }

    getGameweekPoints(history, gameweek) {
        if (!history || !history.current) return 0;
        
        const gameweekData = history.current.find(gw => gw.event === gameweek);
        return gameweekData ? gameweekData.points : 0;
    }

    getMonthlyPoints(history, month, year) {
        if (!history || !history.current) return 0;
        
        let monthlyTotal = 0;
        history.current.forEach(gameweek => {
            const gameweekDate = new Date(gameweek.event * 7 * 24 * 60 * 60 * 1000); // Rough estimate
            if (gameweekDate.getMonth() === month && gameweekDate.getFullYear() === year) {
                monthlyTotal += gameweek.points;
            }
        });
        
        return monthlyTotal;
    }

    renderLeaderboard(scores) {
        const sortedScores = this.sortScores(scores);
        
        this.elements.leaderboardBody.innerHTML = '';
        
        sortedScores.forEach((manager, index) => {
            const row = this.createLeaderboardRow(manager, index + 1);
            this.elements.leaderboardBody.appendChild(row);
        });
    }

    sortScores(scores) {
        const sortKey = this.getSortKey();
        return [...scores].sort((a, b) => b[sortKey] - a[sortKey]);
    }

    getSortKey() {
        switch (this.currentView) {
            case 'gameweek': return 'gameweekPoints';
            case 'monthly': return 'monthlyPoints';
            case 'overall': return 'overallPoints';
            default: return 'gameweekPoints';
        }
    }

    createLeaderboardRow(manager, rank) {
        const row = document.createElement('tr');
        
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const points = this.getPointsForCurrentView(manager);
        const pointsClass = this.getPointsClass();
        
        row.innerHTML = `
            <td class="rank ${rankClass}">${rank}</td>
            <td class="manager-name">${manager.player_first_name} ${manager.player_last_name}</td>
            <td class="team-name">${manager.entry_name}</td>
            <td class="points ${pointsClass}">${points}</td>
            <td class="points overall-points">${manager.overallPoints}</td>
        `;
        
        return row;
    }

    getPointsForCurrentView(manager) {
        switch (this.currentView) {
            case 'gameweek': return manager.gameweekPoints;
            case 'monthly': return manager.monthlyPoints;
            case 'overall': return manager.overallPoints;
            default: return manager.gameweekPoints;
        }
    }

    getPointsClass() {
        switch (this.currentView) {
            case 'gameweek': return 'gameweek-points';
            case 'monthly': return 'monthly-points';
            case 'overall': return 'overall-points';
            default: return 'gameweek-points';
        }
    }

    switchView(view) {
        this.currentView = view;
        
        // Update button states
        this.elements.viewButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        // Update header
        const headers = {
            gameweek: 'Gameweek Points',
            monthly: 'Monthly Points',
            overall: 'Overall Points'
        };
        this.elements.scoreHeader.textContent = headers[view];
        
        // Re-render leaderboard
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