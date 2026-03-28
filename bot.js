const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { HttpsProxyAgent } = require('https-proxy-agent');
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
const SUPER_ADMIN = '22663685468@s.whatsapp.net';
const WHATSAPP_VERSION = [2, 3000, 1027934701];

// Cache pour les administrateurs de groupe
const groupAdminsCache = new Map();

async function getGroupAdmins(sock, chatId) {
    if (!chatId || !chatId.endsWith('@g.us')) return [];

    // Utiliser le cache si possible (5 minutes de validité)
    const cached = groupAdminsCache.get(chatId);
    if (cached && (Date.now() - cached.timestamp < 300000)) {
        return cached.admins;
    }

    try {
        console.log(`[WA] Récupération des admins pour le groupe: ${chatId}`);
        const metadata = await sock.groupMetadata(chatId);
        const admins = metadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id.split('@')[0].split(':')[0].replace(/\D/g, '')); // Normaliser les IDs

        console.log(`[WA] Admins trouvés pour ${chatId}: ${admins.join(', ')}`);
        groupAdminsCache.set(chatId, { admins, timestamp: Date.now() });
        return admins;
    } catch (e) {
        console.error(`[WA] Erreur groupMetadata pour ${chatId}:`, e);
        return [];
    }
}

function normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return null;
    const num = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
    return `${num}@s.whatsapp.net`;
}

function isSuperAdmin(jid) {
    if (!jid) return false;
    // Extraction du numéro pur (sans device ID, sans domaine, sans caractères spéciaux)
    const num = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
    // Vérification flexible : soit le numéro complet, soit la fin du numéro pour pallier aux variations d'indicatif
    return num === '22663685468' || num.endsWith('63685468');
}
const waSocketLogOption = pino({ level: 'info' });
const WaSockQrTimeout = 60000;
let lastQR = null;

app.set('trust proxy', 1); // Indispensable pour les environnements avec proxy comme Render
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
    console.log(`Le serveur web est en écoute sur http://localhost:${PORT}`);
});

io.on('connection', (socket) => {
    console.log('Client Socket.IO connecté');
    if (lastQR) {
        socket.emit('qrCode', { qr: lastQR });
    }
});
// --- FIN DE LA CONFIGURATION ---

const AUTH_DIR = './auth_info_baileys/';
const PLAYERS_FILE = './data/players.json';
const NEOVERSE_FILE = './data/neoverse.json';
const GENERATED_IMAGES_DIR = './generated_images/';

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR);
if (!fs.existsSync(GENERATED_IMAGES_DIR)) fs.mkdirSync(GENERATED_IMAGES_DIR);
if (!fs.existsSync(path.dirname(PLAYERS_FILE))) fs.mkdirSync(path.dirname(PLAYERS_FILE), { recursive: true });
if (!fs.existsSync(PLAYERS_FILE)) fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}));

// IA NeoVerse
class NeoVerseBot {
    constructor() {
        this.load();
        this.regles = {
            maxActions: 4,
            vitesseMax: { C: 5, B: 6, A: 7 }
        }
        this.synonymes = {
            ajouter: ["ajoute", "crée", "inscrire"],
            combat: ["combat", "fight", "duel"],
            stats: ["stats", "profil", "niveau"],
            attaque: ["attaque", "frappe", "coup", "tape"],
            deplacement: ["avance", "recule", "sprint", "fonce", "esquive"]
        }
    }

