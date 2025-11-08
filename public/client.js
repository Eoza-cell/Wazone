document.addEventListener('DOMContentLoaded', () => {
    const debugLog = document.getElementById('debug-log');

    function log(message) {
        const p = document.createElement('p');
        p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        debugLog.appendChild(p);
        console.log(message); // Also log to browser console
    }

    log('Initialisation du client...');

    const socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    const qrCanvas = document.getElementById('qr-code-canvas');
    const statusText = document.querySelector('.status-text');

    log('Tentative de connexion au serveur...');
    statusText.textContent = 'Connexion au serveur...';

    socket.on('connect', () => {
        log('✅ Connecté au serveur !');
        statusText.textContent = 'En attente du QR code...';
    });

    socket.on('disconnect', (reason) => {
        log(`❌ Déconnecté : ${reason}`);
        statusText.textContent = '❌ Déconnecté. Tentative de reconnexion...';
    });

    socket.on('reconnecting', (attemptNumber) => {
        log(`⏳ Tentative de reconnexion n°${attemptNumber}...`);
        statusText.textContent = `⏳ Tentative de reconnexion (${attemptNumber})...`;
    });

    socket.on('reconnect_failed', () => {
        log('❌ La reconnexion a échoué définitivement.');
        statusText.textContent = '❌ Impossible de se reconnecter. Veuillez vérifier votre connexion et rafraîchir la page.';
    });

    socket.on('qrCode', (data) => {
        log('⬇️ QR code reçu.');

        // --- Enhanced Logging START ---
        log(`Type de data: ${typeof data}`);
        if (typeof data === 'object' && data !== null) {
            log(`Contenu de data: ${JSON.stringify(data)}`);
            log(`Type de data.qr: ${typeof data.qr}`);
            if (data.qr) {
                log(`QR data: "${data.qr.substring(0, 30)}..."`); // Log the start of the QR string
            } else {
                log("QR data est vide, null, ou undefined.");
            }
        } else if (data) {
             log(`Contenu de data (non-objet): ${String(data)}`);
        } else {
             log("Data reçue est vide, null ou undefined.");
        }
        // --- Enhanced Logging END ---

        statusText.textContent = 'Scannez ce code avec WhatsApp...';

        // Check if qr data is valid before trying to draw
        if (data && typeof data === 'object' && data.qr && typeof data.qr === 'string') {
            QRCode.toCanvas(qrCanvas, data.qr, function (error) {
                if (error) {
                    log(`Canvas Error: ${error}`);
                    console.error(error)
                } else {
                    log('🎨 QR code dessiné avec succès !');
                }
            });
        } else {
            log("❌ Données QR invalides. Impossible de dessiner le code.");
            statusText.textContent = "Erreur: Données du QR code invalides."
        }
    });

    socket.on('connectionSuccess', () => {
        log('🎉 Connexion du bot réussie !');
        qrCanvas.style.display = 'none';
        statusText.textContent = '✅ Bot connecté avec succès !';
    });
});
