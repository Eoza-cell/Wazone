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
const GENERATED_IMAGES_DIR = './generated_images/';

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR);
if (!fs.existsSync(GENERATED_IMAGES_DIR)) fs.mkdirSync(GENERATED_IMAGES_DIR);
if (!fs.existsSync(path.dirname(PLAYERS_FILE))) fs.mkdirSync(path.dirname(PLAYERS_FILE), { recursive: true });
if (!fs.existsSync(PLAYERS_FILE)) fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}));


let players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));

function savePlayers() {
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2));
}

function getPlayer(id) {
    if (!players[id]) {
        players[id] = {
            id: id, name: '', health: 100, energy: 100,
            weapon: 'Pistolet simple', lastDeath: null, messageCount: 0
        };
        savePlayers();
    }
    return players[id];
}

async function generateStatusImage(player) {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `${player.id}.png`);
    const svg = `
    <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#333"/>
      <text x="20" y="40" font-family="Arial" font-size="24" fill="white">Statut de ${player.name}</text>
      <text x="20" y="80" font-family="Arial" font-size="16" fill="white">Vie:</text>
      <rect x="80" y="65" width="300" height="20" fill="#555"/>
      <rect x="80" y="65" width="${player.health * 3}" height="20" fill="green"/>
      <text x="385" y="82" text-anchor="end" font-family="Arial" font-size="16" fill="white">${player.health}%</text>
      <text x="20" y="120" font-family="Arial" font-size="16" fill="white">Énergie:</text>
      <rect x="80" y="105" width="300" height="20" fill="#555"/>
      <rect x="80" y="105" width="${player.energy * 3}" height="20" fill="blue"/>
      <text x="385" y="122" text-anchor="end" font-family="Arial" font-size="16" fill="white">${player.energy}%</text>
      <text x="20" y="160" font-family="Arial" font-size="16" fill="white">Arme: ${player.weapon}</text>
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
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
        version: [2, 3000, 1025190524],
        getMessage: async key => {
            console.log('⚠️ Message non déchiffré, retry demandé:', key);
            return { conversation: '🔄 Réessaye d\'envoyer ton message' };
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if(qr) {
            console.log('QR code généré, envoi au site web.');
            io.emit('qrCode', { qr: qr });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('Connexion fermée:', lastDisconnect.error, ', reconnexion:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Connexion ouverte !');
            io.emit('connectionSuccess');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const senderId = msg.key.remoteJid;
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
                await sock.sendMessage(senderId, { text: `🧟‍♂️ Vous êtes de retour parmi les vivants !` });
            }
        }

        const args = messageContent.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (messageContent.startsWith('/')) {
            switch(command) {
                case 'statut':
                    const statusImagePath = await generateStatusImage(player);
                    await sock.sendMessage(senderId, { image: { url: statusImagePath }, caption: `Voici votre statut actuel, ${player.name}.`});
                    break;
                case 'tire':
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant;
                    if (!targetId) return await sock.sendMessage(senderId, { text: '❌ Pour tirer, vous devez répondre au message d\'un adversaire.' });
                    if (targetId === senderId) return await sock.sendMessage(senderId, { text: '❌ Vous ne pouvez pas vous tirer dessus !' });

                    const target = getPlayer(targetId);
                    target.health -= 15;
                    player.energy -= 5;

                    if (target.health <= 0) {
                        target.health = 0;
                        target.lastDeath = Date.now();
                        await sock.sendMessage(senderId, { text: `💥 Vous avez abattu ${target.name} !` });
                        await sock.sendMessage(targetId, { text: `☠️ ${player.name} vous a tué. Vous ne pourrez plus parler pendant 1 heure.` });
                    } else {
                        await sock.sendMessage(senderId, { text: `💥 Vous avez touché ${target.name} ! Il lui reste ${target.health}% de vie.` });
                        await sock.sendMessage(targetId, { text: `🤕 ${player.name} vous a tiré dessus ! Il vous reste ${target.health}% de vie.` });
                    }
                    savePlayers();
                    break;
                case 'regles': await sock.sendMessage(senderId, { text: '📜 Règles du jeu : ... (à définir)' }); break;
                case 'missions': await sock.sendMessage(senderId, { text: '📋 Missions disponibles : ... (à définir)' }); break;
                case 'lieux': await sock.sendMessage(senderId, { text: '🗺️ Lieux explorables : ... (à définir)' }); break;
                case 'events': await sock.sendMessage(senderId, { text: '🎉 Événements en cours : ... (à définir)' }); break;
                case 'armes': await sock.sendMessage(senderId, { text: '🔫 Catalogue d\'armes : Pistolet simple (dégâts: 15)' }); break;
            }
        }
    });
}

connectToWhatsApp().catch(err => console.error("Erreur inattendue : ", err));
