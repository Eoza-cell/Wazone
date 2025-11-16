const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, isJidGroup } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sharp = require('sharp');
const qrcode = require('qrcode');
const pino = require('pino');

// --- CONFIGURATION UTILISATEUR ---
// Définissez la variable d'environnement PHONE_NUMBER avec votre numéro (ex: "33612345678")
const phoneNumber = process.env.PHONE_NUMBER;
// --- FIN CONFIGURATION ---

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
const SESSION_DIR = process.env.SESSION_DIR || 'auth_info_baileys';

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(GENERATED_IMAGES_DIR)) fs.mkdirSync(GENERATED_IMAGES_DIR);
if (!fs.existsSync(path.dirname(PLAYERS_FILE))) fs.mkdirSync(path.dirname(PLAYERS_FILE), { recursive: true });
if (!fs.existsSync(PLAYERS_FILE)) fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}));

let players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
const weapons = JSON.parse(fs.readFileSync('./weapons.json', 'utf8'));
const equipment = JSON.parse(fs.readFileSync('./equipment.json', 'utf8'));
const quests = JSON.parse(fs.readFileSync('./quests.json', 'utf8'));

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
            equipment: { helmet: null, vest: null, boots: null, gloves: null },
            inventory: [],
            lastDeath: null,
            messageCount: 0,
            class: null,
            gender: 'homme', // 'homme' ou 'femme'
            xp: 0,
            rank: 'Recrue',
            quests: { active_main: null, active_side: [], completed: [], progress: {} }
        };
        savePlayers();
    }
    return players[id];
}

const ranks = [
    { name: 'Recrue', xp: 0 },
    { name: 'Soldat', xp: 100 },
    { name: 'Pro', xp: 300 },
    { name: 'Vétéran', xp: 700 },
    { name: 'Démon', xp: 1500 },
    { name: 'Légende', xp: 3000 }
];

