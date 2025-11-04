document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const mapContainer = document.getElementById('map-container');

    let currentMapLayout = null;

    function drawMap(gameState, mapLayout) {
        if (!mapLayout) return; // Ne dessine rien si la carte n'est pas chargée

        mapContainer.innerHTML = ''; // Vide la carte avant de redessiner

        const gridWidth = mapLayout.grid[0].length;
        const gridHeight = mapLayout.grid.length;
        mapContainer.style.gridTemplateColumns = `repeat(${gridWidth}, 150px)`;

        // Dessine la grille de base
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const tileDiv = document.createElement('div');
                tileDiv.classList.add('tile');
                mapContainer.appendChild(tileDiv);
            }
        }

        // Dessine les joueurs sur la carte
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];

            const playerChevron = document.createElement('div');
            playerChevron.classList.add('player');
            if (player.isDead) {
                playerChevron.classList.add('dead');
            }
            playerChevron.title = playerId;

            const playerName = document.createElement('div');
            playerName.classList.add('player-name');
            const playerShortName = (playerId.split('@')[0]).substring(0, 5);
            playerName.textContent = playerShortName;

            playerChevron.appendChild(playerName);

            const tileIndex = player.y * gridWidth + player.x;
            const targetTile = mapContainer.children[tileIndex];
            if (targetTile) {
                targetTile.appendChild(playerChevron);
            }
        }
    }

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
    });

    socket.on('initialState', (initialState) => {
        console.log('État initial reçu :', initialState);
        currentMapLayout = initialState.map;
        drawMap(initialState, currentMapLayout);
    });

    socket.on('gameStateUpdate', (gameState) => {
        console.log('Mise à jour de l\'état du jeu reçue :', gameState);
        drawMap(gameState, currentMapLayout);
    });

    socket.on('disconnect', () => {
        console.log('Déconnecté du serveur.');
    });
});
