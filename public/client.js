document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const mapContainer = document.getElementById('map-container');
    const pairingContainer = document.getElementById('pairing-code-container');
    const pairingCodeDisplay = document.getElementById('pairing-code-display');
    const pairingError = document.getElementById('pairing-error');

    let currentMapLayout = null;

    function drawMap(gameState, mapLayout) {
        if (!mapLayout) return;

        mapContainer.innerHTML = '';
        const gridWidth = mapLayout.grid[0].length;
        const gridHeight = mapLayout.grid.length;
        mapContainer.style.gridTemplateColumns = `repeat(${gridWidth}, 150px)`;

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const tileDiv = document.createElement('div');
                tileDiv.classList.add('tile');
                mapContainer.appendChild(tileDiv);
            }
        }

        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            const playerChevron = document.createElement('div');
            playerChevron.classList.add('player');
            if (player.isDead) playerChevron.classList.add('dead');
            playerChevron.title = playerId;

            const playerName = document.createElement('div');
            playerName.classList.add('player-name');
            playerName.textContent = (playerId.split('@')[0]).substring(0, 5);
            playerChevron.appendChild(playerName);

            const tileIndex = player.y * gridWidth + player.x;
            const targetTile = mapContainer.children[tileIndex];
            if (targetTile) targetTile.appendChild(playerChevron);
        }
    }

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
    });

    socket.on('initialState', (initialState) => {
        console.log('État initial reçu :', initialState);
        pairingContainer.classList.add('hidden'); // Cache la section si le jeu est déjà en cours
        currentMapLayout = initialState.map;
        drawMap(initialState, currentMapLayout);
    });

    socket.on('gameStateUpdate', (gameState) => {
        console.log('Mise à jour de l\'état du jeu reçue :', gameState);
        pairingContainer.classList.add('hidden'); // Cache la section dès que le jeu commence
        drawMap(gameState, currentMapLayout);
    });

    socket.on('pairingCode', (data) => {
        console.log('Code de pairage reçu :', data);
        pairingError.textContent = '';
        pairingCodeDisplay.textContent = '';

        if (data.code) {
            pairingCodeDisplay.textContent = data.code;
        } else if (data.error) {
            pairingError.textContent = data.error;
        }

        pairingContainer.classList.remove('hidden');
    });

    socket.on('disconnect', () => {
        console.log('Déconnecté du serveur.');
    });
});
