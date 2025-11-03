document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const mapContainer = document.getElementById('map-container');

    // Récupérer la carte du jeu (suppose qu'elle est envoyée ou connue)
    // Pour l'instant, on se base sur le map.json côté serveur
    const MAP_GRID_WIDTH = 3;
    const MAP_GRID_HEIGHT = 3;
    mapContainer.style.gridTemplateColumns = `repeat(${MAP_GRID_WIDTH}, 100px)`;

    // Palette de couleurs pour les types de terrain (doit correspondre au CSS)
    const TILE_TYPE_CLASSES = {
        building: 'tile-building',
        street: 'tile-street',
        cover: 'tile-cover',
    };

    function drawMap(gameState, mapLayout) {
        mapContainer.innerHTML = ''; // Vide la carte avant de redessiner

        // Dessine la grille de base
        for (let y = 0; y < MAP_GRID_HEIGHT; y++) {
            for (let x = 0; x < MAP_GRID_WIDTH; x++) {
                const tileDiv = document.createElement('div');
                tileDiv.classList.add('tile');

                const tileType = mapLayout.grid[y][x].type;
                if (TILE_TYPE_CLASSES[tileType]) {
                    tileDiv.classList.add(TILE_TYPE_CLASSES[tileType]);
                }

                mapContainer.appendChild(tileDiv);
            }
        }

        // Dessine les joueurs sur la carte
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            const playerDiv = document.createElement('div');
            playerDiv.classList.add('player');
            if (player.isDead) {
                playerDiv.classList.add('dead');
            }
            // Affiche la première lettre du nom ou du numéro
            const playerNameInitial = (playerId.split('@')[0]).substring(0, 1).toUpperCase();
            playerDiv.textContent = playerNameInitial;
            playerDiv.title = playerId; // Affiche le JID complet au survol

            // Calcule la position sur la grille
            const tileIndex = player.y * MAP_GRID_WIDTH + player.x;
            const targetTile = mapContainer.children[tileIndex];
            if (targetTile) {
                targetTile.appendChild(playerDiv);
            }
        }
    }

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
    });

    socket.on('gameStateUpdate', (gameState) => {
        console.log('Mise à jour de l\'état du jeu reçue :', gameState);

        // On suppose que la disposition de la carte est statique pour l'instant
        // Dans une future version, le serveur pourrait envoyer la carte avec l'état du jeu
        const mapLayout = {
          "grid": [
            [ { "type": "building" }, { "type": "street" }, { "type": "building" } ],
            [ { "type": "cover" }, { "type": "street" }, { "type": "cover" } ],
            [ { "type": "building" }, { "type": "cover" }, { "type": "building" } ]
          ]
        };

        drawMap(gameState, mapLayout);
    });

    socket.on('disconnect', () => {
        console.log('Déconnecté du serveur.');
    });
});
