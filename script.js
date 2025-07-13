// Configuration
const esp32Endpoint = "http://192.168.177.54/data";                      //  http://172.17.7.36     //http://192.168.161.54
const updateInterval = 1000; // 1 second
const resistance = 2200; // 2.2kΩ
const energyTimeWindow = 10; // seconds for energy calculation
const MIN_VALID_VOLTAGE = 0.05; // Minimum valid voltage reading
const MAX_VOLTAGE_SPIKE = 1.0; // Maximum allowed voltage change between readings

// Token reward configuration
const TOKEN_RATE = 0.1; // 0.1 token per 100µJ
const MIN_CLAIM_ENERGY = 100; // Minimum energy (µJ) required to claim tokens

// State variables
const voltageReadings = [];
let lastValidVoltage = 0;
let lastNonZeroVoltage = 0; // Track last non-zero voltage
let connectionOk = false;
let voltageChart, energyChart;
let isPaused = false; // Track pause state
let fetchTimeout; // Track the fetch timeout

// Token system variables
let totalEnergyGenerated = 0; // Total energy in µJ
let claimedEnergy = 0; // Energy that has been converted to tokens
let tokensEarned = 0; // Total tokens earned
let deviceIP = ''; // Store the device IP address

// Initialize sparkle animation
function createSparkles() {
    const sparklesContainer = document.getElementById('sparkles');
    const sparkleCount = Math.floor(window.innerWidth / 10);
    
    for (let i = 0; i < sparkleCount; i++) {
        const sparkle = document.createElement('div');
        sparkle.classList.add('sparkle');
        
        const posX = Math.random() * 100;
        const posY = Math.random() * 100 + 100;
        const size = Math.random() * 3 + 2;
        const duration = Math.random() * 3 + 2;
        const delay = Math.random() * 5;
        
        sparkle.style.left = posX + '%';
        sparkle.style.top = posY + '%';
        sparkle.style.width = size + 'px';
        sparkle.style.height = size + 'px';
        sparkle.style.animationDuration = duration + 's';
        sparkle.style.animationDelay = delay + 's';
        
        sparklesContainer.appendChild(sparkle);
    }
}

// Dark mode toggle
function setupDarkModeToggle() {
    const modeToggle = document.getElementById('modeToggle');
    modeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const icon = modeToggle.querySelector('i');
        
        if (document.body.classList.contains('dark-mode')) {
            icon.classList.replace('fa-moon', 'fa-sun');
            modeToggle.innerHTML = '<i class="fas fa-sun"></i> Light Mode';
        } else {
            icon.classList.replace('fa-sun', 'fa-moon');
            modeToggle.innerHTML = '<i class="fas fa-moon"></i> Dark Mode';
        }
        
        updateChartThemes();
    });
}

// Initialize charts
function createCharts() {
    const gridColor = getComputedStyle(document.body).getPropertyValue('--chart-grid');
    const textColor = getComputedStyle(document.body).getPropertyValue('--chart-text');
    const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary-color');
    const secondaryColor = getComputedStyle(document.body).getPropertyValue('--secondary-color');
    
    // Voltage chart
    voltageChart = new Chart(
        document.getElementById('voltageChart').getContext('2d'),
        {
            type: 'line',
            data: {
                labels: Array(20).fill(''),
                datasets: [{
                    label: 'Voltage (V)',
                    data: Array(20).fill(0),
                    borderColor: primaryColor,
                    backgroundColor: 'rgba(' + hexToRgb(primaryColor).r + ',' + hexToRgb(primaryColor).g + ',' + hexToRgb(primaryColor).b + ', 0.2)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: primaryColor,
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)' },
                        ticks: { color: textColor }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)' },
                        ticks: { color: textColor }
                    }
                }
            }
        }
    );
    
    // Energy chart
    energyChart = new Chart(
        document.getElementById('energyChart').getContext('2d'),
        {
            type: 'line',
            data: {
                labels: Array(20).fill(''),
                datasets: [{
                    label: 'Energy (µJ)',
                    data: Array(20).fill(0),
                    borderColor: secondaryColor,
                    backgroundColor: 'rgba(' + hexToRgb(secondaryColor).r + ',' + hexToRgb(secondaryColor).g + ',' + hexToRgb(secondaryColor).b + ', 0.2)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: secondaryColor,
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)' },
                        ticks: { color: textColor }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)' },
                        ticks: { color: textColor }
                    }
                }
            }
        }
    );
}

// Helper function to convert hex to rgb
function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Parse r, g, b values
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    
    return { r: r, g: g, b: b };
}

