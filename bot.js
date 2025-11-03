const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Chemin pour sauvegarder les données d'authentification
const AUTH_DIR = './auth_info_baileys/';

// Crée le dossier d'authentification s'il n'existe pas
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR);
}

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

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) &&
                                    lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('Connexion fermée à cause de:', lastDisconnect.error, ', reconnexion:', shouldReconnect);

            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Connexion ouverte !');
        }

        // Logique pour le code de pairage
        if (!sock.authState.creds.registered) {
             setTimeout(async () => {
                const phoneNumber = await requestPairingCode(); // Demande le numéro de téléphone à l'utilisateur
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`Votre code de pairage est : ${code}`);
            }, 3000);
        }
    });

    // Sauvegarde des identifiants de session
    sock.ev.on('creds.update', saveCreds);

    // --- LOGIQUE DE LA BASE DE DONNÉES DES JOUEURS ---
    const DB_FILE = path.join(__dirname, 'data', 'players.json');

    // Fonction pour lire la base de données des joueurs
    function getPlayersDatabase() {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error("Erreur lors de la lecture de la base de données, création d'une nouvelle.", error);
            return {}; // Retourne un objet vide si le fichier n'existe pas ou est corrompu
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
        if (!db[jid]) {
            console.log(`Nouveau joueur détecté : ${jid}. Création de l'entrée.`);
            db[jid] = {
                health: 100,
                energy: 100,
                weapon: 'Pistolet',
                location: 'Point de départ', // Localisation de base
                isDead: false,
                deathTimestamp: null
            };
            savePlayersDatabase(db);
        }
        return db[jid];
    }
    // --- FIN DE LA LOGIQUE DE LA BASE DE DONNÉES ---

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
            const statusMessage = `*📊 Vos Statistiques 📊*\n\n❤️ Vie : ${player.health}%\n⚡ Énergie : ${player.energy}%\n🔫 Arme équipée : ${player.weapon}`;
            await sock.sendMessage(sender, { text: statusMessage });
        }

        if (command === '/localisation') {
            const locationMessage = `*📍 Votre Localisation 📍*\n\nVous êtes actuellement à : *${player.location}*.\n\nDescription : Une zone ouverte avec quelques débris. Vous entendez le vent siffler.`;
            await sock.sendMessage(sender, { text: locationMessage });
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

            // Message pour le tireur
            await sock.sendMessage(sender, { text: `💥 Vous avez touché votre cible ! Elle perd ${damage}% de vie.` });

            // Message pour la cible
            await sock.sendMessage(targetJid, { text: `🤕 Vous avez été touché par un tir ! Vous perdez ${damage}% de vie. Votre vie est maintenant à ${db[targetJid].health}%.` });

            // Vérifie si la cible est morte
            if (db[targetJid].health <= 0) {
                db[targetJid].isDead = true;
                db[targetJid].deathTimestamp = Date.now();
                savePlayersDatabase(db);

                // Annonce de la mort
                await sock.sendMessage(sender, { text: `🎉 Félicitations, vous avez éliminé votre adversaire !` });
                await sock.sendMessage(targetJid, { text: `💀 Vous avez été éliminé. Vous ne pourrez plus envoyer de commandes pendant 1 heure.` });
            }
        }
        // --- FIN DE LA GESTION DES COMMANDES ---
    });

    // Fonction pour demander le numéro de téléphone dans le terminal
    function requestPairingCode() {
        return new Promise(resolve => {
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            readline.question('Veuillez entrer votre numéro de téléphone WhatsApp avec le code pays (ex: 33XXXXXXXXX) : ', num => {
                readline.close();
                resolve(num);
            });
        });
    }
}

// Lancer le bot
connectToWhatsApp().catch(err => console.log("Erreur inattendue : " + err));
