const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sharp = require('sharp');
const qrcode = require('qrcode');

// --- CONFIGURATION DU SERVEUR WEB ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Autoriser toutes les origines. Pour une sécurité renforcée, remplacez "*" par l'URL de votre site web.
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Indispensable pour les environnements avec proxy comme Render
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
    console.log(`Le serveur web est en écoute sur http://localhost:${PORT}`);
});
// --- FIN DE LA CONFIGURATION ---

const AUTH_DIR = './auth_info_baileys/';
const PLAYERS_FILE = './data/players.json';
const EQUIPMENT_FILE = './equipment.json';
const GENERATED_IMAGES_DIR = './generated_images/';

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR);
if (!fs.existsSync(GENERATED_IMAGES_DIR)) fs.mkdirSync(GENERATED_IMAGES_DIR);
if (!fs.existsSync(path.dirname(PLAYERS_FILE))) fs.mkdirSync(path.dirname(PLAYERS_FILE), { recursive: true });
if (!fs.existsSync(PLAYERS_FILE)) fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}));
if (!fs.existsSync(EQUIPMENT_FILE)) fs.writeFileSync(EQUIPMENT_FILE, JSON.stringify({}));


let players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
const equipment = JSON.parse(fs.readFileSync(EQUIPMENT_FILE, 'utf8'));

function savePlayers() {
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2));
}

function getPlayer(id) {
    if (!players[id]) {
        players[id] = {
            id: id, name: '', health: 100, energy: 100,
            weapon: 'Pistolet simple', lastDeath: null, messageCount: 0,
            equipment: {
                helmet: null,
                vest: null,
                boots: null
            }
        };
        savePlayers();
    }
    return players[id];
}

