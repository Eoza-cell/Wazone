const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

// Chemin pour sauvegarder les données d'authentification
const AUTH_DIR = './auth_info_baileys/';

// Crée le dossier d'authentification s'il n'existe pas
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR);
}

// --- CONFIGURATION DU SERVEUR WEB ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté au site web.');
    // Envoyer l'état actuel du jeu et la carte lors de la connexion initiale
    const db = getPlayersDatabase();
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'map.json'), 'utf8'));
    socket.emit('initialState', { players: db, map: map });

    socket.on('disconnect', () => {
        console.log('Un utilisateur s\'est déconnecté.');
    });
});

server.listen(PORT, () => {
    console.log(`Le serveur web est en écoute sur http://localhost:${PORT}`);
});
// --- FIN DE LA CONFIGURATION DU SERVEUR WEB ---

// --- LOGIQUE DE LA BASE DE DONNÉES DES JOUEURS (NIVEAU SUPÉRIEUR) ---
const DB_FILE = path.join(__dirname, 'data', 'players.json');

// Fonction pour lire la base de données des joueurs
function getPlayersDatabase() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Si le fichier n'existe pas, retournez une base de données vide.
        if (error.code === 'ENOENT') {
            return {};
        }
        console.error("Erreur lors de la lecture de la base de données.", error);
        return {};
    }
}

// Fonction pour sauvegarder la base de données des joueurs
function savePlayersDatabase(db) {
    const dbDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

// Fonction pour récupérer ou créer un joueur
function getPlayer(jid) {
    const db = getPlayersDatabase();
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'map.json'), 'utf8'));

    if (!db[jid]) {
        console.log(`Nouveau joueur détecté : ${jid}. Création de l'entrée.`);
        db[jid] = {
            health: 100,
            energy: 100,
            weapon: 'Pistolet',
            x: map.start_position.x,
            y: map.start_position.y,
            isDead: false,
            deathTimestamp: null
        };
        savePlayersDatabase(db);
        broadcastGameState(); // Diffuse l'état après la création d'un joueur
    }
    return db[jid];
}
// --- FIN DE LA LOGIQUE DE LA BASE DE DONNÉES ---


// --- LOGIQUE DE SYNCHRONISATION ---
function broadcastGameState() {
    const db = getPlayersDatabase();
    io.emit('gameStateUpdate', { players: db });
    console.log('État du jeu mis à jour et diffusé aux clients web.');
}
// --- FIN DE LA LOGIQUE DE SYNCHRONISATION ---