    load() {
        if (fs.existsSync(NEOVERSE_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(NEOVERSE_FILE, 'utf8'));
                this.joueurs = data.joueurs || {};
                this.combats = data.combats || {};
            } catch (e) {
                this.joueurs = {};
                this.combats = {};
            }
        } else {
            this.joueurs = {};
            this.combats = {};
        }
    }

    save() {
        fs.writeFileSync(NEOVERSE_FILE, JSON.stringify({ joueurs: this.joueurs, combats: this.combats }, null, 2));
    }

    interpret(message) {
        const original = message;
        message = message.toLowerCase();

        if (this.has(message, "ajouter")) {
            const nom = this.getNames(original)[0];
            const rang = this.getRank(message);
            return this.addPlayer(nom, rang);
        }

        if (this.has(message, "stats")) {
            return this.getStats(this.getNames(original)[0]);
        }

        if (this.has(message, "combat")) {
            const noms = this.getNames(original);
            return this.startFight(noms[0], noms[1]);
        }

        if (this.has(message, "attaque") || this.has(message, "deplacement")) {
            return this.handleAction(original);
        }

        return "🤖 Je ne comprends pas.";
    }

    has(msg, type) {
        return this.synonymes[type].some(w => msg.includes(w));
    }

    getNames(msg) {
        return msg.match(/[A-Z][a-z]+/g) || [];
    }

    getRank(msg) {
        const r = msg.match(/rang\s?(a|b|c)/);
        return r ? r[1].toUpperCase() : "C";
    }

    getDistance(msg) {
        const m = msg.match(/(\d+)\s?m/);
        return m ? parseInt(m[1]) : 1;
    }

    getSpeed(msg) {
        const m = msg.match(/(\d+)\s?m\/s/);
        return m ? parseInt(m[1]) : 1;
    }

    getZone(msg) {
        if (msg.includes("tête")) return "tête";
        if (msg.includes("bras")) return "bras";
        if (msg.includes("jambe")) return "jambe";
        return "torse";
    }

    getMembre(msg) {
        if (msg.includes("main droite")) return "main droite";
        if (msg.includes("main gauche")) return "main gauche";
        if (msg.includes("pied")) return "pied";
        return null;
    }

    addPlayer(nom, rang) {
        if (!nom) return "❌ Nom manquant";
        this.joueurs[nom] = {
            rang,
            vie: 100,
            energie: 100,
            derniereAction: null
        };
        this.save();
        return `✅ ${nom} ajouté (rang ${rang})`;
    }

    getStats(nom) {
        const j = this.joueurs[nom];
        if (!j) return "❌ Joueur introuvable";
        return `📊 ${nom}\n❤️ ${j.vie}% | ⚡ ${j.energie}% | Rang ${j.rang}`;
    }

    startFight(j1, j2) {
        if (!this.joueurs[j1] || !this.joueurs[j2]) {
            return "❌ Joueurs invalides";
        }
        this.combats[j1] = j2;
        this.combats[j2] = j1;
        this.save();
        return `⚔️ Combat lancé entre ${j1} et ${j2}`;
    }

    handleAction(message) {
        const noms = this.getNames(message);
        const joueur = noms[0];
        const cible = this.combats[joueur];
        if (!joueur || !this.joueurs[joueur]) return "❌ Joueur inconnu";
        if (!cible) return "❌ Pas en combat";
        const action = {
            type: this.has(message.toLowerCase(), "attaque") ? "attaque" : "deplacement",
            distance: this.getDistance(message),
            vitesse: this.getSpeed(message),
            zone: this.getZone(message),
            membre: this.getMembre(message)
        };
        return this.resolveAction(joueur, cible, action);
    }

    calcDamage(action) {
        if (action.zone === "tête") return 100;
        if (["bras", "jambe"].includes(action.zone)) return 25;
        return 10;
    }

    resolveAction(joueur, cible, action) {
        const j = this.joueurs[joueur];
        const ennemi = this.joueurs[cible];
        let erreurs = [];
        const vmax = this.regles.vitesseMax[j.rang];
        if (action.vitesse > vmax) erreurs.push("Vitesse trop élevée");
        if (action.distance > 10) erreurs.push("Distance irréaliste");
        if (!action.membre && action.type === "attaque") erreurs.push("Membre manquant");

        if (erreurs.length > 0) {
            let degats = 10;
            if (ennemi.derniereAction && ennemi.derniereAction.type === "attaque") {
                degats = this.calcDamage(ennemi.derniereAction);
            }
            j.vie -= degats;
            if (j.vie < 0) j.vie = 0;
            this.save();
            return `⚖️ REFUSÉ ❌\n- ${erreurs.join("\n- ")}\n\n🚫 ${joueur} IMMOBILE\n💥 ${cible} attaque\n\n💢 ${degats}% dégâts\n❤️ ${joueur}: ${j.vie}%`;
        }

        j.derniereAction = action;
        if (action.type === "attaque") {
            const degats = this.calcDamage(action);
            ennemi.vie -= degats;
            if (ennemi.vie < 0) ennemi.vie = 0;
            this.save();
            return `⚔️ ACTION VALIDÉE\n👊 ${joueur} → ${cible}\n📍 ${action.zone}\n💥 ${degats}%\n\n❤️ ${cible}: ${ennemi.vie}%`;
        }
        this.save();
        return `⚖️ Déplacement validé`;
    }
}