function updateRank(player) {
    const currentRank = ranks.find(r => r.name === player.rank);
    const nextRank = ranks[ranks.indexOf(currentRank) + 1];
    if (nextRank && player.xp >= nextRank.xp) {
        player.rank = nextRank.name;
        // Potentiellement envoyer un message de félicitations ici
        // On ne peut pas appeler checkQuestCompletion ici car on n'a pas sock et chatId
    }
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
    <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#0A0A0A;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#222222;stop-opacity:1" />
            </linearGradient>
            <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
            <style>
                .font { font-family: 'Orbitron', sans-serif; }
                .title { font-size: 80px; fill: url(#bg-grad); stroke: #888; stroke-width: 1px; font-weight: 700; text-transform: uppercase; letter-spacing: 10px; filter: url(#glow); }
                .subtitle { font-size: 24px; fill: #00FF00; text-transform: uppercase; letter-spacing: 5px; opacity: 0.8; }
                .section-title { font-size: 32px; fill: #FFA500; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; border-bottom: 1px solid #FFA500;}
                .command { font-size: 24px; fill: #EAEAEA; }
                .desc { font-size: 18px; fill: #888; }
                .icon { fill: #FFA500; }
            </style>
        </defs>

        <rect width="100%" height="100%" fill="url(#bg-grad)" />
        <rect x="10" y="10" width="1180" height="780" fill="none" stroke="#555" stroke-width="2" stroke-opacity="0.5"/>

        <text x="600" y="100" text-anchor="middle" class="font title">WAZONE</text>
        <text x="600" y="140" text-anchor="middle" class="font subtitle">TERMINAL DE COMBAT</text>

        <line x1="50" y1="180" x2="1150" y2="180" stroke="#555" stroke-width="1"/>

        <!-- Colonne 1: Joueur -->
        <g transform="translate(100, 250)">
            <text class="font section-title">👤 Joueur</text>
            <text x="20" y="60" class="font command">/profil</text>
            <text x="20" y="90" class="font desc">Votre identité et équipement.</text>
            <text x="20" y="140" class="font command">/statut</text>
            <text x="20" y="170" class="font desc">Affiche votre état actuel.</text>
            <text x="20" y="220" class="font command">/classement</text>
            <text x="20" y="250" class="font desc">Votre rang et progression.</text>
        </g>

        <!-- Colonne 2: Actions -->
        <g transform="translate(450, 250)">
            <text class="font section-title">⚔️ Actions</text>
            <text x="20" y="60" class="font command">/tire</text>
            <text x="20" y="90" class="font desc">Engagez un adversaire.</text>
            <text x="20" y="140" class="font command">/arme [nom]</text>
            <text x="20" y="170" class="font desc">Consultez l'arsenal.</text>
            <text x="20" y="220" class="font command">/equip [nom]</text>
            <text x="20" y="250" class="font desc">Gérez votre équipement.</text>
        </g>

        <!-- Colonne 3: Monde -->
        <g transform="translate(800, 250)">
            <text class="font section-title">🌍 Monde</text>
            <text x="20" y="60" class="font command">/quetes</text>
            <text x="20" y="90" class="font desc">Voir les objectifs disponibles.</text>
            <text x="20" y="140" class="font command">/regles</text>
            <text x="20" y="170" class="font desc">Consultez les règles du jeu.</text>
        </g>

        <line x1="50" y1="700" x2="1150" y2="700" stroke="#555" stroke-width="1"/>
        <text x="600" y="740" text-anchor="middle" class="font desc">VERSION 2.0 - NE PAS DIFFUSER</text>
    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

async function generateProfileImage(player) {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `profile_${player.id}.png`);
    const composites = [];

    // Utilise l'image de fond
    const backgroundImagePath = path.join(__dirname, 'assets', 'wazone_background.jpeg');
    const baseImage = sharp(backgroundImagePath).resize(500, 500);


    for (const slot in player.equipment) {
        if (player.equipment[slot]) {
            const equipmentItem = equipment.find(e => e.name === player.equipment[slot]);
            if (equipmentItem && equipmentItem.image) {
                try {
                    // Tente de télécharger chaque image d'équipement
                    const equipmentImageResponse = await fetch(equipmentItem.image);
                    if (!equipmentImageResponse.ok) {
                        console.error(`Erreur HTTP ${equipmentImageResponse.status} pour l'image: ${equipmentItem.image}`);
                        continue; // Passe à l'item suivant si le téléchargement échoue
                    }
                    const equipmentImageBuffer = await equipmentImageResponse.arrayBuffer();
                    composites.push({ input: Buffer.from(equipmentImageBuffer) });
                } catch (fetchError) {
                    console.error(`Impossible de télécharger l'image d'équipement: ${equipmentItem.image}`, fetchError);
                }
            }
        }
    }

    try {
        let image = baseImage;
        if (composites.length > 0) {
            image = image.composite(composites);
        }
        await image.png().toFile(imagePath);
        return imagePath;
    } catch (error) {
        console.error("Erreur lors de la composition de l'image de profil:", error);
        // En cas d'erreur, on peut retourner le chemin d'une image de remplacement locale
        // ou simplement ne rien retourner pour que le message soit envoyé sans image.
        return null;
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const proxyUrl = process.env.PROXY_URL;
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

    const sock = makeWASocket({
        agent: agent,
        fetchAgent: agent,
        auth: state,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
        version: [2, 3000, 1025190524],
        logger: pino({ level: 'silent' }),
        getMessage: async key => {
            console.log('⚠️ Message non déchiffré, retry demandé:', key);
            return { conversation: '🔄 Réessaye d\'envoyer ton message' };
        }
    });

    if (!sock.authState.creds.registered) {
        if (!phoneNumber) {
            console.error("ERREUR: La variable d'environnement PHONE_NUMBER n'est pas définie.");
            io.emit('connectionError', "Numéro de téléphone manquant.");
            return;
        }
         console.log(`Tentative de connexion avec le numéro : ${phoneNumber}`);
        setTimeout(async () => {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`Votre code de pairage: ${code}`);
            io.emit('pairingCode', code);
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connexion fermée à cause de:', lastDisconnect.error, ', reconnexion:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Connexion ouverte et réussie !');
            io.emit('connectionSuccess', 'Bot connecté avec succès !');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const chatId = msg.key.remoteJid;
        const authorId = msg.key.participant || msg.key.remoteJid;
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (!authorId) return;

        const player = getPlayer(authorId);
        if (!player.name) player.name = msg.pushName || 'Inconnu';

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
            switch (command) {
                case 'menu':
                case 'aide':
                    const menuImagePath = await generateMenuImage();
                    await sock.sendMessage(chatId, { image: { url: menuImagePath }, caption: "Voici la liste des commandes disponibles." });
                    break;
                case 'statut':
                    const statusImagePath = await generateStatusImage(player);
                    await sock.sendMessage(chatId, { image: { url: statusImagePath }, caption: `Voici votre statut actuel, ${player.name}.` });
                    break;
                case 'classement':
                    const currentRankIndex = ranks.findIndex(r => r.name === player.rank);
                    const nextRank = ranks[currentRankIndex + 1];
                    let rankInfo = `*VOTRE CLASSEMENT*\n\n`
                    rankInfo += `*Rang :* ${player.rank}\n`;
                    rankInfo += `*XP :* ${player.xp}\n\n`;
                    if (nextRank) {
                        rankInfo += `*Prochain rang :* ${nextRank.name} (${nextRank.xp} XP requis)\n`;
                        rankInfo += `*Progression :* [${"#".repeat(Math.floor(player.xp / nextRank.xp * 10))}${"-".repeat(10 - Math.floor(player.xp / nextRank.xp * 10))}]`;
                    } else {
                        rankInfo += `Vous avez atteint le rang maximum !`;
                    }
                    await sock.sendMessage(chatId, { text: rankInfo });
                    break;
                case 'profil':
                    const profileImagePath = await generateProfileImage(player);
                    if (profileImagePath) {
                        await sock.sendMessage(chatId, { image: { url: profileImagePath }, caption: `Profil de ${player.name}` });
                    } else {
                        await sock.sendMessage(chatId, { text: `Impossible de générer l'image de profil pour ${player.name}.` });
                    }
                    break;
                case 'genre':
                    const selectedGender = args[0];
                    if (!selectedGender || !['homme', 'femme'].includes(selectedGender)) {
                        return await sock.sendMessage(chatId, { text: "Veuillez choisir un genre valide : `/genre homme` ou `/genre femme`." });
                    }
                    player.gender = selectedGender;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `✅ Votre personnage est maintenant un(e) ${selectedGender}.` });
                    break;
                case 'classes':
                     const availableClasses = ['simple', 'sniper', 'lourd', 'bomber', 'assassin'];
                     const selectedClass = args[0];

                     if (!selectedClass) {
                         let classList = "CHOISISSEZ VOTRE CLASSE:\n\n";
                         availableClasses.forEach(c => { classList += `➡️ /classes ${c}\n`; });
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
                    const contextInfo = msg.message.extendedTextMessage?.contextInfo;
                    if (!contextInfo || !contextInfo.participant) {
                        return await sock.sendMessage(chatId, { text: "❌ Pour tirer, vous devez répondre au message d'un adversaire." });
                    }

                    const targetId = contextInfo.participant;
                    if (targetId === authorId) return await sock.sendMessage(chatId, { text: "❌ Vous ne pouvez pas vous tirer dessus !" });

                    const playerWeapon = weapons.find(w => w.name === player.weapon);
                    if (!playerWeapon) return await sock.sendMessage(chatId, { text: "❌ Vous n'avez pas d'arme équipée." });

                    let damage = playerWeapon.damage;
                    if (player.class === playerWeapon.class) { damage *= 1.2; }

                    const target = getPlayer(targetId);

                    let totalProtection = 0;
                    for (const slot in target.equipment) {
                        if (target.equipment[slot]) {
                            const equipmentItem = equipment.find(e => e.name === target.equipment[slot]);
                            if (equipmentItem) {
                                totalProtection += equipmentItem.protection;
                            }
                        }
                    }
                    damage -= totalProtection;
                    if (damage < 0) damage = 0;

                    target.health -= damage;
                    player.energy -= 5;

                    if (target.health <= 0) {
                        target.health = 0;
                        target.lastDeath = Date.now();
                        await sock.sendMessage(chatId, { text: `💥 Vous avez abattu ${target.name} !` });
                        await sock.sendMessage(targetId, { text: `☠️ ${player.name} vous a tué. Vous ne pourrez plus parler pendant 1 heure.` });
                        if (player.quests.active_main) {
                            const activeQuestId = player.quests.active_main;
                            if (!player.quests.progress[activeQuestId]) { player.quests.progress[activeQuestId] = { shotsFired: 0, usedWeaponClasses: [], eliminatedClasses: [] }; }
                            if (!player.quests.progress[activeQuestId].eliminatedClasses.includes(target.class)) {
                                player.quests.progress[activeQuestId].eliminatedClasses.push(target.class);
                            }
                        }
                    } else {
                        await sock.sendMessage(chatId, { text: `💥 Vous avez touché ${target.name} ! Il lui reste ${target.health}% de vie.` });
                        await sock.sendMessage(targetId, { text: `🤕 ${player.name} vous a tiré dessus ! Il vous reste ${target.health}% de vie.` });
                    }
                    if (player.quests.active_main) {
                        const activeQuestId = player.quests.active_main;
                        if (!player.quests.progress[activeQuestId]) { player.quests.progress[activeQuestId] = { shotsFired: 0, usedWeaponClasses: [] }; }
                        player.quests.progress[activeQuestId].shotsFired += 1;
                        if (!player.quests.progress[activeQuestId].usedWeaponClasses.includes(playerWeapon.class)) {
                            player.quests.progress[activeQuestId].usedWeaponClasses.push(playerWeapon.class);
                        }
                        await checkQuestCompletion(player, sock, chatId);
                    }
                    player.quests.active_side.forEach(async (questId) => {
                        if (!player.quests.progress[questId]) { player.quests.progress[questId] = { shotsFired: 0 }; }
                        player.quests.progress[questId].shotsFired += 1;
                        await checkQuestCompletion(player, sock, chatId);
                    });

                    savePlayers();
                    break;
                case 'arme':
                    const weaponName = args.join(' ');
                    if (!weaponName) {
                        return await sock.sendMessage(chatId, { text: "Veuillez spécifier le nom d'une arme. Ex: /arme M4A1" });
                    }
                    const weapon = weapons.find(w => w.name.toLowerCase() === weaponName.toLowerCase());
                    if (!weapon) {
                        return await sock.sendMessage(chatId, { text: "❌ Arme non trouvée." });
                    }

                    let weaponInfo = `*${weapon.name}*\n\n`;
                    weaponInfo += `*Classe :* ${weapon.class}\n`;
                    weaponInfo += `*Rareté :* ${weapon.rarity}\n`;
                    weaponInfo += `*Dégâts :* ${weapon.damage}\n`;

                    await sock.sendMessage(chatId, { text: weaponInfo });
                    break;
                case 'quetes':
                    const questId = args[0];

                    if (!questId) {
                        let questList = "QUÊTES DISPONIBLES:\n\n";
                        quests.forEach(q => {
                            if (!player.quests.completed.includes(q.id)) {
                                questList += `➡️ *${q.title}* (/quetes ${q.id})\n_${q.description}_\n\n`;
                            }
                        });
                        return await sock.sendMessage(chatId, { text: questList });
                    }

                    const quest = quests.find(q => q.id == questId);
                    if (!quest) return await sock.sendMessage(chatId, { text: "❌ Quête non valide." });
                    if (player.quests.completed.includes(quest.id)) return await sock.sendMessage(chatId, { text: "❌ Vous avez déjà terminé cette quête." });

                    if (quest.questType === 'main') {
                        if (player.quests.active_main) return await sock.sendMessage(chatId, { text: "❌ Vous avez déjà une quête principale active." });
                        player.quests.active_main = quest.id;
                    } else {
                        if (player.quests.active_side.includes(quest.id)) return await sock.sendMessage(chatId, { text: "❌ Vous avez déjà cette quête secondaire active." });
                        player.quests.active_side.push(quest.id);
                    }
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `✅ Quête acceptée: *${quest.title}*` });
                    break;
                case 'equip':
                    const equipmentName = args.join(' ');
                    if (!equipmentName) {
                        let inventoryList = "VOTRE INVENTAIRE:\n\n";
                        player.inventory.forEach(item => { inventoryList += `➡️ ${item}\n`; });
                        return await sock.sendMessage(chatId, { text: inventoryList });
                    }

                    const equipmentItem = equipment.find(e => e.name.toLowerCase() === equipmentName.toLowerCase());
                    if (!equipmentItem) return await sock.sendMessage(chatId, { text: "❌ Équipement non valide." });
                    if (!player.inventory.includes(equipmentItem.name)) return await sock.sendMessage(chatId, { text: "❌ Vous ne possédez pas cet équipement." });

                    player.equipment[equipmentItem.type] = equipmentItem.name;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `✅ Vous avez équipé: *${equipmentItem.name}*` });
                    await checkQuestCompletion(player, sock, chatId);
                    break;
                case 'regles':
                    const rulesText = `
*--- RÈGLES DU JEU WAZONE ---*

1.  *La Mort :* Lorsque votre santé atteint 0, vous êtes considéré comme "mort". Vous ne pourrez plus envoyer de messages dans le groupe pendant 1 heure.

2.  *Le Combat :* Pour attaquer un joueur, répondez à l'un de ses messages avec la commande /tire.

3.  *Équipement :* Trouvez et équipez des objets (/equip) pour augmenter votre protection et réduire les dégâts subis.

4.  *Progression :* Gagnez de l'XP en combattant et en accomplissant des quêtes (/quetes) pour monter en rang (/classement).

5.  *Respect :* Le jeu est pour le plaisir. Toute insulte ou comportement anti-jeu est interdit.

*Bonne chance, soldat !*
                    `;
                    await sock.sendMessage(chatId, { text: rulesText });
                    break;
            }
        }
    });
}

connectToWhatsApp().catch(err => {
    console.error("Erreur lors de la connexion initiale :", err);
});

async function checkQuestCompletion(player, sock, chatId) {
    const allActiveQuests = [player.quests.active_main, ...player.quests.active_side].filter(q => q !== null);

    for (const questId of allActiveQuests) {
        const quest = quests.find(q => q.id === questId);
        if (!quest) continue;

        const progress = player.quests.progress[questId] || {};
        let completed = false;

        switch (quest.completion.type) {
            case 'shotsFired':
                if (progress.shotsFired >= quest.completion.count) {
                    completed = true;
                }
                break;
            case 'collect':
                const collectedCount = player.inventory.filter(item => {
                    const equipmentItem = equipment.find(e => e.name === item);
                    return equipmentItem && equipmentItem.type === quest.completion.itemType;
                }).length;
                if (collectedCount >= quest.completion.count) {
                    completed = true;
                }
                break;
            case 'useWeaponClass':
                if (progress.usedWeaponClasses && progress.usedWeaponClasses.length >= quest.completion.count) {
                    completed = true;
                }
                break;
            case 'eliminateClass':
                if (progress.eliminatedClasses && quest.completion.classes.every(c => progress.eliminatedClasses.includes(c))) {
                    completed = true;
                }
                break;
            case 'rank':
                if (player.rank === quest.completion.rank) {
                    completed = true;
                }
                break;
            case 'equip':
                if (player.weapon === quest.completion.item || Object.values(player.equipment).includes(quest.completion.item)) {
                    completed = true;
                }
                break;
        }

        if (completed) {
            player.quests.completed.push(questId);
            if (quest.questType === 'main') {
                player.quests.active_main = null;
            } else {
                player.quests.active_side = player.quests.active_side.filter(id => id !== questId);
            }
            delete player.quests.progress[questId];

            player.xp += quest.reward.xp;
            updateRank(player);
            await checkQuestCompletion(player, sock, chatId); // Pour vérifier les quêtes de rang
            if (quest.reward.item) {
                player.inventory.push(quest.reward.item);
            }

            await sock.sendMessage(chatId, { text: `🎉 Quête terminée: *${quest.title}* !\nRécompense: ${quest.reward.xp} XP` });
        }
    }
}

io.on('connection', (socket) => {
    console.log('Un client est connecté au serveur WebSocket.');
});
