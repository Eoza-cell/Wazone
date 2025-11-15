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
    const statusText = document.querySelector('.status-text');

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = 'En attente du QR code...';
    });

    socket.on('disconnect', (reason) => {
        console.log(`Déconnecté : ${reason}`);
        statusText.textContent = '❌ Déconnecté. Tentative de reconnexion...';
    });

    socket.on('qr', (url) => {
        console.log('QR code reçu.');
        statusText.textContent = 'Scannez le code avec WhatsApp.';
        qrImage.src = url;
    });

    socket.on('connectionSuccess', (message) => {
        console.log('Connexion du bot réussie !');
        qrContainer.style.display = 'none';
        statusText.innerHTML = `✅ ${message} <br> Vous pouvez fermer cette page.`;
    });

    socket.on('connectionError', (errorMessage) => {
        console.error(`Erreur du serveur: ${errorMessage}`);
        statusText.textContent = `❌ Erreur : ${errorMessage}. Rafraîchissez la page pour réessayer.`;
    });
});