const neoBot = new NeoVerseBot();

let players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));

const EXAM_QUESTIONS = [
    { q: "Dans 'One Piece', quel est le vrai nom de Barbe Noire ?", a: "Marshall D. Teach", type: "manga" },
    { q: "Quel manga met en scène un carnet capable de tuer ?", a: "Death Note", type: "manga" },
    { q: "Qui est l'auteur de 'Dragon Ball' ?", a: "Akira Toriyama", type: "manga" },
    { q: "Dans 'Naruto', qui est le sensei de l'équipe 7 ?", a: "Kakashi Hatake", type: "manga" },
    { q: "Quel est le nom du protagoniste de 'Solo Leveling' ?", a: "Sung Jin-woo", type: "manga" },
    { q: "En JavaScript, comment déclare-t-on une variable constante ?", a: "const", type: "prog" },
    { q: "Quel langage est principalement utilisé pour le style d'une page web ?", a: "CSS", type: "prog" },
    { q: "Que signifie HTML ?", a: "HyperText Markup Language", type: "prog" },
    { q: "Quel symbole est utilisé pour les commentaires sur une seule ligne en Java ?", a: "//", type: "prog" },
    { q: "Dans quel langage Python a-t-il été écrit ?", a: "C", type: "prog" }
];

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
            classe: null,
            lastExam: 0,
            lastGoodAction: 0,
            messageCount: 0,
            pendingExam: null,
            stellarBalance: 0, // Positif = Stellars, Négatif = Tonitos
            advantages: []
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

function updateStellarBalance(player, amount) {
    player.stellarBalance += amount;

    // Vérification des transformations
    if (player.stellarBalance >= 13 && player.status !== 'VIP') {
        player.status = 'VIP';
    } else if (player.stellarBalance <= -10 && player.status !== 'ENG') {
        player.status = 'ENG';
    } else if (player.stellarBalance > -10 && player.stellarBalance < 13) {
        if (player.status === 'VIP' || player.status === 'ENG') {
            player.status = 'inscrit';
        }
    }
}

