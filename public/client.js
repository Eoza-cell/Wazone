document.addEventListener('DOMContentLoaded', () => {
    const socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    const qrCodeImage = document.getElementById('qr-code');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const statusText = document.querySelector('.status-text');

    statusText.textContent = 'INITIALISATION DES PROTOCOLES...';

    socket.on('connect', () => {
        console.log('Connecté au serveur Neoverse !');
        statusText.textContent = 'RECHERCHE DE FLUX...';
    });

    socket.on('disconnect', (reason) => {
        console.log(`Déconnecté : ${reason}`);
        statusText.textContent = '❌ FLUX INTERROMPU. RECONNEXION...';
    });

    socket.on('qrCode', (data) => {
        if (data && data.url) {
            console.log('Nouveau QR Code reçu.');
            qrCodeImage.src = data.url;
            qrCodeImage.style.display = 'block';
            qrPlaceholder.style.display = 'none';
            statusText.textContent = 'PROTOCOLE QR PRÊT';
        }
    });

    socket.on('statusUpdate', (status) => {
        statusText.textContent = status.toUpperCase();
    });

    socket.on('connectionSuccess', () => {
        console.log('Liaison Neoverse établie !');
        document.getElementById('connection-container').innerHTML = `
            <div class="logo-container">
                <span class="glitch" data-text="LIAISON ÉTABLIE">LIAISON ÉTABLIE</span>
            </div>
            <p>Neox est maintenant opérationnel dans le Neoverse.</p>
            <p class="status-text">VOUS POUVEZ FERMER CETTE FENÊTRE</p>
        `;
    });

    socket.on('error', (errorMessage) => {
        console.error(`Erreur critique: ${errorMessage}`);
        qrPlaceholder.textContent = "ÉCHEC";
        statusText.textContent = errorMessage.toUpperCase();
    });
});