async function connectToWhatsApp() {
    // Récupère l'état d'authentification sauvegardé
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // Récupère la dernière version de Baileys
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Utilisation de la version de Baileys: ${version.join('.')}, Est-ce la dernière version ? ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // Nous utiliserons le code de pairage
        browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
        logger: pino({ level: 'silent' }), // Pour un affichage plus propre
        getMessage: async key => {
            console.log('⚠️ Message non déchiffré, retry demandé:', key);
            return { conversation: '🔄 Réessaye d\'envoyer ton message' };
        }
    });

    // Gestion de la connexion
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Si un QR code est généré, l'envoyer au frontend
        if(qr) {
            console.log('QR code généré, envoi au site web.');
            io.emit('qrCode', { qr: qr });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) &&
                                    lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('Connexion fermée à cause de:', lastDisconnect.error, ', reconnexion:', shouldReconnect);

            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Connexion ouverte !');
            // Informer le frontend que la connexion est réussie
            io.emit('connectionSuccess');
        }
    });

    // Sauvegarde des identifiants de session
    sock.ev.on('creds.update', saveCreds);

    // --- LOGIQUE DE GÉNÉRATION D'IMAGES ---
    async function generateStatusImage(player) {
        const imagePath = path.join(__dirname, 'generated_images', `status_${player.jid}.png`);
        const outputDir = path.dirname(imagePath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Dimensions de l'image
        const width = 800;
        const height = 400;

        // Couleurs
        const backgroundColor = '#1a1a1a'; // Fond sombre
        const barBackgroundColor = '#444';
        const healthColor = '#e74c3c'; // Rouge
        const energyColor = '#3498db'; // Bleu
        const textColor = '#ecf0f1';   // Blanc cassé

        // Calcul des longueurs des barres
        const barWidth = 400;
        const barHeight = 40;
        const healthBarWidth = (player.health / 100) * barWidth;
        const energyBarWidth = (player.energy / 100) * barWidth;

        // Création de l'image avec Sharp
        const svgImage = `
        <svg width="${width}" height="${height}">
            <rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundColor}" />

            <text x="50%" y="60" font-family="Arial, sans-serif" font-size="40" fill="${textColor}" text-anchor="middle">STATUT DU JOUEUR</text>

            <!-- Barre de Vie -->
            <text x="100" y="150" font-family="Arial, sans-serif" font-size="30" fill="${textColor}">❤️ Vie</text>
            <rect x="300" y="125" width="${barWidth}" height="${barHeight}" fill="${barBackgroundColor}" rx="10" />
            <rect x="300" y="125" width="${healthBarWidth}" height="${barHeight}" fill="${healthColor}" rx="10" />
            <text x="500" y="155" font-family="Arial, sans-serif" font-size="25" fill="${textColor}" text-anchor="middle">${player.health}%</text>

            <!-- Barre d'Énergie -->
            <text x="100" y="250" font-family="Arial, sans-serif" font-size="30" fill="${textColor}">⚡ Énergie</text>
            <rect x="300" y="225" width="${barWidth}" height="${barHeight}" fill="${barBackgroundColor}" rx="10" />
            <rect x="300" y="225" width="${energyBarWidth}" height="${barHeight}" fill="${energyColor}" rx="10" />
            <text x="500" y="255" font-family="Arial, sans-serif" font-size="25" fill="${textColor}" text-anchor="middle">${player.energy}%</text>

            <!-- Arme -->
            <text x="50%" y="350" font-family="Arial, sans-serif" font-size="30" fill="${textColor}" text-anchor="middle">🔫 Arme : ${player.weapon}</text>
        </svg>
        `;

        await sharp(Buffer.from(svgImage)).png().toFile(imagePath);
        return imagePath;
    }

    async function generateTireImage(shooterName, targetName) {
        const imagePath = path.join(__dirname, 'generated_images', `tire_${Date.now()}.png`);
        const outputDir = path.dirname(imagePath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const width = 800;
        const height = 400;

        const svgImage = `
        <svg width="${width}" height="${height}">
            <rect x="0" y="0" width="${width}" height="${height}" fill="#a00" />
            <text x="50%" y="50%" font-family="Impact, sans-serif" font-size="150" fill="#fff" text-anchor="middle" dominant-baseline="middle" transform="rotate(-10 400,200)">IMPACT!</text>
            <text x="50%" y="80%" font-family="Arial, sans-serif" font-size="30" fill="#fff" text-anchor="middle">${shooterName} a touché ${targetName}</text>
        </svg>
        `;

        await sharp(Buffer.from(svgImage)).png().toFile(imagePath);
        return imagePath;
    }

    async function generateMapImage(player) {
        const backgroundPath = path.join(__dirname, 'public', 'map_background_textured.png');
        const outputPath = path.join(__dirname, 'generated_images', `map_${player.jid}.png`);
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const TILE_SIZE = 100;

        // Coordonnées du centre du cercle
        const circleX = player.x * TILE_SIZE + TILE_SIZE / 2;
        const circleY = player.y * TILE_SIZE + TILE_SIZE / 2;

        const playerMarker = `
        <svg>
            <circle cx="${circleX}" cy="${circleY}" r="20" fill="red" stroke="white" stroke-width="3" />
        </svg>
        `;

        await sharp(backgroundPath)
            .composite([{ input: Buffer.from(playerMarker) }])
            .toFile(outputPath);

        return outputPath;
    }
    // --- FIN DE LA LOGIQUE DE GÉNÉRATION D'IMAGES ---


    // Gestion des messages entrants
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message) return; // Ignore les messages vides

        // Identifie l'expéditeur du message
        const sender = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.remoteJid);

        // S'assure que le joueur existe dans la base de données
        const player = getPlayer(sender);

        // --- GESTION DE LA MORT ET DE LA RÉAPPARITION ---
        if (player.isDead) {
            const timeSinceDeath = Date.now() - player.deathTimestamp;
            const respawnTime = 60 * 60 * 1000; // 1 heure

            if (timeSinceDeath >= respawnTime) {
                // Réapparition
                const db = getPlayersDatabase();
                db[sender].isDead = false;
                db[sender].health = 100;
                db[sender].deathTimestamp = null;
                savePlayersDatabase(db);
                broadcastGameState();
                await sock.sendMessage(sender, { text: "🎉 Vous êtes de retour ! Vous pouvez à nouveau jouer." });
            } else {
                // Supprime le message du joueur mort
                // NOTE : Le bot doit être administrateur pour que cela fonctionne !
                try {
                    const groupJid = msg.key.remoteJid;
                    const messageId = msg.key.id;
                    const senderJid = sender;

                    await sock.sendMessage(groupJid, {
                        delete: {
                            remoteJid: groupJid,
                            fromMe: false,
                            id: messageId,
                            participant: senderJid
                        }
                    });
                     console.log(`Message de l'utilisateur mort ${sender} supprimé.`);
                } catch (error) {
                    console.error("Erreur lors de la suppression du message. Le bot est-il administrateur ?", error);
                }
                return; // Bloque toute autre interaction
            }
        }
        // --- FIN DE LA GESTION DE LA MORT ---

        // --- GESTION DES COMMANDES ---
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageContent) return;

        const command = messageContent.split(' ')[0].toLowerCase();

        if (command === '/status') {
            // Ajoute le jid au player object pour la génération d'image
            player.jid = sender;
            const imagePath = await generateStatusImage(player);
            await sock.sendMessage(sender, {
                image: { url: imagePath },
                caption: `Voici un aperçu de votre situation actuelle.`
            });
            // Supprime l'image générée après l'envoi pour économiser de l'espace
            fs.unlinkSync(imagePath);
        }

        if (command === '/localisation') {
            const db = getPlayersDatabase();
            const currentPlayer = db[sender];
            const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'map.json'), 'utf8'));

            const { x, y } = currentPlayer;
            let response = `*📍 ANALYSE DE LA ZONE 📍*\n\n`;
            response += `*Vous êtes ici :* ${map.grid[y][x].description}\n\n`;
            response += `*Alentours :*\n`;

            // Nord
            response += `  - *Nord :* ${(y > 0) ? map.grid[y - 1][x].type : 'Impasse'}\n`;
            // Sud
            response += `  - *Sud :* ${(y < map.grid.length - 1) ? map.grid[y + 1][x].type : 'Impasse'}\n`;
            // Ouest
            response += `  - *Ouest :* ${(x > 0) ? map.grid[y][x - 1].type : 'Impasse'}\n`;
            // Est
            response += `  - *Est :* ${(x < map.grid[0].length - 1) ? map.grid[y][x + 1].type : 'Impasse'}\n`;

            await sock.sendMessage(sender, { text: response });
        }

        if (command === '/tire') {
            // Vérifie si le message est une réponse
            const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const targetJid = msg.message.extendedTextMessage?.contextInfo?.participant;

            if (!quotedMsg || !targetJid) {
                await sock.sendMessage(sender, { text: "❌ Pour tirer sur quelqu'un, vous devez répondre à l'un de ses messages avec la commande /tire." });
                return;
            }

            // Empêche de se tirer dessus
            if (targetJid === sender) {
                await sock.sendMessage(sender, { text: "😵 Vous ne pouvez pas vous tirer dessus !" });
                return;
            }

            const db = getPlayersDatabase();
            const targetPlayer = getPlayer(targetJid); // S'assure que la cible existe aussi

            const damage = 15; // Dégâts du pistolet de base
            db[targetJid].health -= damage;

            savePlayersDatabase(db);
            broadcastGameState();

            const shooterName = msg.pushName || sender.split('@')[0];
            const targetName = targetJid.split('@')[0]; // Simplifié pour l'instant
            const tireImagePath = await generateTireImage(shooterName, targetName);
            const phrases = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'phrases.json'), 'utf8'));
            const shootPhrases = phrases.shoot_hit;

            // Message pour le tireur
            let shooterCaption = shootPhrases.shooter[Math.floor(Math.random() * shootPhrases.shooter.length)];
            shooterCaption = shooterCaption.replace('{damage}', damage);
            await sock.sendMessage(sender, {
                image: { url: tireImagePath },
                caption: shooterCaption
            });

            // Message pour la cible
            let targetCaption = shootPhrases.target[Math.floor(Math.random() * shootPhrases.target.length)];
            targetCaption = targetCaption.replace('{damage}', damage).replace('{health}', db[targetJid].health);
            await sock.sendMessage(targetJid, {
                image: { url: tireImagePath },
                caption: targetCaption
            });

            fs.unlinkSync(tireImagePath); // Supprime l'image après utilisation

            // Vérifie si la cible est morte
            if (db[targetJid].health <= 0) {
                db[targetJid].isDead = true;
                db[targetJid].deathTimestamp = Date.now();
                savePlayersDatabase(db);
                broadcastGameState();

                // Annonce de la mort
                await sock.sendMessage(sender, { text: `🎉 Félicitations, vous avez éliminé votre adversaire !` });
                await sock.sendMessage(targetJid, { text: `💀 Vous avez été éliminé. Vous ne pourrez plus envoyer de commandes pendant 1 heure.` });
            }
        }

        // --- COMMANDE DE DÉPLACEMENT ---
        if (command === '/move') {
            const direction = messageContent.split(' ')[1]?.toLowerCase();
            if (!direction || !['nord', 'sud', 'est', 'ouest'].includes(direction)) {
                await sock.sendMessage(sender, { text: "❌ Direction invalide. Utilisez /move <nord|sud|est|ouest>." });
                return;
            }

            const db = getPlayersDatabase();
            const currentPlayer = db[sender];
            const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'map.json'), 'utf8'));

            let newX = currentPlayer.x;
            let newY = currentPlayer.y;

            if (direction === 'nord') newY--;
            if (direction === 'sud') newY++;
            if (direction === 'ouest') newX--;
            if (direction === 'est') newX++;

            // Vérifie les limites de la carte
            if (newY < 0 || newY >= map.grid.length || newX < 0 || newX >= map.grid[0].length) {
                await sock.sendMessage(sender, { text: "🚫 Vous ne pouvez pas aller par là. C'est une impasse." });
                return;
            }

            // Met à jour la position et l'énergie
            currentPlayer.x = newX;
            currentPlayer.y = newY;
            currentPlayer.energy = Math.max(0, currentPlayer.energy - 5); // Coût du déplacement
            savePlayersDatabase(db);
            broadcastGameState();

            // --- Logique de message immersif ---
            const phrases = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'phrases.json'), 'utf8'));
            const movePhrases = phrases.move;
            const newLocation = map.grid[newY][newX];

            let moveMessage = movePhrases.default[Math.floor(Math.random() * movePhrases.default.length)];
            moveMessage = moveMessage.replace('{direction}', direction);

            if (movePhrases[newLocation.type]) {
                const specificPhrase = movePhrases[newLocation.type][Math.floor(Math.random() * movePhrases[newLocation.type].length)];
                moveMessage += `\n\n${specificPhrase}`;
            }

            await sock.sendMessage(sender, { text: `${moveMessage}\n\n📍 ${newLocation.description}` });
        }

        if (command === '/map') {
            player.jid = sender;
            const mapImagePath = await generateMapImage(player);
            await sock.sendMessage(sender, {
                image: { url: mapImagePath },
                caption: "Voici votre position actuelle sur la carte."
            });
            fs.unlinkSync(mapImagePath);
        }
        // --- FIN DE LA GESTION DES COMMANDES ---
    });
}

// Lancer le bot
connectToWhatsApp().catch(err => console.log("Erreur inattendue : " + err));
