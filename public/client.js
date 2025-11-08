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
        statusText.textContent = 'Scannez ce code avec WhatsApp...';
        QRCode.toCanvas(qrCanvas, data.qr, function (error) {
            if (error) {
                log(`Canvas Error: ${error}`);
                console.error(error)
            };
            log('🎨 QR code dessiné avec succès !');
        });
    });

    socket.on('connectionSuccess', () => {
        log('🎉 Connexion du bot réussie !');
        qrCanvas.style.display = 'none';
        statusText.textContent = '✅ Bot connecté avec succès !';
    });
});