async function generateStatusImage(player) {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `${player.id}.png`);
    const pointPercent = Math.min(100, (player.points / 2000) * 100);
    const pointColor = player.points > 500 ? '#2ecc71' : (player.points > 100 ? '#f1c40f' : '#c0392b');

    const stellarCount = player.stellarBalance > 0 ? player.stellarBalance : 0;
    const tonitoCount = player.stellarBalance < 0 ? Math.abs(player.stellarBalance) : 0;

    let statusColor = '#2ecc71';
    if (player.status === 'expulsé' || player.status === 'ENG') statusColor = '#c0392b';
    if (player.status === 'VIP') statusColor = '#f1c40f';

    const svg = `
    <svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <style>
                .background { fill: #1C1C1C; }
                .name { font-family: monospace; font-size: 28px; fill: #EAEAEA; text-transform: uppercase; }
                .label { font-family: monospace; font-size: 18px; fill: #f1c40f; text-transform: uppercase; }
                .value { font-family: monospace; font-size: 16px; fill: #EAEAEA; }
                .bar-bg { fill: #333; }
                .stellar { fill: #f1c40f; font-weight: bold; }
                .tonito { fill: #e74c3c; font-weight: bold; }
            </style>
        </defs>

        <rect width="100%" height="100%" class="background" />

        <!-- Cadre -->
        <rect x="5" y="5" width="490" height="290" fill="none" stroke="#7f8c8d" stroke-width="1" stroke-opacity="0.5"/>
        <path d="M15 30 V15 H30" stroke="#f1c40f" stroke-width="2" fill="none"/>
        <path d="M485 30 V15 H470" stroke="#f1c40f" stroke-width="2" fill="none"/>

        <text x="30" y="45" class="name">${player.name}</text>
        <text x="470" y="45" text-anchor="end" class="label" style="fill: #7f8c8d; font-size: 14px;">[ ${player.role.toUpperCase()} | CLASSE ${player.classe || '?' } ]</text>

        <!-- Barre de points -->
        <text x="30" y="100" class="label">Points Privés</text>
        <rect x="30" y="110" width="440" height="25" class="bar-bg" />
        <rect x="30" y="110" width="${pointPercent * 4.4}" height="25" fill="${pointColor}" />
        <text x="465" y="128" text-anchor="end" class="value">${player.points} pts</text>

        <!-- Stellars & Tonitos -->
        <text x="30" y="170" class="label">Récompenses:</text>
        <text x="30" y="195" class="value stellar">⭐ STELLARS: ${stellarCount}</text>
        <text x="250" y="195" class="value tonito">👿 TONITOS: ${tonitoCount}</text>

        <!-- Statut -->
        <text x="30" y="250" class="label">Statut: <tspan class="value" style="fill: ${statusColor}">${player.status.toUpperCase()}</tspan></text>
    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

async function generateMenuImage() {
    const imagePath = path.join(GENERATED_IMAGES_DIR, `menu.png`);
    const svg = `
    <svg width="600" height="600" xmlns="http://www.w3.org/2000/svg">
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
      <path d="M10 580 V590 H20" stroke="#c0392b" stroke-width="2" fill="none"/>
      <path d="M590 580 V590 H580" stroke="#c0392b" stroke-width="2" fill="none"/>

      <text x="300" y="50" text-anchor="middle" class="title">COTE RP // COMMANDES</text>

      <!-- ÉLÈVES -->
      <text x="40" y="100" class="category">>> ÉLÈVES</text>
      <text x="50" y="130" class="command">/inscription [A/B/C/D]</text>
      <text x="50" y="145" class="desc">Inscrivez-vous dans une classe.</text>

      <text x="50" y="180" class="command">/statut</text>
      <text x="50" y="195" class="desc">Affiche vos points et votre rôle.</text>

      <text x="50" y="230" class="command">/examen</text>
      <text x="50" y="245" class="desc">Passez un examen pour gagner des points.</text>

      <text x="320" y="130" class="command">/bonneaction</text>
      <text x="320" y="145" class="desc">Aidez un camarade pour +10 pts.</text>

      <text x="320" y="180" class="command">/ordre [mention] [texte]</text>
      <text x="320" y="195" class="desc">VIP: Donner un ordre à un ENG.</text>

      <!-- STAFF -->
      <text x="40" y="320" class="category">>> ADMINISTRATION</text>
      <text x="50" y="350" class="command">/donnerpoints</text>
      <text x="50" y="400" class="command">/enleverpoints</text>
      <text x="50" y="450" class="command">/expulser</text>
      <text x="50" y="500" class="command">/promouvoir</text>

      <text x="320" y="350" class="command">/stellar [n]</text>
      <text x="320" y="365" class="desc">Attribuer des Stellars.</text>

      <text x="320" y="400" class="command">/tonito [n]</text>
      <text x="320" y="415" class="desc">Attribuer des Tonitos.</text>

    </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);
    return imagePath;
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // On récupère la dernière version pour éviter l'erreur 405 (Method Not Allowed)
    // Mais on garde la version demandée par l'utilisateur comme priorité si possible
    let waVersion = WHATSAPP_VERSION;
    try {
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[WA] Version actuelle: ${version.join('.')}, isLatest: ${isLatest}`);
        // Fallback sur la dernière version uniquement si la connexion échoue (géré par le fait que waVersion est initialisé)
        // Note: Dans cet environnement, l'ancienne version CAUSE le 405, donc on préfère la plus récente.
        waVersion = version;
    } catch (e) {
        console.error("[WA] Erreur récupération version, utilisation par défaut.");
    }

    const agent = process.env.PROXY_URL ? new HttpsProxyAgent(process.env.PROXY_URL) : undefined;

    const sock = makeWASocket({
        logger: waSocketLogOption,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        version: waVersion,
        agent,
        syncFullHistory: false,
        shouldSyncHistoryMessage: (m) => false,
        qrTimeout: WaSockQrTimeout,
        defaultQueryTimeoutMs: undefined,
        getMessage: async key => {
            console.log('⚠️ Message non déchiffré, retry demandé:', key);
            return { conversation: '🔄 Réessaye d\'envoyer ton message' };
        }
    });

    sock.ev.on('groups.update', (updates) => {
        for (const update of updates) {
            if (update.id) groupAdminsCache.delete(update.id);
        }
    });

    sock.ev.on('group-participants.update', (update) => {
        if (update.id) groupAdminsCache.delete(update.id);
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log('Update de connexion:', { connection, lastDisconnect: lastDisconnect?.error?.message, qr: qr ? 'Reçu' : 'Non reçu' });

        if (qr) {
            console.log('QR reçu, envoi au client via Socket.IO');
            try {
                lastQR = await qrcode.toDataURL(qr);
                io.emit('qrCode', { qr: lastQR });
            } catch (err) {
                console.error('Erreur génération QR:', err);
            }
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error?.output?.statusCode;
            const shouldReconnect = (error instanceof Boom) && statusCode !== DisconnectReason.loggedOut;

            console.log('Connexion fermée:', error, ', reconnexion:', shouldReconnect);

            if (statusCode === 405) {
                io.emit('error', "WhatsApp a rejeté la connexion (Erreur 405). Cela arrive souvent sur les hébergeurs cloud. Vérifiez votre configuration de proxy ou la version de WhatsApp.");
            } else if (!shouldReconnect) {
                io.emit('error', `Connexion fermée : ${error?.message || 'Erreur inconnue'}`);
            }

            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 5000); // Délai avant reconnexion
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

        const chatId = msg.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        // On détermine l'ID de l'envoyeur de manière robuste
        const rawSenderId = isGroup ? (msg.key.participant || msg.participant) : (msg.key.fromMe ? sock.user.id : chatId);

        if (!rawSenderId) return;

        const isMasterSender = isSuperAdmin(rawSenderId);

        // On ignore les messages du bot, sauf si c'est le numéro maître qui parle sur son propre compte
        if (msg.key.fromMe && !isMasterSender) return;

        if (!rawSenderId) return;

        const normalizedSenderId = normalizeJid(rawSenderId);
        const senderNumber = normalizedSenderId.split('@')[0];

        const messageContent = msg.message.conversation ||
                               msg.message.extendedTextMessage?.text ||
                               msg.message.imageMessage?.caption ||
                               msg.message.videoMessage?.caption ||
                               '';
        if (!messageContent) return;

        const args = messageContent.trim().split(/ +/);
        const firstArg = args.shift().toLowerCase();
        const command = firstArg.startsWith('/') ? firstArg.slice(1) : null;

        // Détection du staff (Super Admin ou Admin de Groupe)
        const isMaster = isMasterSender;
        const groupAdmins = isGroup ? await getGroupAdmins(sock, chatId) : [];
        const isAdmin = groupAdmins.includes(senderNumber);

        const player = getPlayer(normalizedSenderId);
        if (!player.name || player.name === 'Inconnu') player.name = msg.pushName || 'Inconnu';

        // Mise à jour dynamique du rôle staff
        let roleChanged = false;
        if (isMaster) {
            if (player.role !== 'principal') {
                player.role = 'principal';
                roleChanged = true;
                console.log(`[STAFF] Reconnu Maître: ${senderNumber}`);
            }
        } else if (isAdmin) {
            if (player.role === 'élève') {
                player.role = 'professeur';
                roleChanged = true;
                console.log(`[STAFF] Reconnu Admin Groupe: ${senderNumber}`);
            }
        }
        if (roleChanged) savePlayers();

        // Détermination finale du statut staff (Priorité absolue à isMaster et isAdmin)
        const isStaff = isMaster || isAdmin || ['professeur', 'principal'].includes(player.role);

        if (command === 'debugstaff') {
            try {
                const admins = isGroup ? await getGroupAdmins(sock, chatId) : [];
                const status = `🛠️ *DEBUG STAFF*\n\n` +
                               `📱 Votre JID: ${rawSenderId}\n` +
                               `🔢 Votre Numéro: ${senderNumber}\n` +
                               `👑 Master (Code): ${isMaster ? 'OUI' : 'NON'}\n` +
                               `🛡️ Admin Groupe: ${isAdmin ? 'OUI' : 'NON'}\n` +
                               `👥 Staff (Total): ${isStaff ? 'OUI' : 'NON'}\n` +
                               `🎓 Rôle DB: ${player.role.toUpperCase()}\n\n` +
                               `📋 Admins du groupe:\n${admins.length > 0 ? admins.join('\n') : 'Aucun ou erreur'}\n\n` +
                               `🤖 Bot ID: ${sock.user.id}\n` +
                               `ℹ️ _Si vous êtes admin mais "Admin Groupe" est NON, utilisez /refreshadmins_`;
                return await sock.sendMessage(chatId, { text: status });
            } catch (err) {
                return await sock.sendMessage(chatId, { text: `❌ Erreur debug: ${err.message}` });
            }
        }

        if (command === 'refreshadmins') {
            if (!isGroup) return await sock.sendMessage(chatId, { text: "❌ Cette commande ne fonctionne qu'en groupe." });
            groupAdminsCache.delete(chatId);
            const admins = await getGroupAdmins(sock, chatId);
            return await sock.sendMessage(chatId, { text: `✅ Liste des administrateurs mise à jour. ${admins.length} admins détectés.` });
        }

        if (command === 'iamadmin') {
            try {
                const admins = isGroup ? await getGroupAdmins(sock, chatId) : [];
                const isAdminGroup = admins.includes(senderNumber);
                const isM = isMaster;

                let resp = `🔍 *VÉRIFICATION ACCÈS*\n\n` +
                           `📱 Votre Numéro: ${senderNumber}\n` +
                           `👑 Maître Bot: ${isM ? 'OUI' : 'NON'}\n` +
                           `🛡️ Admin Groupe: ${isAdminGroup ? 'OUI' : 'NON'}\n` +
                           `👥 Accès Staff Bot: ${isStaff ? 'OUI' : 'NON'}\n` +
                           `🎓 Rôle DB: ${player.role.toUpperCase()}\n\n`;

                if (isStaff) {
                    resp += `✅ *ACCÈS STAFF ACCORDÉ.*`;
                } else {
                    resp += `❌ *ACCÈS STAFF REFUSÉ.*\n\n` +
                            `💡 _Note aux admins : Si vous êtes admin du groupe mais que le bot dit NON, vérifiez que le bot est aussi administrateur du groupe, puis faites /refreshadmins._`;
                }
                return await sock.sendMessage(chatId, { text: resp });
            } catch (err) {
                return await sock.sendMessage(chatId, { text: `❌ Erreur vérification: ${err.message}` });
            }
        }

        if (command) {
            console.log(`[CMD] ${command} | De: ${senderNumber} | Staff: ${isStaff} | Role: ${player.role}`);
        }

        // --- IA NeoVerse (Déclenchement naturel ou commande /neo) ---
        if (messageContent.toLowerCase().startsWith('neo,') || command === 'neo') {
            const input = command === 'neo' ? args.join(' ') : messageContent.slice(4).trim();
            if (!input) return await sock.sendMessage(chatId, { text: "🤖 Oui ? Je vous écoute." });

            const response = neoBot.interpret(input);
            return await sock.sendMessage(chatId, { text: response });
        }

        if (command === 'stafflist' && isStaff) {
            const staff = Object.values(players)
                .filter(p => ['professeur', 'principal'].includes(p.role))
                .map(p => `- ${p.name} (${p.id.split('@')[0]}) : ${p.role.toUpperCase()}`);

            return await sock.sendMessage(chatId, { text: `👥 *LISTE DU STAFF ENREGISTRÉ*\n\n${staff.length > 0 ? staff.join('\n') : 'Aucun staff en base de données.'}` });
        }

        // --- Gestion des Réponses aux Examens ---
        if (player.pendingExam && msg.message.extendedTextMessage?.contextInfo?.stanzaId === player.pendingExam.msgId) {
            const userAnswer = messageContent.trim().toLowerCase();
            const correctAnswer = player.pendingExam.answer.toLowerCase();

            if (userAnswer === correctAnswer) {
                const reward = 200;
                updatePoints(player, reward);
                updateStellarBalance(player, 1);
                await sock.sendMessage(chatId, { text: `✅ *EXCELLENT:* Bonne réponse ! Vous gagnez ${reward} points privés et +1 ⭐ Stellar.` });
            } else {
                const penalty = 100;
                updatePoints(player, -penalty);
                await sock.sendMessage(chatId, { text: `❌ *ÉCHEC:* La bonne réponse était: ${player.pendingExam.answer}. Vous perdez ${penalty} points.` });
            }
            player.pendingExam = null;
            savePlayers();
            return;
        }

        if (player.status === 'expulsé' && !isStaff) {
            return; // Les élèves expulsés ne peuvent plus interagir avec le bot, sauf s'ils sont staff
        }

        if (command) {
            // Le staff est exempté d'inscription obligatoire
            if (!player.classe && !isStaff && command !== 'inscription' && command !== 'menu' && command !== 'aide') {
                return await sock.sendMessage(chatId, { text: "⚠️ Vous n'êtes pas encore inscrit. Utilisez */inscription [A/B/C/D]* pour rejoindre une classe." });
            }

            switch(command) {
                case 'inscription': {
                    if (player.classe) return await sock.sendMessage(chatId, { text: `✅ Vous êtes déjà inscrit en classe ${player.classe}.` });
                    const choice = args[0]?.toUpperCase();
                    if (!['A', 'B', 'C', 'D'].includes(choice)) return await sock.sendMessage(chatId, { text: "❌ Veuillez choisir une classe valide : A, B, C ou D.\nExemple: /inscription A" });

                    player.classe = choice;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `🎓 Félicitations ! Vous avez été affecté à la *Classe ${choice}*.\nUtilisez /menu pour voir vos options.` });
                    break;
                }
                case 'menu':
                case 'aide': {
                    const menuImagePath = await generateMenuImage();
                    await sock.sendMessage(chatId, { image: { url: menuImagePath }, caption: "Bienvenue sur l'interface du Lycée Kōdo Ikusei."});
                    break;
                }
                case 'statut': {
                    const statusImagePath = await generateStatusImage(player);
                    const stellarCount = player.stellarBalance > 0 ? player.stellarBalance : 0;
                    const tonitoCount = player.stellarBalance < 0 ? Math.abs(player.stellarBalance) : 0;

                    const caption = `📊 *PROFIL ÉLÈVE*\n\n` +
                                   `👤 Nom: ${player.name}\n` +
                                   `🎓 Classe: ${player.classe}\n` +
                                   `🛡️ Rôle: ${player.role.toUpperCase()}\n` +
                                   `💰 Points: ${player.points}\n` +
                                   `⭐ Stellars: ${stellarCount}\n` +
                                   `👿 Tonitos: ${tonitoCount}\n` +
                                   `🚩 Statut: ${player.status.toUpperCase()}`;

                    await sock.sendMessage(chatId, { image: { url: statusImagePath }, caption });
                    break;
                }
                case 'examen': {
                    const now = Date.now();
                    if (now - player.lastExam < 1800000) {
                        const remaining = Math.ceil((1800000 - (now - player.lastExam)) / 60000);
                        return await sock.sendMessage(chatId, { text: `⏳ Vous avez déjà passé un examen récemment. Réessayez dans ${remaining} minutes.` });
                    }

                    const question = EXAM_QUESTIONS[Math.floor(Math.random() * EXAM_QUESTIONS.length)];
                    const sentMsg = await sock.sendMessage(chatId, { text: `📝 *EXAMEN [${question.type.toUpperCase()}]*\n\nQuestion: ${question.q}\n\n_Répondez à ce message avec la bonne réponse._` });

                    player.pendingExam = {
                        msgId: sentMsg.key.id,
                        answer: question.a,
                        timestamp: now
                    };
                    player.lastExam = now;
                    savePlayers();
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
                    if (!isStaff) return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut distribuer des points." });
                    let targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (targetId) targetId = normalizeJid(targetId);

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
                    if (!isStaff) return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut retirer des points." });
                    let targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (targetId) targetId = normalizeJid(targetId);

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
                    if (!isStaff) return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut expulser un élève." });
                    let targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (targetId) targetId = normalizeJid(targetId);

                    if (!targetId) return await sock.sendMessage(chatId, { text: "❌ Usage: /expulser [mention/réponse]" });

                    const target = getPlayer(targetId);
                    target.points = 0;
                    target.status = 'expulsé';
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `🚫 *EXPULSION:* ${target.name} a été expulsé par ${player.role} ${player.name}.` });
                    break;
                }
                case 'promouvoir': {
                    // Seul le numéro configuré ou le super admin peut promouvoir
                    if (player.role !== 'principal' && !isMaster) {
                        return await sock.sendMessage(chatId, { text: "❌ Seul le Principal ou le Super Admin peut promouvoir quelqu'un." });
                    }
                    let targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (targetId) targetId = normalizeJid(targetId);

                    const newRole = msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? args[1] : args[0];
                    if (!targetId || !['professeur', 'principal'].includes(newRole)) return await sock.sendMessage(chatId, { text: "❌ Usage: /promouvoir [mention/réponse] [professeur/principal]" });

                    const target = getPlayer(targetId);
                    target.role = newRole;
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `🎓 ${target.name} a été promu au rang de ${newRole}.` });
                    break;
                }
                case 'stellar': {
                    if (!isStaff) return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut attribuer des Stellars." });
                    let targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (targetId) targetId = normalizeJid(targetId);

                    const amount = parseInt(msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? args[1] : args[0]) || 1;
                    if (!targetId) return await sock.sendMessage(chatId, { text: "❌ Usage: /stellar [mention/réponse] [quantité]" });

                    const target = getPlayer(targetId);
                    updateStellarBalance(target, amount);
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `⭐ ${player.name} a attribué ${amount} Stellar(s) à ${target.name}. Statut actuel: ${target.status}` });
                    break;
                }
                case 'tonito': {
                    if (!isStaff) return await sock.sendMessage(chatId, { text: "❌ Seul le staff peut attribuer des Tonitos." });
                    let targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (targetId) targetId = normalizeJid(targetId);

                    const amount = parseInt(msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? args[1] : args[0]) || 1;
                    if (!targetId) return await sock.sendMessage(chatId, { text: "❌ Usage: /tonito [mention/réponse] [quantité]" });

                    const target = getPlayer(targetId);
                    updateStellarBalance(target, -amount);
                    savePlayers();
                    await sock.sendMessage(chatId, { text: `👿 ${player.name} a attribué ${amount} Tonito(s) à ${target.name}. Statut actuel: ${target.status}` });
                    break;
                }
                case 'ordre': {
                    if (player.status !== 'VIP' && !isMaster) return await sock.sendMessage(chatId, { text: "❌ Seuls les VIP peuvent donner des ordres." });
                    let targetId = msg.message.extendedTextMessage?.contextInfo?.participant || (msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? msg.message.extendedTextMessage.contextInfo.mentionedJid[0] : null);
                    if (targetId) targetId = normalizeJid(targetId);

                    const orderText = msg.message.extendedTextMessage?.contextInfo?.mentionedJid ? args.slice(1).join(' ') : args.join(' ');

                    if (!targetId || !orderText) return await sock.sendMessage(chatId, { text: "❌ Usage: /ordre [mention/réponse] [texte]" });

                    const target = getPlayer(targetId);
                    if (target.status !== 'ENG') return await sock.sendMessage(chatId, { text: "❌ Vous ne pouvez donner des ordres qu'aux ENG." });

                    await sock.sendMessage(chatId, { text: `📢 *ORDRE:* @${normalizedSenderId.split('@')[0]} donne un ordre à @${targetId.split('@')[0]}\n\n📜 *ORDRE:* ${orderText}`, mentions: [normalizedSenderId, targetId] });
                    break;
                }
                case 'regles': await sock.sendMessage(chatId, { text: "📜 Lycée Kōdo Ikusei - Règlement :\n1. Le mérite est la seule valeur.\n2. Si vos points tombent à zéro, vous êtes expulsé.\n3. Le respect du staff est obligatoire." }); break;
            }
        }
    });
}

connectToWhatsApp().catch(err => console.error("Erreur inattendue : ", err));