// Update chart themes when mode changes
function updateChartThemes() {
    const gridColor = getComputedStyle(document.body).getPropertyValue('--chart-grid');
    const textColor = getComputedStyle(document.body).getPropertyValue('--chart-text');
    const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary-color');
    const secondaryColor = getComputedStyle(document.body).getPropertyValue('--secondary-color');
    
    if (voltageChart) {
        voltageChart.options.scales.x.grid.color = 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)';
        voltageChart.options.scales.x.ticks.color = textColor;
        voltageChart.options.scales.y.grid.color = 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)';
        voltageChart.options.scales.y.ticks.color = textColor;
        voltageChart.data.datasets[0].borderColor = primaryColor;
        voltageChart.data.datasets[0].backgroundColor = 'rgba(' + hexToRgb(primaryColor).r + ',' + hexToRgb(primaryColor).g + ',' + hexToRgb(primaryColor).b + ', 0.2)';
        voltageChart.data.datasets[0].pointBackgroundColor = primaryColor;
        voltageChart.update();
    }
    
    if (energyChart) {
        energyChart.options.scales.x.grid.color = 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)';
        energyChart.options.scales.x.ticks.color = textColor;
        energyChart.options.scales.y.grid.color = 'rgba(' + hexToRgb(gridColor).r + ',' + hexToRgb(gridColor).g + ',' + hexToRgb(gridColor).b + ', 0.4)';
        energyChart.options.scales.y.ticks.color = textColor;
        energyChart.data.datasets[0].borderColor = secondaryColor;
        energyChart.data.datasets[0].backgroundColor = 'rgba(' + hexToRgb(secondaryColor).r + ',' + hexToRgb(secondaryColor).g + ',' + hexToRgb(secondaryColor).b + ', 0.2)';
        energyChart.data.datasets[0].pointBackgroundColor = secondaryColor;
        energyChart.update();
    }
}

// Update connection status UI
function updateConnectionStatus(connected) {
    const statusElem = document.getElementById('connectionStatus');
    const dotElem = document.getElementById('connectionDot');
    const textElem = document.getElementById('connectionText');
    
    if (connected) {
        statusElem.classList.add('connected');
        dotElem.style.color = getComputedStyle(document.body).getPropertyValue('--success-color');
        textElem.textContent = 'Connected';
    } else {
        statusElem.classList.remove('connected');
        dotElem.style.color = getComputedStyle(document.body).getPropertyValue('--error-color');
        textElem.textContent = 'Disconnected';
    }
}

// Calculate energy from voltage readings
function calculateEnergy(voltages) {
    if (voltages.length === 0) return 0;
    
    // Calculate RMS voltage
    const sumSquares = voltages.reduce((total, v) => total + (v * v), 0);
    const rmsVoltage = Math.sqrt(sumSquares / voltages.length);
    
    // Energy = V² × t / R (converted to µJ)
    return (rmsVoltage * rmsVoltage * energyTimeWindow / resistance) * 1000000;
}

// Update timestamp display
function updateTimestamp() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
}

// Process and validate voltage reading
function processVoltageReading(rawVoltage) {
    let voltage = parseFloat(rawVoltage.toFixed(3));
    
    // Validate reading
    if (isNaN(voltage)) {
        console.warn("Invalid voltage reading (NaN)");
        return lastValidVoltage;
    }
    
    // Check for minimum valid voltage
    if (voltage < MIN_VALID_VOLTAGE) {
        return 0;
    }
    
    // Check for sudden spikes
    if (Math.abs(voltage - lastValidVoltage) > MAX_VOLTAGE_SPIKE) {
        console.warn("Voltage spike detected (" + voltage + "V), using last valid value");
        return lastValidVoltage;
    }
    
    // Update last non-zero voltage if current is valid
    if (voltage >= MIN_VALID_VOLTAGE) {
        lastNonZeroVoltage = voltage;
    }
    
    lastValidVoltage = voltage;
    return voltage;
}

// Update displays with voltage value
function updateDisplays(voltage) {
    // Display last non-zero voltage if current is zero
    const displayVoltage = voltage < MIN_VALID_VOLTAGE ? lastNonZeroVoltage : voltage;
    document.getElementById('voltage').textContent = displayVoltage.toFixed(2);
    
    // Only update charts with actual readings (not the displayed value)
    updateCharts(voltage, new Date().toLocaleTimeString());
    updateTimestamp();
}

// Update charts with new data
function updateCharts(voltage, timestamp) {
    // Update voltage chart
    voltageChart.data.labels.push(timestamp);
    voltageChart.data.labels.shift();
    voltageChart.data.datasets[0].data.push(voltage);
    voltageChart.data.datasets[0].data.shift();
    voltageChart.update();
    
    // Store reading for energy calculation
    if (voltage > MIN_VALID_VOLTAGE) {
        voltageReadings.push(voltage);
    }
    
    // Maintain fixed window size for energy calculation
    const maxReadings = energyTimeWindow * (1000 / updateInterval);
    if (voltageReadings.length > maxReadings) {
        voltageReadings.shift();
    }
    
    // Update energy display if we have enough readings
    if (voltageReadings.length >= maxReadings) {
        const energy = calculateEnergy(voltageReadings);
        document.getElementById('energy').textContent = energy.toFixed(2);
        
        // Track total energy generated
        totalEnergyGenerated += energy;
        
        // Update energy chart
        energyChart.data.labels.push(timestamp);
        energyChart.data.labels.shift();
        energyChart.data.datasets[0].data.push(energy);
        energyChart.data.datasets[0].data.shift();
        energyChart.update();
    }
}

