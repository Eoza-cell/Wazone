const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const axios = require('axios');
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
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

let lastQR = null;
let currentStatus = 'INITIALISATION...';

server.listen(PORT, () => {
    console.log(`Le serveur web est en écoute sur http://localhost:${PORT}`);
});

io.on('connection', (socket) => {
    console.log('[Socket.IO] Client connecté.');
    if (lastQR) socket.emit('qrCode', { url: lastQR });
    socket.emit('statusUpdate', currentStatus);

    socket.on('clearSession', () => {
        console.log('[Neox Liaison] Demande de réinitialisation de session.');
        try {
            if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                console.log('[Neox Liaison] Session supprimée. Redémarrage...');
                process.exit(0); // Le serveur doit être redémarré (par exemple via PM2 ou Render)
            }
        } catch (e) {
            console.error('[Neox Liaison Error] Échec de la suppression:', e);
        }
    });
});
// --- FIN DE LA CONFIGURATION ---

const AUTH_DIR = './auth_info_baileys/';
const PLAYERS_FILE = './data/players.json';
const EQUIPMENT_FILE = './equipment.json';
const GENERATED_IMAGES_DIR = './generated_images/';
const CHAT_HISTORY_FILE = './data/chat_history.json';
const OWNER_ID = process.env.OWNER_ID || '22663685468@s.whatsapp.net';

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR);
if (!fs.existsSync(GENERATED_IMAGES_DIR)) fs.mkdirSync(GENERATED_IMAGES_DIR);
if (!fs.existsSync(path.dirname(PLAYERS_FILE))) fs.mkdirSync(path.dirname(PLAYERS_FILE), { recursive: true });
if (!fs.existsSync(PLAYERS_FILE)) fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}));
if (!fs.existsSync(EQUIPMENT_FILE)) fs.writeFileSync(EQUIPMENT_FILE, JSON.stringify({}));
if (!fs.existsSync(CHAT_HISTORY_FILE)) fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify({}));


let players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
let chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));