async function generateStatusImage(player) {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `${player.id}.png`);
    const healthColor = player.health > 50 ? '#2ecc71' : (player.health > 20 ? '#f1c40f' : '#c0392b');
    const energyColor = '#3498db';

    const svg = `
    <svg width="500" height="250" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <style>
                .background { fill: #1C1C1C; }
                .name { font-family: monospace; font-size: 28px; fill: #EAEAEA; text-transform: uppercase; }
                .label { font-family: monospace; font-size: 18px; fill: #f1c40f; text-transform: uppercase; }
                .value { font-family: monospace; font-size: 16px; fill: #EAEAEA; }
                .bar-bg { fill: #333; }
            </style>
        </defs>

        <rect width="100%" height="100%" class="background" />

        <!-- Cadre et lignes de style -->
        <rect x="5" y="5" width="490" height="240" fill="none" stroke="#7f8c8d" stroke-width="1" stroke-opacity="0.5"/>
        <path d="M15 30 V15 H30" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <path d="M485 30 V15 H470" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <path d="M15 220 V235 H30" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <path d="M485 220 V235 H470" stroke="#f1c40f" stroke-width="2" fill="none"/>

        <text x="30" y="45" class="name">${player.name}</text>

        <!-- Barre de vie -->
        <text x="30" y="90" class="label">Santé</text>
        <rect x="30" y="100" width="440" height="25" class="bar-bg" />
        <rect x="30" y="100" width="${player.health * 4.4}" height="25" fill="${healthColor}" />
        <text x="465" y="118" text-anchor="end" class="value">${player.health}%</text>

        <!-- Barre d'énergie -->
        <text x="30" y="155" class="label">Énergie</text>
        <rect x="30" y="165" width="440" height="25" class="bar-bg" />
        <rect x="30" y="165" width="${player.energy * 4.4}" height="25" fill="${energyColor}" />
        <text x="465" y="183" text-anchor="end" class="value">${player.energy}%</text>

        <!-- Arme équipée -->
        <text x="30" y="220" class="label">Arme: <tspan class="value">${player.weapon}</tspan></text>
    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

async function generateMenuImage() {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `menu.png`);
    const svg = `
    <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .title { font-family: monospace; font-size: 32px; fill: #f1c40f; text-transform: uppercase; }
          .command { font-family: monospace; font-size: 20px; fill: #e0e0e0; }
          .desc { font-family: monospace; font-size: 14px; fill: #7f8c8d; }
        </style>
      </defs>

      <rect width="100%" height="100%" fill="#1a1a1a"/>

      <!-- Cadre stylisé -->
      <path d="M10 20 V10 H20" stroke="#c0392b" stroke-width="2" fill="none"/>
      <path d="M590 20 V10 H580" stroke="#c0392b" stroke-width="2" fill="none"/>
      <path d="M10 380 V390 H20" stroke="#c0392b" stroke-width="2" fill="none"/>
      <path d="M590 380 V390 H580" stroke="#c0392b" stroke-width="2" fill="none"/>

      <text x="300" y="50" text-anchor="middle" class="title">WAZONE BOT // COMMANDES</text>

      <!-- Colonne 1 -->
      <text x="50" y="110" class="command">/statut</text>
      <text x="50" y="130" class="desc">Affiche votre état actuel (vie, énergie).</text>

      <text x="50" y="180" class="command">/tire</text>
      <text x="50" y="200" class="desc">Tire sur un adversaire (en réponse).</text>

      <text x="50" y="250" class="command">/armes</text>
      <text x="50" y="270" class="desc">Affiche le catalogue des armes.</text>

      <text x="50" y="320" class="command">/regles</text>
      <text x="50" y="340" class="desc">Voir les règles du jeu.</text>

      <!-- Colonne 2 -->
      <text x="320" y="110" class="command">/missions</text>
      <text x="320" y="130" class="desc">Liste des missions disponibles.</text>

      <text x="320" y="180" class="command">/lieux</text>
      <text x="320" y="200" class="desc">Explorez les lieux connus.</text>

      <text x="320" y="250" class="command">/events</text>
      <text x="320" y="270" class="desc">Consultez les événements en cours.</text>

    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Utilisation de Baileys v${version.join('.')}, dernière version: ${isLatest}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
        version,
        getMessage: async key => {
            console.log('⚠️ Message non déchiffré, retry demandé:', key);
            return { conversation: '🔄 Réessaye d\'envoyer ton message' };
        }
    });

    // Logique de Jumelage (Pairing Code)
    // Si nous ne sommes pas déjà authentifiés, nous demandons un code de jumelage.
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            // Le numéro de téléphone est récupéré depuis les variables d'environnement pour des raisons de sécurité.
            const phoneNumber = process.env.PHONE_NUMBER;

            if (!phoneNumber) {
                const message = 'ERREUR CRITIQUE: La variable d\'environnement PHONE_NUMBER n\'est pas définie. Le bot ne peut pas demander de code de jumelage.';
                console.error(message);
                io.emit('error', message);
                return;
            }

            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`Votre code de jumelage est: ${code}`);
                // Nous envoyons le code au frontend pour qu'il puisse l'afficher.
                io.emit('pairingCode', { code });
            } catch (error) {
                console.error('Erreur lors de la demande du code de jumelage:', error);
                io.emit('error', 'Impossible de générer le code de jumelage. Vérifiez le numéro de téléphone dans bot.js.');
            }
        }, 3000); // Petit délai pour s'assurer que tout est initialisé.
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('Connexion fermée:', lastDisconnect.error, ', reconnexion:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Connexion ouverte et réussie !');
            // Informer le client que la connexion est un succès.
            io.emit('connectionSuccess');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        // --- Gestion des groupes ---
        const isGroup = msg.key.remoteJid.endsWith('@g.us');
        const senderId = isGroup ? (msg.key.participant || msg.participant) : msg.key.remoteJid;
        const chatId = msg.key.remoteJid;
        // --- Fin de la gestion ---

        // On ignore les messages de statut et les messages qui ne viennent pas d'un utilisateur
        if (!senderId) return;

        const player = getPlayer(senderId);
        if (!player.name) player.name = msg.pushName || 'Inconnu';

        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (player.lastDeath) {
            const timeSinceDeath = Date.now() - player.lastDeath;
            if (timeSinceDeath < 3600000) { // 1 heure
                return;
            } else {
                player.lastDeath = null;
                player.health = 100;
                player.energy = 100;
                savePlayers();
                await sock.sendMessage(chatId, { text: `🧟‍♂️ Vous êtes de retour parmi les vivants !` });
            }
        }

        const args = messageContent.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (messageContent.startsWith('/')) {
            switch(command) {
                case 'menu':
                case 'aide':
                    const menuImagePath = await generateMenuImage();
                    await sock.sendMessage(chatId, { image: { url: menuImagePath }, caption: "Voici la liste des commandes disponibles."});
                    break;
                case 'statut':
                    const statusImagePath = await generateStatusImage(player);
                    let equipmentText = `\n\n*Équipement:*\nCasque: ${player.equipment.helmet || 'Aucun'}\nGilet: ${player.equipment.vest || 'Aucun'}\nBottes: ${player.equipment.boots || 'Aucun'}`;
                    await sock.sendMessage(chatId, { image: { url: statusImagePath }, caption: `Voici votre statut actuel, ${player.name}.${equipmentText}`});
                    break;
                case 'tire':
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant;
                    if (!targetId) return await sock.sendMessage(chatId, { text: "❌ Pour tirer, vous devez répondre au message d'un adversaire." });
                    if (targetId === senderId) return await sock.sendMessage(chatId, { text: "❌ Vous ne pouvez pas vous tirer dessus !" });

                    const target = getPlayer(targetId);

                    let totalProtection = 0;
                    if (target.equipment.helmet) {
                        const helmet = equipment.helmets.find(h => h.name === target.equipment.helmet);
                        if (helmet) totalProtection += helmet.protection;
                    }
                    if (target.equipment.vest) {
                        const vest = equipment.vests.find(v => v.name === target.equipment.vest);
                        if (vest) totalProtection += vest.protection;
                    }
                    if (target.equipment.boots) {
                        const boots = equipment.boots.find(b => b.name === target.equipment.boots);
                        if (boots) totalProtection += boots.protection;
                    }

                    const baseDamage = 15;
                    const damageDealt = Math.max(0, baseDamage - totalProtection);

                    target.health -= damageDealt;
                    player.energy -= 5;

                    if (target.health <= 0) {
                        target.health = 0;
                        target.lastDeath = Date.now();
                        await sock.sendMessage(chatId, { text: `💥 Vous avez abattu ${target.name} !` });
                        await sock.sendMessage(targetId, { text: `☠️ ${player.name} vous a tué. Vous ne pourrez plus parler pendant 1 heure.` });
                    } else {
                        await sock.sendMessage(chatId, { text: `💥 Vous avez infligé ${damageDealt} points de dégâts à ${target.name} ! Il lui reste ${target.health}% de vie.` });
                        await sock.sendMessage(targetId, { text: `🤕 ${player.name} vous a tiré dessus et vous a infligé ${damageDealt} points de dégâts ! Il vous reste ${target.health}% de vie.` });
                    }
                    savePlayers();
                    break;
                case 'regles': await sock.sendMessage(chatId, { text: "📜 Règles du jeu : ... (à définir)" }); break;
                case 'missions': await sock.sendMessage(chatId, { text: "📋 Missions disponibles : ... (à définir)" }); break;
                case 'lieux': await sock.sendMessage(chatId, { text: "🗺️ Lieux explorables : ... (à définir)" }); break;
                case 'events': await sock.sendMessage(chatId, { text: "🎉 Événements en cours : ... (à définir)" }); break;
                case 'armes': await sock.sendMessage(chatId, { text: "🔫 Catalogue d'armes : Pistolet simple (dégâts: 15)" }); break;
                case 'equiper':
                    const equipmentName = args.join(' ');
                    if (!equipmentName) return await sock.sendMessage(chatId, { text: "❌ Veuillez spécifier le nom de l'équipement. Exemple : /equiper Casque de combat" });

                    let itemFound = false;
                    for (const category in equipment) {
                        const item = equipment[category].find(i => i.name.toLowerCase() === equipmentName.toLowerCase());
                        if (item) {
                            player.equipment[category.slice(0, -1)] = item.name;
                            itemFound = true;
                            break;
                        }
                    }

                    if (itemFound) {
                        savePlayers();
                        await sock.sendMessage(chatId, { text: `✅ Vous avez équipé : ${equipmentName}` });
                    } else {
                        await sock.sendMessage(chatId, { text: "❌ Équipement non trouvé." });
                    }
                    break;
                case 'inventaire':
                    const inventory = player.equipment;
                    let inventoryMessage = `🎒 Votre inventaire :\n`;
                    inventoryMessage += `Casque : ${inventory.helmet || 'Aucun'}\n`;
                    inventoryMessage += `Gilet : ${inventory.vest || 'Aucun'}\n`;
                    inventoryMessage += `Bottes : ${inventory.boots || 'Aucun'}`;
                    await sock.sendMessage(chatId, { text: inventoryMessage });
                    break;
            }
        }
    });
}

connectToWhatsApp().catch(err => console.error("Erreur inattendue : ", err));
