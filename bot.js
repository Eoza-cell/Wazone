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
            health: 100,
            energy: 100,
            weapon: 'Pistolet simple',
            lastDeath: null,
            messageCount: 0,
            class: null, // 'simple', 'sniper', 'lourd', 'bomber', 'assassin'
            ranks: {
                simple: { rank: 1, xp: 0 },
                sniper: { rank: 1, xp: 0 },
                lourd: { rank: 1, xp: 0 },
                bomber: { rank: 1, xp: 0 },
                assassin: { rank: 1, xp: 0 }
            },
            quests: {
                active: null,
                completed: [],
                progress: {}
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
    const playerClass = player.class || 'N/A';
    const rank = player.class ? player.ranks[player.class].rank : 'N/A';
    const xp = player.class ? player.ranks[player.class].xp : 'N/A';

    const svg = `
    <svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
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

        <!-- Classe & Rang -->
        <text x="30" y="260" class="label">Classe: <tspan class="value">${playerClass}</tspan></text>
        <text x="250" y="260" class="label">Rang: <tspan class="value">${rank}</tspan></text>
        <text x="400" y="260" class="label">XP: <tspan class="value">${xp}</tspan></text>
    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

async function generateMenuImage() {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `menu.png`);
    const svg = `
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#111;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#333;stop-opacity:1" />
            </linearGradient>
            <style>
                .font { font-family: 'Courier New', Courier, monospace; }
                .title { font-size: 42px; fill: #eee; font-weight: bold; text-transform: uppercase; letter-spacing: 5px; }
                .subtitle { font-size: 20px; fill: #f1c40f; text-transform: uppercase; letter-spacing: 3px; }
                .section-title { font-size: 24px; fill: #c0392b; font-weight: bold; text-transform: uppercase; }
                .command { font-size: 18px; fill: #ddd; }
                .desc { font-size: 14px; fill: #888; }
            </style>
        </defs>

        <rect width="100%" height="100%" fill="url(#bg-grad)" />

        <!-- Header -->
        <text x="400" y="60" text-anchor="middle" class="font title">WAZONE</text>
        <text x="400" y="90" text-anchor="middle" class="font subtitle">Terminal de Commandes</text>
        <line x1="50" y1="110" x2="750" y2="110" stroke="#555" stroke-width="1"/>

        <!-- Sections de commandes -->
        <g transform="translate(50, 150)">
            <text class="font section-title">Joueur</text>
            <text x="20" y="40" class="font command">/statut</text>
            <text x="20" y="60" class="font desc">Affiche votre état actuel.</text>
            <text x="20" y="90" class="font command">/classes</text>
            <text x="20" y="110" class="font desc">Choisir votre spécialisation.</text>
        </g>

        <g transform="translate(300, 150)">
            <text class="font section-title">Actions</text>
            <text x="20" y="40" class="font command">/tire</text>
            <text x="20" y="60" class="font desc">Engagez un adversaire.</text>
            <text x="20" y="90" class="font command">/armes</text>
            <text x="20" y="110" class="font desc">Consultez l'arsenal.</text>
        </g>

        <g transform="translate(550, 150)">
            <text class="font section-title">Monde</text>
            <text x="20" y="40" class="font command">/missions</text>
            <text x="20" y="60" class="font desc">Voir les objectifs disponibles.</text>
            <text x="20" y="90" class="font command">/regles</text>
            <text x="20" y="110" class="font desc">Consultez les règles.</text>
        </g>

        <!-- Ligne de séparation inférieure -->
        <line x1="50" y1="500" x2="750" y2="500" stroke="#555" stroke-width="1"/>
        <text x="400" y="540" text-anchor="middle" class="font desc">Développé par Wazone - v1.0</text>
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
        version: [2, 3000, 1025190524],
        getMessage: async key => {
            console.log('⚠️ Message non déchiffré, retry demandé:', key);
            return { conversation: '🔄 Réessaye d\'envoyer ton message' };
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if(qr) {
            // Envoyer le QR code au client via Socket.IO
            qrcode.toDataURL(qr, (err, url) => {
                if(err) {
                    console.error("Erreur lors de la génération du QR code", err);
                    return;
                }
                io.emit('qr', url);
                console.log('QR code envoyé au client web.');
            });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Conflit de session : déconnecté car le compte a été ouvert ailleurs.');
                io.emit('sessionConflict', 'Votre session a été invalidée. Veuillez scanner un nouveau QR code.');

                if (fs.existsSync(AUTH_DIR)) {
                    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    console.log('Session locale supprimée.');
                }

                console.log('Redémarrage du processus de connexion...');
                connectToWhatsApp();

            } else {
                const shouldReconnect = (lastDisconnect.error instanceof Boom);
                console.log('Connexion fermée en raison de:', lastDisconnect.error, ', reconnexion:', shouldReconnect);
                if (shouldReconnect) {
                    connectToWhatsApp();
                }
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
                    await sock.sendMessage(chatId, { image: { url: statusImagePath }, caption: `Voici votre statut actuel, ${player.name}.`});
                    break;
                case 'classes':
                    const availableClasses = ['simple', 'sniper', 'lourd', 'bomber', 'assassin'];
                    const selectedClass = args[0];

                    if (!selectedClass) {
                        let classList = "CHOISISSEZ VOTRE CLASSE:\n\n";
                        availableClasses.forEach(c => {
                            classList += `➡️ /classes ${c}\n`;
                        });
                        return await sock.sendMessage(chatId, { text: classList });
                    }

                    if (!availableClasses.includes(selectedClass)) {
                        return await sock.sendMessage(chatId, { text: "❌ Classe non valide. Veuillez choisir parmi les classes disponibles." });
                    }

                    player.class = selectedClass;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `✅ Vous avez choisi la classe ${selectedClass}.` });
                    break;
                case 'tire':
                    const targetId = msg.message.extendedTextMessage?.contextInfo?.participant;
                    if (!targetId) return await sock.sendMessage(chatId, { text: "❌ Pour tirer, vous devez répondre au message d'un adversaire." });
                    if (targetId === senderId) return await sock.sendMessage(chatId, { text: "❌ Vous ne pouvez pas vous tirer dessus !" });

                    const weapons = JSON.parse(fs.readFileSync('./weapons.json', 'utf8'));
                    const playerWeapon = weapons.find(w => w.name === player.weapon);

                    if (!playerWeapon) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous n'avez pas d'arme équipée." });
                    }

                    let damage = playerWeapon.damage;

                    // Appliquer les bonus de classe
                    if (player.class === playerWeapon.class) {
                        damage *= 1.2; // Bonus de 20%
                    }

                    const target = getPlayer(targetId);
                    target.health -= damage;
                    player.energy -= 5;

                    if (target.health <= 0) {
                        target.health = 0;
                        target.lastDeath = Date.now();
                        await sock.sendMessage(chatId, { text: `💥 Vous avez abattu ${target.name} !` });
                        await sock.sendMessage(targetId, { text: `☠️ ${player.name} vous a tué. Vous ne pourrez plus parler pendant 1 heure.` });
                    } else {
                        await sock.sendMessage(chatId, { text: `💥 Vous avez touché ${target.name} ! Il lui reste ${target.health}% de vie.` });
                        await sock.sendMessage(targetId, { text: `🤕 ${player.name} vous a tiré dessus ! Il vous reste ${target.health}% de vie.` });
                    }
                    if (player.quests.active) {
                        const activeQuestId = player.quests.active;
                        if (!player.quests.progress[activeQuestId]) {
                            player.quests.progress[activeQuestId] = { shotsFired: 0 };
                        }
                        player.quests.progress[activeQuestId].shotsFired += 1;
                    }
                    savePlayers();
                    break;
                case 'regles': await sock.sendMessage(chatId, { text: "📜 Règles du jeu : ... (à définir)" }); break;
                case 'quests':
                case 'missions':
                    const quests = JSON.parse(fs.readFileSync('./quests.json', 'utf8'));
                    let questList = "MISSIONS DISPONIBLES:\n\n";
                    quests.forEach(q => {
                        if (!player.quests.completed.includes(q.id)) {
                            questList += `*${q.title}* (#${q.id})\n${q.description}\nRécompense: ${q.reward.item || q.reward.xp + 'xp'}\n\n`;
                        }
                    });
                    questList += "Pour accepter une mission, utilisez /quete <id>";
                    await sock.sendMessage(chatId, { text: questList });
                    break;
                case 'quete':
                    const questId = parseInt(args[0]);
                    if (isNaN(questId)) {
                        return await sock.sendMessage(chatId, { text: "❌ Veuillez fournir un ID de quête valide." });
                    }

                    const allQuests = JSON.parse(fs.readFileSync('./quests.json', 'utf8'));
                    const selectedQuest = allQuests.find(q => q.id === questId);

                    if (!selectedQuest) {
                        return await sock.sendMessage(chatId, { text: "❌ Quête non trouvée." });
                    }

                    if (player.quests.active) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous avez déjà une quête active." });
                    }

                    player.quests.active = selectedQuest.id;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `✅ Quête "${selectedQuest.title}" acceptée !` });
                    break;
                case 'terminer':
                    if (!player.quests.active) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous n'avez pas de quête active." });
                    }

                    const activeQuestId = player.quests.active;
                    const allQuestsData = JSON.parse(fs.readFileSync('./quests.json', 'utf8'));
                    const activeQuest = allQuestsData.find(q => q.id === activeQuestId);

                    let isQuestCompleted = false;
                    const progress = player.quests.progress[activeQuestId];
                    if (progress) {
                        if (activeQuest.completion.type === 'shotsFired' && progress.shotsFired >= activeQuest.completion.count) {
                            isQuestCompleted = true;
                        }
                    }

                    if (!isQuestCompleted) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous n'avez pas encore terminé les objectifs de la quête." });
                    }

                    player.quests.completed.push(activeQuestId);
                    player.quests.active = null;

                    let rewardMessage = `🎉 Quête "${activeQuest.title}" terminée !\n\n`;
                    if (activeQuest.reward.xp && player.class) {
                        const playerClass = player.class;
                        player.ranks[playerClass].xp += activeQuest.reward.xp;

                        // Logique de montée de niveau (exemple simple)
                        const xpForNextRank = player.ranks[playerClass].rank * 100;
                        if (player.ranks[playerClass].xp >= xpForNextRank) {
                            player.ranks[playerClass].rank++;
                            player.ranks[playerClass].xp -= xpForNextRank;
                            rewardMessage += `⭐ Vous êtes monté au rang ${player.ranks[playerClass].rank} en tant que ${playerClass} !\n`;
                        }

                        rewardMessage += `+${activeQuest.reward.xp} XP en ${playerClass}\n`;
                    }
                    if (activeQuest.reward.item) {
                        player.weapon = activeQuest.reward.item; // Simplifié pour l'exemple
                        rewardMessage += `Vous avez obtenu: ${activeQuest.reward.item}\n`;
                    }
                    savePlayers();
                    await sock.sendMessage(chatId, { text: rewardMessage });
                    break;
                case 'lieux': await sock.sendMessage(chatId, { text: "🗺️ Lieux explorables : ... (à définir)" }); break;
                case 'events': await sock.sendMessage(chatId, { text: "🎉 Événements en cours : ... (à définir)" }); break;
                case 'histoire':
                    const storyData = JSON.parse(fs.readFileSync('./story.json', 'utf8'));
                    let storyText = "";
                    if (player.quests.completed.length === 0) {
                        storyText = storyData.introduction;
                    } else {
                        const lastCompletedQuest = player.quests.completed[player.quests.completed.length - 1];
                        const nextStory = storyData.quests.find(q => q.id === lastCompletedQuest + 1);
                        if (nextStory) {
                            storyText = nextStory.story;
                        } else {
                            storyText = "Vous avez terminé toutes les quêtes de l'histoire pour le moment. Revenez plus tard !";
                        }
                    }
                    await sock.sendMessage(chatId, { text: storyText });
                    break;
                case 'armes':
                    const weaponsData = JSON.parse(fs.readFileSync('./weapons.json', 'utf8'));
                    let weaponList = "CATALOGUE D'ARMES:\n\n";
                    weaponsData.forEach(w => {
                        weaponList += `*${w.name}*\n`;
                        weaponList += `  Classe: ${w.class}\n`;
                        weaponList += `  Dégâts: ${w.damage}\n\n`;
                    });
                    await sock.sendMessage(chatId, { text: weaponList });
                    break;
            }
        }
    });
}

connectToWhatsApp().catch(err => console.error("Erreur inattendue : ", err));