// Reset all graphs and data
function resetGraphs() {
    // Clear chart data
    if (voltageChart) {
        voltageChart.data.datasets[0].data = Array(20).fill(0);
        voltageChart.update();
    }
    
    if (energyChart) {
        energyChart.data.datasets[0].data = Array(20).fill(0);
        energyChart.update();
    }
    
    // Clear stored readings
    voltageReadings.length = 0;
    lastValidVoltage = 0;
    lastNonZeroVoltage = 0;
    
    // Update displays
    document.getElementById('voltage').textContent = "0.00";
    document.getElementById('energy').textContent = "0.00";
}

// Toggle pause/resume data fetching
function togglePauseResume() {
    const btn = document.getElementById('pauseResumeBtn');
    isPaused = !isPaused;
    
    if (isPaused) {
        btn.innerHTML = '<i class="fas fa-play"></i> Resume';
        clearTimeout(fetchTimeout);
    } else {
        btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
        fetchData(); // Resume fetching
    }
}

// Calculate tokens based on energy generated
function calculateTokens(energy) {
    return Math.floor(energy * TOKEN_RATE / 100);
}

// Claim tokens based on generated energy
function claimTokens() {
    const unclaimedEnergy = totalEnergyGenerated - claimedEnergy;
    const tokensToClaim = calculateTokens(unclaimedEnergy);
    
    if (unclaimedEnergy < MIN_CLAIM_ENERGY) {
        alert(`You need to generate at least ${MIN_CLAIM_ENERGY}µJ to claim tokens. Current unclaimed energy: ${unclaimedEnergy.toFixed(2)}µJ`);
        return;
    }
    
    // Update claimed energy and tokens
    claimedEnergy = totalEnergyGenerated;
    tokensEarned += tokensToClaim;
    
    // Update UI
    document.getElementById('tokens').textContent = tokensEarned;
    
    // Show reward popup
    showTokenRewardPopup(tokensToClaim);
    
    // Store data in localStorage
    localStorage.setItem('tokensEarned', tokensEarned.toString());
    localStorage.setItem('claimedEnergy', claimedEnergy.toString());
    localStorage.setItem('totalEnergyGenerated', totalEnergyGenerated.toString());
    
    console.log(`Claimed ${tokensToClaim} tokens for ${unclaimedEnergy.toFixed(2)}µJ`);
}

// Show token reward popup
function showTokenRewardPopup(tokens) {
    document.getElementById('rewardAmount').textContent = tokens;
    document.getElementById('totalTokensAfterClaim').textContent = tokensEarned;
    
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById('tokenRewardPopup');
    
    overlay.style.display = 'block';
    popup.style.display = 'block';
}

// Close token reward popup
function closeTokenRewardPopup() {
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById('tokenRewardPopup');
    
    overlay.style.display = 'none';
    popup.style.display = 'none';
}

// Fetch data from ESP32
async function fetchData() {
    if (isPaused) return; // Don't fetch if paused
    
    try {
        const startTime = Date.now();
        const response = await fetch(esp32Endpoint + "?t=" + startTime);
        
        if (!response.ok) {
            throw new Error("HTTP error! status: " + response.status);
        }
        
        const data = await response.json();
        const rawVoltage = parseFloat(data.voltage);
        const voltage = processVoltageReading(rawVoltage);
        
        // Update displays
        updateDisplays(voltage);
        
        // Update connection status if needed
        if (!connectionOk) {
            connectionOk = true;
            updateConnectionStatus(true);
        }
        
        // Update IP address if available
        if (data.ip) {
            deviceIP = data.ip;
            document.getElementById('ipAddress').textContent = `IP: ${deviceIP}`;
        }
        
    } catch (error) {
        console.error('Error fetching data:', error);
        
        // Update connection status if needed
        if (connectionOk) {
            connectionOk = false;
            updateConnectionStatus(false);
        }
        
        // Retry sooner if connection fails
        fetchTimeout = setTimeout(fetchData, updateInterval / 2);
        return;
    }
    
    // Schedule next update
    fetchTimeout = setTimeout(fetchData, updateInterval);
}

// Initialize everything when the page loads
window.addEventListener('load', () => {
    createSparkles();
    setupDarkModeToggle();
    createCharts();
    updateConnectionStatus(false);
    
    // Load saved data from localStorage
    if (localStorage.getItem('tokensEarned')) {
        tokensEarned = parseInt(localStorage.getItem('tokensEarned'));
        claimedEnergy = parseFloat(localStorage.getItem('claimedEnergy'));
        totalEnergyGenerated = parseFloat(localStorage.getItem('totalEnergyGenerated'));
        document.getElementById('tokens').textContent = tokensEarned;
    }
    
    // Setup control buttons
    document.getElementById('resetBtn').addEventListener('click', resetGraphs);
    document.getElementById('pauseResumeBtn').addEventListener('click', togglePauseResume);
    document.getElementById('claimTokenBtn').addEventListener('click', claimTokens);
    document.getElementById('closeRewardPopup').addEventListener('click', closeTokenRewardPopup);
    
    fetchData();
});