const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, isJidGroup } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const qrcode = require('qrcode');
const { connectDB, getDB } = require('./db.js');

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

const GENERATED_IMAGES_DIR = './generated_images/';
const SESSION_DIR = process.env.SESSION_DIR || 'auth_info_baileys';

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
if (!fs.existsSync(GENERATED_IMAGES_DIR)) fs.mkdirSync(GENERATED_IMAGES_DIR);

let playersCollection;
const weapons = JSON.parse(fs.readFileSync('./weapons.json', 'utf8'));
const equipment = JSON.parse(fs.readFileSync('./equipment.json', 'utf8'));
const quests = JSON.parse(fs.readFileSync('./quests.json', 'utf8'));

let game = {
    duels: {}, // { 'player1_id:player2_id': { turn: 'player1_id' } }
    invitations: {} // { 'target_id': { from: 'challenger_id', timeout: NodeJS.Timeout } }
};

async function updatePlayer(player) {
    await playersCollection.updateOne({ id: player.id }, { $set: player }, { upsert: true });
}

async function getPlayer(id) {
    let player = await playersCollection.findOne({ id: id });
    if (!player) {
        player = {
            id: id,
            name: '',
            health: 100,
            energy: 100,
            money: 100,
            equippedWeapon: 'Pistolet simple',
            weaponInventory: ['Pistolet simple'],
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
        await playersCollection.insertOne(player);
    }
    return player;
}

function findDuel(playerId) {
    return Object.keys(game.duels).find(duelId => duelId.split(':').includes(playerId));
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
    const prompt = `Call of Duty style HUD, screengrab, realistic, 8k. Player name: ${player.name}. Health: ${player.health}%. Energy: ${player.energy}%. Equipped Weapon: ${player.equippedWeapon}. Rank: ${player.rank}.`;
    const encodedPrompt = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}`;
}

async function generateMenuImage() {
    const prompt = `Futuristic military computer terminal, Call of Duty style, screengrab, 8k. The screen displays the main game commands: /profil, /statut, /classement, /tire, /arme, /equip, /quetes, /regles. The title on the screen is WAZONE.`;
    const encodedPrompt = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}`;
}