function saveChatHistory() {
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
}
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
                .background { fill: #1a0a0a; }
                .name { font-family: monospace; font-size: 28px; fill: #ff4d4d; text-transform: uppercase; font-weight: bold; }
                .label { font-family: monospace; font-size: 18px; fill: #ff9999; text-transform: uppercase; }
                .value { font-family: monospace; font-size: 16px; fill: #EAEAEA; }
                .bar-bg { fill: #331a1a; }
            </style>
        </defs>

        <rect width="100%" height="100%" class="background" />

        <rect x="5" y="5" width="490" height="240" fill="none" stroke="#660000" stroke-width="1" stroke-opacity="0.5"/>
        <path d="M15 30 V15 H30" stroke="#ff4d4d" stroke-width="2" fill="none"/>
        <path d="M485 30 V15 H470" stroke="#ff4d4d" stroke-width="2" fill="none"/>
        <path d="M15 220 V235 H30" stroke="#ff4d4d" stroke-width="2" fill="none"/>
        <path d="M485 220 V235 H470" stroke="#ff4d4d" stroke-width="2" fill="none"/>

        <text x="30" y="45" class="name">${player.name}</text>
        <text x="470" y="45" text-anchor="end" font-family="monospace" font-size="12" fill="#7f8c8d">NEOX OS // NEOVERSE</text>

        <text x="30" y="90" class="label">Santé</text>
        <rect x="30" y="100" width="440" height="25" class="bar-bg" />
        <rect x="30" y="100" width="${player.health * 4.4}" height="25" fill="${healthColor}" />
        <text x="465" y="118" text-anchor="end" class="value">${player.health}%</text>

        <text x="30" y="155" class="label">Énergie</text>
        <rect x="30" y="165" width="440" height="25" class="bar-bg" />
        <rect x="30" y="165" width="${player.energy * 4.4}" height="25" fill="${energyColor}" />
        <text x="465" y="183" text-anchor="end" class="value">${player.energy}%</text>

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
          .title { font-family: monospace; font-size: 32px; fill: #ff4d4d; text-transform: uppercase; font-weight: bold; }
          .command { font-family: monospace; font-size: 20px; fill: #ffcccc; }
          .desc { font-family: monospace; font-size: 14px; fill: #996666; }
        </style>
      </defs>

      <rect width="100%" height="100%" fill="#1a0a0a"/>

      <path d="M10 20 V10 H20" stroke="#ff4d4d" stroke-width="2" fill="none"/>
      <path d="M590 20 V10 H580" stroke="#ff4d4d" stroke-width="2" fill="none"/>
      <path d="M10 380 V390 H20" stroke="#ff4d4d" stroke-width="2" fill="none"/>
      <path d="M590 380 V390 H580" stroke="#ff4d4d" stroke-width="2" fill="none"/>

      <text x="300" y="50" text-anchor="middle" class="title">NEOX // GESTION NEOVERSE</text>

      <text x="50" y="110" class="command">/statut</text>
      <text x="50" y="130" class="desc">Affiche votre état actuel (vie, énergie).</text>

      <text x="50" y="180" class="command">/tire</text>
      <text x="50" y="200" class="desc">Tire sur un adversaire (en réponse).</text>

      <text x="50" y="250" class="command">/armes</text>
      <text x="50" y="270" class="desc">Affiche le catalogue des armes.</text>

      <text x="50" y="320" class="command">/regles</text>
      <text x="50" y="340" class="desc">Voir les règles du jeu.</text>

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
    console.log(`[Neox] Baileys v${version.join('.')}, latest: ${isLatest}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Log in console for debug
        browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
        version: version, // Use latest version
        logger: pino({ level: 'silent' }),
        getMessage: async key => {
            return { conversation: '🔄 Réessaye d\'envoyer ton message' };
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentStatus = 'PROTOCOLE QR PRÊT';
            qrcode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error('[Neox Liaison Error] Échec QR:', err);
                } else {
                    console.log('[Neox Liaison] Nouveau QR Code généré.');
                    lastQR = url;
                    io.emit('qrCode', { url });
                    io.emit('statusUpdate', currentStatus);
                }
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log(`[Neox Liaison] Connexion fermée. Reconnexion: ${shouldReconnect}`);
            currentStatus = 'Connexion interrompue. Reconnexion...';
            io.emit('statusUpdate', currentStatus);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ [Neox Liaison] Liaison Neoverse établie avec succès !');
            lastQR = null;
            currentStatus = 'Liaison Neoverse établie avec succès !';
            io.emit('connectionSuccess');
            io.emit('statusUpdate', currentStatus);
        } else if (connection === 'connecting') {
            currentStatus = 'Initialisation des protocoles de liaison...';
            io.emit('statusUpdate', currentStatus);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const isGroup = msg.key.remoteJid.endsWith('@g.us');
        const senderId = isGroup ? (msg.key.participant || msg.participant) : msg.key.remoteJid;
        const chatId = msg.key.remoteJid;

        if (!senderId) return;

        const player = getPlayer(senderId);
        if (!player.name) player.name = msg.pushName || 'Inconnu';

        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (player.lastDeath) {
            const timeSinceDeath = Date.now() - player.lastDeath;
            if (timeSinceDeath < 3600000) return;
            player.lastDeath = null; player.health = 100; player.energy = 100;
            savePlayers();
            await sock.sendMessage(chatId, { text: `🧟‍♂️ Vous êtes de retour !` });
        }

        const args = messageContent.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (!messageContent.startsWith('/') && (isGroup ? (messageContent.toLowerCase().includes('neox') || messageContent.toLowerCase().includes('makima')) : true)) {
            const prompt = messageContent;

            if (!chatHistory[chatId]) chatHistory[chatId] = [];
            chatHistory[chatId].push({ role: "user", content: prompt });

            // On garde les 10 derniers messages pour le contexte
            if (chatHistory[chatId].length > 10) chatHistory[chatId].shift();

            try {
                let contextInfo = `Tu es Neox, l'IA gérante centrale du Neoverse. Ton ton est humain, empathique mais ferme et autoritaire. Tu es le GÉRANT.
                Tu peux exécuter des actions via: [ACTION: setname Nom], [ACTION: setbio Bio], [ACTION: setpp URL], [ACTION: kick ID], [ACTION: add Numéro], [ACTION: promote ID], [ACTION: demote ID], [ACTION: link].
                Infos actuelles:
                - Chat ID: ${chatId}
                - Expéditeur: ${senderId}
                - Est un groupe: ${isGroup ? 'Oui' : 'Non'}`;

                const response = await axios.post('https://gen.pollinations.ai/v1/chat/completions', {
                    messages: [
                        { role: "system", content: contextInfo + "\nRéponds toujours en français fluide. Cache les balises ACTION." },
                        ...chatHistory[chatId]
                    ],
                    model: "claude-fast"
                });

                let aiReply = response.data.choices[0].message.content;

                // --- Logique d'Exécution d'Actions par l'IA ---
                if (aiReply.includes("[ACTION:")) {
                    const actionMatch = aiReply.match(/\[ACTION:\s*(\w+)\s*(.*?)\]/);
                    if (actionMatch) {
                        const action = actionMatch[1].toLowerCase();
                        const param = actionMatch[2].trim();

                        try {
                            if (action === 'setname') {
                                await sock.updateProfileName(param);
                                console.log(`[Neox Action] Nom mis à jour: ${param}`);
                            } else if (action === 'setbio') {
                                await sock.updateProfileStatus(param);
                                console.log(`[Neox Action] Bio mise à jour: ${param}`);
                            } else if (action === 'setpp' && param.startsWith('http')) {
                                const ppRes = await axios.get(param, { responseType: 'arraybuffer' });
                                await sock.updateProfilePicture(sock.user.id, ppRes.data);
                                console.log(`[Neox Action] Photo mise à jour via URL: ${param}`);
                            } else if (action === 'kick' && isGroup) {
                                await sock.groupParticipantsUpdate(chatId, [param], "remove");
                                console.log(`[Neox Action] Kick: ${param}`);
                            } else if (action === 'add' && isGroup) {
                                await sock.groupParticipantsUpdate(chatId, [param.includes('@') ? param : param + '@s.whatsapp.net'], "add");
                                console.log(`[Neox Action] Add: ${param}`);
                            } else if (action === 'promote' && isGroup) {
                                await sock.groupParticipantsUpdate(chatId, [param], "promote");
                                console.log(`[Neox Action] Promote: ${param}`);
                            } else if (action === 'demote' && isGroup) {
                                await sock.groupParticipantsUpdate(chatId, [param], "demote");
                                console.log(`[Neox Action] Demote: ${param}`);
                            } else if (action === 'link' && isGroup) {
                                const code = await sock.groupInviteCode(chatId);
                                await sock.sendMessage(chatId, { text: `🔗 Voici le lien d'accès : https://chat.whatsapp.com/${code}` });
                            }
                        } catch (e) {
                            console.error(`[Neox Action Error] Échec de l'action ${action}:`, e);
                        }
                        // On retire la balise de la réponse finale
                        aiReply = aiReply.replace(/\[ACTION:.*?\]/g, "").trim();
                    }
                }
                // --- Fin de la logique d'action ---

                chatHistory[chatId].push({ role: "assistant", content: aiReply });
                saveChatHistory();

                if (aiReply) await sock.sendMessage(chatId, { text: aiReply });
            } catch (error) {
                console.error("Erreur avec Pollinations AI:", error);
                await sock.sendMessage(chatId, { text: "Désolé, mes circuits de communication sont temporairement surchargés." });
            }
            return;
        }

        if (messageContent.startsWith('/')) {
            const isOwner = senderId === OWNER_ID;
            switch(command) {
                case 'menu':
                case 'aide':
                    const menuImagePath = await generateMenuImage();
                    await sock.sendMessage(chatId, { image: { url: menuImagePath }, caption: "Commandes disponibles."});
                    break;
                case 'statut':
                    const statusImagePath = await generateStatusImage(player);
                    await sock.sendMessage(chatId, { image: { url: statusImagePath }, caption: `Statut de ${player.name}.`});
                    break;
                case 'tire':
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant;
                    if (!targetId || targetId === senderId) return await sock.sendMessage(chatId, { text: "❌ Cible invalide." });
                    const target = getPlayer(targetId);
                    target.health -= 15; player.energy -= 5;
                    if (target.health <= 0) {
                        target.health = 0; target.lastDeath = Date.now();
                        await sock.sendMessage(chatId, { text: `💥 Vous avez abattu ${target.name} !` });
                    } else {
                        await sock.sendMessage(chatId, { text: `💥 Dégâts infligés à ${target.name}.` });
                    }
                    savePlayers();
                    break;
                case 'setpp':
                    if (!isOwner) return;
                    if (msg.message.imageMessage) {
                        const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                        let buffer = Buffer.from([]);
                        for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        await sock.updateProfilePicture(sock.user.id, buffer);
                        await sock.sendMessage(chatId, { text: "✅ Photo mise à jour." });
                    }
                    break;
                case 'creategroup':
                    if (!isOwner) return;
                    const group = await sock.groupCreate(args.join(' '), [senderId]);
                    await sock.sendMessage(chatId, { text: `✅ Groupe créé: ${group.id}` });
                    break;
                case 'broadcast':
                    if (!isOwner) return;
                    const allGroups = await sock.groupFetchAllParticipating();
                    for (const id in allGroups) {
                        await sock.sendMessage(id, { text: `📢 *NEOX*\n\n${args.join(' ')}` });
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    break;
                case 'neox':
                    await sock.sendMessage(chatId, { text: "Je suis Neox. Actions: /setpp, /creategroup, /broadcast, /photo, /sticker, /add, /kick, /promote, /demote, /link, /groupinfo" });
                    break;
                case 'photo':
                    if (args[0]) await sock.sendMessage(chatId, { image: { url: args[0] }, caption: "Image." });
                    break;
                case 'sticker':
                    const sMsg = msg.message.imageMessage ? msg : msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ? {message: msg.message.extendedTextMessage.contextInfo.quotedMessage} : null;
                    if (sMsg) {
                        const stream = await downloadContentFromMessage(sMsg.message.imageMessage, 'image');
                        let buffer = Buffer.from([]);
                        for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        await sock.sendMessage(chatId, { sticker: buffer });
                    }
                    break;
                case 'kick':
                    if (isGroup && isOwner) {
                        const target = msg.message.extendedTextMessage?.contextInfo?.participant || (args[0] && args[0].includes('@') ? args[0] : null);
                        if (target) await sock.groupParticipantsUpdate(chatId, [target], "remove");
                    }
                    break;
                case 'add':
                    if (isGroup && isOwner && args[0]) await sock.groupParticipantsUpdate(chatId, [args[0].includes('@') ? args[0] : args[0] + '@s.whatsapp.net'], "add");
                    break;
                case 'promote':
                    if (isGroup && isOwner) {
                        const target = msg.message.extendedTextMessage?.contextInfo?.participant || (args[0] && args[0].includes('@') ? args[0] : null);
                        if (target) await sock.groupParticipantsUpdate(chatId, [target], "promote");
                    }
                    break;
                case 'demote':
                    if (isGroup && isOwner) {
                        const target = msg.message.extendedTextMessage?.contextInfo?.participant || (args[0] && args[0].includes('@') ? args[0] : null);
                        if (target) await sock.groupParticipantsUpdate(chatId, [target], "demote");
                    }
                    break;
                case 'link':
                    if (isGroup && isOwner) {
                        const code = await sock.groupInviteCode(chatId);
                        await sock.sendMessage(chatId, { text: `https://chat.whatsapp.com/${code}` });
                    }
                    break;
                case 'groupinfo':
                    if (isGroup) {
                        const meta = await sock.groupMetadata(chatId);
                        await sock.sendMessage(chatId, { text: `Sujet: ${meta.subject}\nParticipants: ${meta.participants.length}` });
                    }
                    break;
            }
        }
    });
}
connectToWhatsApp().catch(err => console.error(err));
