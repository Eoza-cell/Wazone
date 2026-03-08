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
            id: id,
            name: '',
            points: 1000,
            role: 'élève',
            status: 'inscrit',
            lastExam: 0,
            lastGoodAction: 0,
            messageCount: 0
        };
        savePlayers();
    }
    return players[id];
}

function updatePoints(player, amount) {
    player.points += amount;
    if (player.points <= 0) {
        player.points = 0;
        player.status = 'expulsé';
        return true; // Expulsé
    }
    if (player.points > 0 && player.status === 'expulsé') {
        player.status = 'inscrit';
    }
    return false;
}

async function generateStatusImage(player) {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `${player.id}.png`);
    const pointPercent = Math.min(100, (player.points / 2000) * 100);
    const pointColor = player.points > 500 ? '#2ecc71' : (player.points > 100 ? '#f1c40f' : '#c0392b');

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
        <text x="470" y="45" text-anchor="end" class="label" style="fill: #7f8c8d; font-size: 14px;">[ ${player.role.toUpperCase()} ]</text>

        <!-- Barre de points -->
        <text x="30" y="100" class="label">Points Privés</text>
        <rect x="30" y="110" width="440" height="25" class="bar-bg" />
        <rect x="30" y="110" width="${pointPercent * 4.4}" height="25" fill="${pointColor}" />
        <text x="465" y="128" text-anchor="end" class="value">${player.points} pts</text>

        <!-- Statut -->
        <text x="30" y="170" class="label">Statut: <tspan class="value" style="fill: ${player.status === 'expulsé' ? '#c0392b' : '#2ecc71'}">${player.status.toUpperCase()}</tspan></text>
    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

