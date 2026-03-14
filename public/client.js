document.addEventListener('DOMContentLoaded', () => {
    const socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');
    const pairingCodeElement = document.getElementById('pairing-code');
    const statusText = document.querySelector('.status-text');

    statusText.textContent = 'Connexion au serveur...';

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = 'En attente du QR Code...';
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
        if (data && data.qr) {
            console.log(`QR Code reçu`);
            qrImage.src = data.qr;
            qrImage.style.display = 'block';
            pairingCodeElement.style.display = 'none';
            statusText.textContent = 'Scannez ce QR Code sur WhatsApp pour vous connecter.';
        } else {
             console.error("Données du QR Code invalides reçues.");
             statusText.textContent = "Erreur: Données du QR invalides."
        }
    });

    socket.on('connectionSuccess', () => {
        console.log('Connexion du bot réussie !');
        qrContainer.style.display = 'none';
        statusText.textContent = '✅ Bot connecté avec succès !';
    });

    socket.on('error', (errorMessage) => {
        console.error(`Erreur du serveur: ${errorMessage}`);
        pairingCodeElement.textContent = "ERREUR";
        statusText.textContent = errorMessage;
    });
});
