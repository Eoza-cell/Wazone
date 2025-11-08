document.addEventListener('DOMContentLoaded', () => {
    const socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    const pairingCodeContainer = document.getElementById('pairing-code-container');
    const pairingCodeElement = document.getElementById('pairing-code');
    const statusText = document.querySelector('.status-text');

    statusText.textContent = 'Connexion au serveur...';

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = 'En attente du code de jumelage...';
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

    socket.on('pairingCode', (data) => {
        if (data && data.code) {
            console.log(`Code de jumelage reçu: ${data.code}`);
            pairingCodeElement.textContent = data.code;
            statusText.textContent = 'Utilisez ce code sur WhatsApp pour vous connecter.';
        } else {
             console.error("Données du code de jumelage invalides reçues.");
             statusText.textContent = "Erreur: Données du code invalides."
        }
    });

    socket.on('connectionSuccess', () => {
        console.log('Connexion du bot réussie !');
        pairingCodeContainer.style.display = 'none';
        statusText.textContent = '✅ Bot connecté avec succès !';
    });

    socket.on('error', (errorMessage) => {
        console.error(`Erreur du serveur: ${errorMessage}`);
        pairingCodeElement.textContent = "ERREUR";
        statusText.textContent = errorMessage;
    });
});