async function generateMenuImage() {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `menu.png`);
    const svg = `
    <svg width="600" height="500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .title { font-family: monospace; font-size: 32px; fill: #f1c40f; text-transform: uppercase; }
          .command { font-family: monospace; font-size: 20px; fill: #e0e0e0; }
          .desc { font-family: monospace; font-size: 14px; fill: #7f8c8d; }
          .category { font-family: monospace; font-size: 18px; fill: #c0392b; text-transform: uppercase; font-weight: bold; }
        </style>
      </defs>

      <rect width="100%" height="100%" fill="#1a1a1a"/>

      <!-- Cadre stylisé -->
      <path d="M10 20 V10 H20" stroke="#c0392b" stroke-width="2" fill="none"/>
      <path d="M590 20 V10 H580" stroke="#c0392b" stroke-width="2" fill="none"/>
      <path d="M10 480 V490 H20" stroke="#c0392b" stroke-width="2" fill="none"/>
      <path d="M590 480 V490 H580" stroke="#c0392b" stroke-width="2" fill="none"/>

      <text x="300" y="50" text-anchor="middle" class="title">COTE RP // COMMANDES</text>

      <!-- ÉLÈVES -->
      <text x="40" y="100" class="category">>> ÉLÈVES</text>
      <text x="50" y="130" class="command">/statut</text>
      <text x="50" y="145" class="desc">Affiche vos points et votre rôle.</text>

      <text x="50" y="180" class="command">/examen</text>
      <text x="50" y="195" class="desc">Passez un examen pour gagner des points.</text>

      <text x="50" y="230" class="command">/bonneaction</text>
      <text x="50" y="245" class="desc">Aidez un camarade pour +10 pts.</text>

      <!-- STAFF -->
      <text x="40" y="300" class="category">>> ADMINISTRATION</text>
      <text x="50" y="330" class="command">/donnerpoints [mention/réponse] [montant]</text>
      <text x="50" y="345" class="desc">Accorder des points à un élève.</text>

      <text x="50" y="380" class="command">/enleverpoints [mention/réponse] [montant]</text>
      <text x="50" y="395" class="desc">Sanctionner un élève par un retrait de points.</text>

      <text x="50" y="430" class="command">/expulser [mention/réponse]</text>
      <text x="50" y="445" class="desc">Renvoyer définitivement un élève.</text>

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

        if (player.status === 'expulsé') {
            return; // Les élèves expulsés ne peuvent plus interagir avec le bot
        }

        const args = messageContent.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (messageContent.startsWith('/')) {
            switch(command) {
                case 'menu':
                case 'aide':
                    const menuImagePath = await generateMenuImage();
                    await sock.sendMessage(chatId, { image: { url: menuImagePath }, caption: "Bienvenue sur l'interface du Lycée Kōdo Ikusei."});
                    break;
                case 'statut':
                    const statusImagePath = await generateStatusImage(player);
                    await sock.sendMessage(chatId, { image: { url: statusImagePath }, caption: `Profil de l'élève ${player.name}.`});
                    break;
                case 'examen': {
                    const now = Date.now();
                    if (now - player.lastExam < 3600000) {
                        const remaining = Math.ceil((3600000 - (now - player.lastExam)) / 60000);
                        return await sock.sendMessage(chatId, { text: `⏳ Vous avez déjà passé un examen récemment. Réessayez dans ${remaining} minutes.` });
                    }
                    const grade = Math.floor(Math.random() * 100) + 1;
                    const pointsEarned = grade * 2;
                    updatePoints(player, pointsEarned);
                    player.lastExam = now;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `📝 *EXAMEN:* Vous avez obtenu la note de ${grade}/100 !\n📈 +${pointsEarned} points privés.` });
                    break;
                }
                case 'bonneaction': {
                    const now = Date.now();
                    if (now - player.lastGoodAction < 1800000) {
                        const remaining = Math.ceil((1800000 - (now - player.lastGoodAction)) / 60000);
                        return await sock.sendMessage(chatId, { text: `⏳ L'altruisme a ses limites. Réessayez dans ${remaining} minutes.` });
                    }
                    updatePoints(player, 10);
                    player.lastGoodAction = now;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `🤝 *BONNE ACTION:* Vous avez aidé un camarade.\n📈 +10 points privés.` });
                    break;
                }
                case 'donnerpoints': {
                    if (player.role === 'élève') return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut distribuer des points." });
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    const amount = parseInt(msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? args[1] : args[0]);
                    if (!targetId || isNaN(amount)) return await sock.sendMessage(chatId, { text: "❌ Usage: /donnerpoints [mention/réponse] [montant]" });

                    const target = getPlayer(targetId);
                    const wasExpelled = target.status === 'expulsé';
                    updatePoints(target, amount);
                    savePlayers();
                    let msgText = `✅ ${player.role} ${player.name} a accordé ${amount} points à ${target.name}.`;
                    if (wasExpelled && target.status === 'inscrit') {
                        msgText += `\n🎓 *RÉINTÉGRATION:* L'élève a été réintégré.`;
                    }
                    await sock.sendMessage(chatId, { text: msgText });
                    break;
                }
                case 'enleverpoints': {
                    if (player.role === 'élève') return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut retirer des points." });
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    const amount = parseInt(msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? args[1] : args[0]);
                    if (!targetId || isNaN(amount)) return await sock.sendMessage(chatId, { text: "❌ Usage: /enleverpoints [mention/réponse] [montant]" });

                    const target = getPlayer(targetId);
                    const isExpelled = updatePoints(target, -amount);

                    let expulsionMsg = "";
                    if (isExpelled) {
                        expulsionMsg = `\n🚫 *EXPULSION:* ${target.name} a atteint 0 point et est expulsé de l'établissement.`;
                    }

                    savePlayers();
                    await sock.sendMessage(chatId, { text: `⚠️ ${player.role} ${player.name} a retiré ${amount} points à ${target.name}.${expulsionMsg}` });
                    break;
                }
                case 'expulser': {
                    if (player.role === 'élève') return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut expulser un élève." });
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (!targetId) return await sock.sendMessage(chatId, { text: "❌ Usage: /expulser [mention/réponse]" });

                    const target = getPlayer(targetId);
                    target.points = 0;
                    target.status = 'expulsé';
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `🚫 *EXPULSION:* ${target.name} a été expulsé par ${player.role} ${player.name}.` });
                    break;
                }
                case 'promouvoir': {
                    // Seul le numéro configuré ou le premier admin peut promouvoir
                    if (player.role !== 'principal' && senderId !== process.env.PHONE_NUMBER + '@s.whatsapp.net') {
                        return await sock.sendMessage(chatId, { text: "❌ Seul le Principal peut promouvoir quelqu'un." });
                    }
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    const newRole = msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? args[1] : args[0];
                    if (!targetId || !['professeur', 'principal'].includes(newRole)) return await sock.sendMessage(chatId, { text: "❌ Usage: /promouvoir [mention/réponse] [professeur/principal]" });

                    const target = getPlayer(targetId);
                    target.role = newRole;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `🎓 ${target.name} a été promu au rang de ${newRole}.` });
                    break;
                }
                case 'regles': await sock.sendMessage(chatId, { text: "📜 Lycée Kōdo Ikusei - Règlement :\n1. Le mérite est la seule valeur.\n2. Si vos points tombent à zéro, vous êtes expulsé.\n3. Le respect du staff est obligatoire." }); break;
            }
        }
    });
}

connectToWhatsApp().catch(err => console.error("Erreur inattendue : ", err));
