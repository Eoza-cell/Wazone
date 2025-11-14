const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
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
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
    console.log(`Le serveur web est en écoute sur http://localhost:${PORT}`);
});
// --- FIN DE LA CONFIGURATION ---

const PLAYERS_FILE = './data/players.json';
const GENERATED_IMAGES_DIR = './generated_images/';

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
            class: null,
            ranks: { simple: { rank: 1, xp: 0 }, sniper: { rank: 1, xp: 0 }, lourd: { rank: 1, xp: 0 }, bomber: { rank: 1, xp: 0 }, assassin: { rank: 1, xp: 0 } },
            quests: { active: null, completed: [], progress: {} }
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
        <rect x="5" y="5" width="490" height="240" fill="none" stroke="#7f8c8d" stroke-width="1" stroke-opacity="0.5"/>
        <path d="M15 30 V15 H30" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <path d="M485 30 V15 H470" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <path d="M15 220 V235 H30" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <path d="M485 220 V235 H470" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <text x="30" y="45" class="name">${player.name}</text>
        <text x="30" y="90" class="label">Santé</text>
        <rect x="30" y="100" width="440" height="25" class="bar-bg" />
        <rect x="30" y="100" width="${player.health * 4.4}" height="25" fill="${healthColor}" />
        <text x="465" y="118" text-anchor="end" class="value">${player.health}%</text>
        <text x="30" y="155" class="label">Énergie</text>
        <rect x="30" y="165" width="440" height="25" class="bar-bg" />
        <rect x="30" y="165" width="${player.energy * 4.4}" height="25" fill="${energyColor}" />
        <text x="465" y="183" text-anchor="end" class="value">${player.energy}%</text>
        <text x="30" y="220" class="label">Arme: <tspan class="value">${player.weapon}</tspan></text>
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
        <text x="400" y="60" text-anchor="middle" class="font title">WAZONE</text>
        <text x="400" y="90" text-anchor="middle" class="font subtitle">Terminal de Commandes</text>
        <line x1="50" y1="110" x2="750" y2="110" stroke="#555" stroke-width="1"/>
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
        <line x1="50" y1="500" x2="750" y2="500" stroke="#555" stroke-width="1"/>
        <text x="400" y="540" text-anchor="middle" class="font desc">Développé par Wazone - v1.0</text>
    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'],
    }
});

client.on('qr', (qr) => {
    console.log('QR code reçu, envoi au frontend...');
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error('Erreur lors de la conversion du QR code:', err);
            return;
        }
        io.emit('qr', url);
    });
});

client.on('ready', () => {
    console.log('✅ Connexion ouverte et réussie !');
    io.emit('connectionSuccess', 'Bot connecté avec succès !');
});

client.on('message', async (msg) => {
    // --- Gestion des groupes ---
    const chat = await msg.getChat();
    const isGroup = chat.isGroup;
    const authorId = msg.author || msg.from;
    const chatId = msg.from;
    // --- Fin de la gestion ---

    if (!authorId) return;

    const contact = await msg.getContact();
    const player = getPlayer(authorId);
    if (!player.name) player.name = contact.pushname || 'Inconnu';

    const messageContent = msg.body;

    if (player.lastDeath) {
        const timeSinceDeath = Date.now() - player.lastDeath;
        if (timeSinceDeath < 3600000) { // 1 heure
            return;
        } else {
            player.lastDeath = null;
            player.health = 100;
            player.energy = 100;
            savePlayers();
            await client.sendMessage(chatId, `🧟‍♂️ Vous êtes de retour parmi les vivants !`);
        }
    }

    const args = messageContent.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (messageContent.startsWith('/')) {
        switch (command) {
            case 'menu':
            case 'aide':
                const menuImagePath = await generateMenuImage();
                const menuMedia = MessageMedia.fromFilePath(menuImagePath);
                await client.sendMessage(chatId, menuMedia, { caption: "Voici la liste des commandes disponibles." });
                break;
            case 'statut':
                const statusImagePath = await generateStatusImage(player);
                const statusMedia = MessageMedia.fromFilePath(statusImagePath);
                await client.sendMessage(chatId, statusMedia, { caption: `Voici votre statut actuel, ${player.name}.` });
                break;
            case 'classes':
                 const availableClasses = ['simple', 'sniper', 'lourd', 'bomber', 'assassin'];
                 const selectedClass = args[0];

                 if (!selectedClass) {
                     let classList = "CHOISISSEZ VOTRE CLASSE:\n\n";
                     availableClasses.forEach(c => { classList += `➡️ /classes ${c}\n`; });
                     return await client.sendMessage(chatId, classList);
                 }
                 if (!availableClasses.includes(selectedClass)) {
                     return await client.sendMessage(chatId, "❌ Classe non valide. Veuillez choisir parmi les classes disponibles.");
                 }
                 player.class = selectedClass;
                 savePlayers();
                 await client.sendMessage(chatId, `✅ Vous avez choisi la classe ${selectedClass}.`);
                 break;
            case 'tire':
                const quotedMsg = await msg.getQuotedMessage();
                if (!quotedMsg) return await client.sendMessage(chatId, "❌ Pour tirer, vous devez répondre au message d'un adversaire.");

                const targetId = quotedMsg.author || quotedMsg.from;
                if (targetId === authorId) return await client.sendMessage(chatId, "❌ Vous ne pouvez pas vous tirer dessus !");

                const weapons = JSON.parse(fs.readFileSync('./weapons.json', 'utf8'));
                const playerWeapon = weapons.find(w => w.name === player.weapon);
                if (!playerWeapon) return await client.sendMessage(chatId, "❌ Vous n'avez pas d'arme équipée.");

                let damage = playerWeapon.damage;
                if (player.class === playerWeapon.class) { damage *= 1.2; }

                const target = getPlayer(targetId);
                target.health -= damage;
                player.energy -= 5;

                if (target.health <= 0) {
                    target.health = 0;
                    target.lastDeath = Date.now();
                    await client.sendMessage(chatId, `💥 Vous avez abattu ${target.name} !`);
                    await client.sendMessage(targetId, `☠️ ${player.name} vous a tué. Vous ne pourrez plus parler pendant 1 heure.`);
                } else {
                    await client.sendMessage(chatId, `💥 Vous avez touché ${target.name} ! Il lui reste ${target.health}% de vie.`);
                    await client.sendMessage(targetId, `🤕 ${player.name} vous a tiré dessus ! Il vous reste ${target.health}% de vie.`);
                }
                if (player.quests.active) {
                    const activeQuestId = player.quests.active;
                    if (!player.quests.progress[activeQuestId]) { player.quests.progress[activeQuestId] = { shotsFired: 0 }; }
                    player.quests.progress[activeQuestId].shotsFired += 1;
                }
                savePlayers();
                break;
            // ... (le reste des commandes)
        }
    }
});

io.on('connection', (socket) => {
    console.log('Un client est connecté au serveur WebSocket.');
    // Envoyer le QR code si déjà généré
    client.initialize().catch(err => {
        console.error("Erreur lors de l'initialisation de la connexion :", err);
        io.emit('connectionError', 'Une erreur interne est survenue.');
    });
});
