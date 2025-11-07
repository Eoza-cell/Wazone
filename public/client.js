document.addEventListener('DOMContentLoaded', () => {
    const socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    const qrCanvas = document.getElementById('qr-code-canvas');
    const statusText = document.querySelector('.status-text');

    statusText.textContent = 'Connexion au serveur...';

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = 'En attente du QR code...';
    });

    socket.on('disconnect', (reason) => {
        console.log(`Déconnecté : ${reason}`);
        statusText.textContent = '❌ Déconnecté. Tentative de reconnexion...';
    });

    socket.on('reconnecting', (attemptNumber) => {
        console.log(`Tentative de reconnexion n°${attemptNumber}...`);
        statusText.textContent = `⏳ Tentative de reconnexion (${attemptNumber})...`;
    });

    socket.on('reconnect_failed', () => {
        console.error('La reconnexion a échoué définitivement.');
        statusText.textContent = '❌ Impossible de se reconnecter. Veuillez vérifier votre connexion et rafraîchir la page.';
    });

    socket.on('qrCode', (data) => {
        console.log('QR code reçu.');
        statusText.textContent = 'Scannez ce code avec WhatsApp...';
        QRCode.toCanvas(qrCanvas, data.qr, function (error) {
            if (error) console.error(error);
            console.log('QR code dessiné avec succès !');
        });
    });

    socket.on('connectionSuccess', () => {
        console.log('Connexion du bot réussie !');
        qrCanvas.style.display = 'none';
        statusText.textContent = '✅ Bot connecté avec succès !';
    });
});