async function generateProfileImage(player) {
    let prompt = `First person view of a Call of Duty soldier, realistic, 8k. The soldier is a ${player.gender}, rank ${player.rank}. `;

    const equippedItems = Object.values(player.equipment).filter(Boolean);
    if (equippedItems.length > 0) {
        prompt += `The soldier is wearing ${equippedItems.join(', ')}. `;
    }
    if (player.equippedWeapon) {
        prompt += `The soldier is holding a ${player.equippedWeapon}.`;
    }

    const encodedPrompt = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}`;
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

        const player = await getPlayer(authorId);
        if (!player.name) {
             player.name = msg.pushName || 'Inconnu';
             await updatePlayer(player);
        }

        if (player.lastDeath) {
            const timeSinceDeath = Date.now() - player.lastDeath;
            if (timeSinceDeath < 3600000) { // 1 heure
                return;
            } else {
                player.lastDeath = null;
                player.health = 100;
                player.energy = 100;
                await updatePlayer(player);
                await sock.sendMessage(chatId, { text: `🧟‍♂️ Vous êtes de retour parmi les vivants !` });
            }
        }

        const args = messageContent.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (messageContent.startsWith('/')) {
            switch (command) {
                case 'menu':
                case 'aide':
                    const menuImageUrl = await generateMenuImage();
                    await sock.sendMessage(chatId, { image: { url: menuImageUrl }, caption: "Voici la liste des commandes disponibles." });
                    break;
                case 'statut':
                    const statusImageUrl = await generateStatusImage(player);
                    await sock.sendMessage(chatId, { image: { url: statusImageUrl }, caption: `Voici votre statut actuel, ${player.name}.` });
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
                    const profileImageUrl = await generateProfileImage(player);
                    await sock.sendMessage(chatId, { image: { url: profileImageUrl }, caption: `Profil de ${player.name}` });
                    break;
                case 'genre':
                    const selectedGender = args[0];
                    if (!selectedGender || !['homme', 'femme'].includes(selectedGender)) {
                        return await sock.sendMessage(chatId, { text: "Veuillez choisir un genre valide : `/genre homme` ou `/genre femme`." });
                    }
                    player.gender = selectedGender;
                    await updatePlayer(player);
                    await sock.sendMessage(chatId, { text: `✅ Votre personnage est maintenant un(e) ${selectedGender}.` });
                    break;
                case 'classes':
                     if (player.class) {
                         return await sock.sendMessage(chatId, { text: `❌ Vous avez déjà choisi votre classe: *${player.class}*. Ce choix est définitif.` });
                     }
                     const availableClasses = ['simple', 'sniper', 'lourd', 'bomber', 'assassin'];
                     const selectedClass = args[0];

                     if (!selectedClass) {
                         let classList = "CHOISISSEZ VOTRE CLASSE (ce choix est définitif):\n\n";
                         availableClasses.forEach(c => { classList += `➡️ /classes ${c}\n`; });
                         return await sock.sendMessage(chatId, { text: classList });
                     }
                     if (!availableClasses.includes(selectedClass)) {
                         return await sock.sendMessage(chatId, { text: "❌ Classe non valide. Veuillez choisir parmi les classes disponibles." });
                     }
                     player.class = selectedClass;
                     await updatePlayer(player);
                     await sock.sendMessage(chatId, { text: `✅ Vous avez choisi la classe ${selectedClass}. Ce choix est maintenant définitif.` });
                     break;
                case 'acheter':
                    const weaponToBuyName = args.join(' ');
                    if (!weaponToBuyName) {
                        return await sock.sendMessage(chatId, { text: "Veuillez spécifier le nom de l'arme que vous souhaitez acheter." });
                    }

                    const weaponToBuy = weapons.find(w => w.name.toLowerCase() === weaponToBuyName.toLowerCase());
                    if (!weaponToBuy) {
                        return await sock.sendMessage(chatId, { text: "❌ Arme non trouvée." });
                    }

                    if (player.money < weaponToBuy.price) {
                        return await sock.sendMessage(chatId, { text: `❌ Vous n'avez pas assez d'argent. Il vous faut ${weaponToBuy.price} $ et vous avez ${player.money} $.` });
                    }

                    if (player.weaponInventory.includes(weaponToBuy.name)) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous possédez déjà cette arme." });
                    }

                    player.money -= weaponToBuy.price;
                    player.weaponInventory.push(weaponToBuy.name);
                    await updatePlayer(player);
                    await sock.sendMessage(chatId, { text: `✅ Vous avez acheté: *${weaponToBuy.name}* !` });
                    break;

                case 'equiper':
                    const weaponToEquipName = args.join(' ');
                    if (!weaponToEquipName) {
                        let inventoryList = "VOTRE INVENTAIRE D'ARMES:\n\n";
                        player.weaponInventory.forEach(item => { inventoryList += `➡️ ${item}\n`; });
                        return await sock.sendMessage(chatId, { text: inventoryList });
                    }

                    if (!player.weaponInventory.includes(weaponToEquipName)) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous ne possédez pas cette arme." });
                    }

                    player.equippedWeapon = weaponToEquipName;
                    await updatePlayer(player);
                    await sock.sendMessage(chatId, { text: `✅ Vous avez équipé: *${weaponToEquipName}* !` });
                    break;
                case 'duel':
                    const opponentJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (!opponentJid) {
                        return await sock.sendMessage(chatId, { text: "❌ Pour défier quelqu'un, vous devez le mentionner. Ex: `/duel @adversaire`" });
                    }
                    if (opponentJid === authorId) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous ne pouvez pas vous défier vous-même." });
                    }
                    if (findDuel(authorId)) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous êtes déjà en duel." });
                    }
                    if (findDuel(opponentJid)) {
                        return await sock.sendMessage(chatId, { text: "❌ Ce joueur est déjà en duel." });
                    }
                    if (game.invitations[opponentJid] || Object.values(game.invitations).some(inv => inv.from === authorId)) {
                        return await sock.sendMessage(chatId, { text: "❌ Une invitation est déjà en cours. Veuillez attendre." });
                    }

                    const timeout = setTimeout(() => {
                        delete game.invitations[opponentJid];
                        sock.sendMessage(chatId, { text: `Le défi de ${player.name} à <@${opponentJid.split('@')[0]}> a expiré.`, mentions: [opponentJid] });
                    }, 60000);

                    game.invitations[opponentJid] = { from: authorId, timeout };
                    await sock.sendMessage(chatId, {
                        text: `🗡️ ${player.name} a défié <@${opponentJid.split('@')[0]}> en duel ! L'adversaire a 60 secondes pour répondre avec \`/accepter\` ou \`/refuser\`.`,
                        mentions: [opponentJid]
                    });
                    break;
                case 'accepter': {
                    const invitation = game.invitations[authorId];
                    if (!invitation) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous n'avez aucune invitation en attente." });
                    }
                    clearTimeout(invitation.timeout);

                    const challengerId = invitation.from;
                    const duelId = [challengerId, authorId].sort().join(':');
                    game.duels[duelId] = { turn: challengerId };
                    delete game.invitations[authorId];

                    await sock.sendMessage(chatId, {
                        text: `🔥 Le duel entre <@${challengerId.split('@')[0]}> et <@${authorId.split('@')[0]}> commence ! C'est au tour de <@${challengerId.split('@')[0]}> de jouer.`,
                        mentions: [challengerId, authorId]
                    });
                    break;
                }

                case 'refuser': {
                    const inv = game.invitations[authorId];
                    if (!inv) {
                        return await sock.sendMessage(chatId, { text: "❌ Vous n'avez aucune invitation en attente." });
                    }
                    clearTimeout(inv.timeout);
                    const challenger = inv.from;
                    delete game.invitations[authorId];
                    await sock.sendMessage(chatId, {
                        text: `<@${authorId.split('@')[0]}> a refusé le défi de <@${challenger.split('@')[0]}>.`,
                        mentions: [authorId, challenger]
                    });
                    break;
                }
                case 'tire': {
                    const contextInfo = msg.message.extendedTextMessage?.contextInfo;
                    if (!contextInfo || !contextInfo.participant) {
                        return await sock.sendMessage(chatId, { text: "❌ Pour tirer, vous devez répondre au message d'un adversaire." });
                    }
                    const targetId = contextInfo.participant;
                    if (targetId === authorId) return await sock.sendMessage(chatId, { text: "❌ Vous ne pouvez pas vous tirer dessus !" });

                    const duelId = findDuel(authorId);
                    if (duelId) {
                        const duel = game.duels[duelId];
                        const opponentId = duelId.split(':').find(id => id !== authorId);
                        if (targetId !== opponentId) {
                            return await sock.sendMessage(chatId, { text: "❌ Vous êtes en duel. Vous ne pouvez attaquer que votre adversaire." });
                        }
                        if (duel.turn !== authorId) {
                            return await sock.sendMessage(chatId, { text: "❌ Ce n'est pas votre tour." });
                        }
                    } else {
                        if (findDuel(targetId)) {
                             return await sock.sendMessage(chatId, { text: "❌ Ce joueur est en duel et ne peut pas être attaqué." });
                        }
                    }

                    const playerWeapon = weapons.find(w => w.name === player.equippedWeapon);
                    if (!playerWeapon) return await sock.sendMessage(chatId, { text: "❌ Vous n'avez pas d'arme équipée." });

                    if (Math.random() < 0.1) { // 10% de chance de rater
                        return await sock.sendMessage(chatId, { text: `💨 Vous avez manqué votre cible !` });
                    }

                    let damage = playerWeapon.damage;
                    if (player.class === playerWeapon.class) { damage *= 1.2; }

                    const target = await getPlayer(targetId);

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

                        if (duelId) {
                            const winner = player;
                            const loser = target;
                            const reward = { xp: 50, money: 100 };
                            winner.xp += reward.xp;
                            winner.money += reward.money;
                            updateRank(winner);

                            await sock.sendMessage(chatId, { text: `🏆 Victoire ! Vous avez vaincu ${loser.name} et gagné ${reward.xp} XP et ${reward.money} $.` });
                             await sock.sendMessage(targetId, { text: `☠️ Vous avez été vaincu par ${winner.name}.` });
                            delete game.duels[duelId];
                        } else {
                            await sock.sendMessage(chatId, { text: `💥 Vous avez abattu ${target.name} !` });
                            await sock.sendMessage(targetId, { text: `☠️ ${player.name} vous a tué. Vous ne pourrez plus parler pendant 1 heure.` });
                        }

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

                        if (duelId) {
                            const opponentId = duelId.split(':').find(id => id !== authorId);
                            game.duels[duelId].turn = opponentId;
                            await sock.sendMessage(chatId, {
                                text: `C'est maintenant au tour de <@${opponentId.split('@')[0]}>.`,
                                mentions: [opponentId]
                            });
                        }
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

                    await updatePlayer(player);
                    await updatePlayer(target);
                    break;
                }
                case 'arme': {
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
                }
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
                    await updatePlayer(player);
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
                    await updatePlayer(player);
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
                case 'battleroyale':
                    await sock.sendMessage(chatId, { text: "Le mode Battle Royale est en cours de développement et sera bientôt disponible !" });
                    break;
                case 'braquage':
                    await sock.sendMessage(chatId, { text: "Le mode Braquage est en cours de développement et sera bientôt disponible !" });
                    break;
            }
        }
    });
}

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
                if (player.equippedWeapon === quest.completion.item || Object.values(player.equipment).includes(quest.completion.item)) {
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

            await updatePlayer(player);
            await sock.sendMessage(chatId, { text: `🎉 Quête terminée: *${quest.title}* !\nRécompense: ${quest.reward.xp} XP` });
        }
    }
}

io.on('connection', (socket) => {
    console.log('Un client est connecté au serveur WebSocket.');
});

async function start() {
    const db = await connectDB();
    playersCollection = db.collection('players');
    await connectToWhatsApp();
}

start().catch(console.error);
