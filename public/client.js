document.addEventListener('DOMContentLoaded', () => {
    const socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    const qrContainer = document.getElementById('qr-container');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrImage = document.getElementById('qr-image');
    const statusText = document.querySelector('.status-text');

    statusText.textContent = 'Connexion au serveur...';

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = 'En attente du QR code...';
    });

    socket.on('disconnect', (reason) => {
        console.log(`Déconnecté : ${reason}`);
        statusText.textContent = '❌ Déconnecté. Tentative de reconnexion...';
        qrImage.style.display = 'none';
        qrPlaceholder.textContent = 'Déconnecté. En attente de reconnexion...';
        qrPlaceholder.style.display = 'block';
    });

    socket.on('reconnecting', (attemptNumber) => {
        console.log(`Tentative de reconnexion n°${attemptNumber}...`);
        statusText.textContent = `⏳ Tentative de reconnexion (${attemptNumber})...`;
    });

    socket.on('reconnect_failed', () => {
        console.error('La reconnexion a échoué définitivement.');
        statusText.textContent = '❌ Impossible de se reconnecter. Veuillez vérifier votre connexion et rafraîchir la page.';
    });

    socket.on('qr', (url) => {
        if (url) {
            console.log('QR code reçu.');
            qrImage.src = url;
            qrImage.style.display = 'block';
            qrPlaceholder.style.display = 'none';
            statusText.textContent = 'Scannez le code avec WhatsApp.';
        } else {
             console.error("URL du QR code non valide reçue.");
             statusText.textContent = "Erreur: URL du QR code invalide."
        }
    });

    socket.on('connectionSuccess', () => {
        console.log('Connexion du bot réussie !');
        qrContainer.style.display = 'none';
        statusText.innerHTML = '✅ Bot connecté avec succès ! <br> Vous pouvez fermer cette page.';
    });

    socket.on('error', (errorMessage) => {
        console.error(`Erreur du serveur: ${errorMessage}`);
        qrContainer.innerHTML = `<p class="error">ERREUR</p>`;
        statusText.textContent = errorMessage;
    });
});
