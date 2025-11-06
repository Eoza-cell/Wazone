document.addEventListener('DOMContentLoaded', () => {
    // Configure Socket.IO pour tenter de se reconnecter automatiquement
    const socket = io({
        reconnection: true, // Active la reconnexion (activé par défaut)
        reconnectionAttempts: Infinity, // Nombre infini de tentatives
        reconnectionDelay: 1000, // Délai de 1s entre les tentatives
        reconnectionDelayMax: 5000, // Délai maximal de 5s
        randomizationFactor: 0.5 // Facteur aléatoire pour éviter que tous les clients se reconnectent en même temps
    });

    const pairingForm = document.getElementById('pairing-form');
    const phoneNumberInput = document.getElementById('phone-number');
    const getCodeButton = document.getElementById('get-code-button');
    const pairingCodeDisplay = document.getElementById('pairing-code-display');
    const pairingCodeElement = document.getElementById('pairing-code');
    const statusText = document.querySelector('.status-text');

    statusText.textContent = 'Connexion au serveur...';

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = '✅ Connecté. Prêt à générer un code.';
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

    getCodeButton.addEventListener('click', () => {
        const phoneNumber = phoneNumberInput.value.trim();
        if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
            alert('Veuillez entrer un numéro de téléphone valide (chiffres uniquement).');
            return;
        }
        socket.emit('requestPairingCode', { phoneNumber });

        pairingForm.classList.add('hidden');
        pairingCodeDisplay.classList.remove('hidden');
        statusText.textContent = 'Génération du code en cours...';
    });

    socket.on('pairingCode', (data) => {
        if (data.code) {
            pairingCodeElement.textContent = data.code;
            statusText.textContent = 'Veuillez entrer ce code dans WhatsApp.';
        } else {
            statusText.textContent = `❌ Erreur : ${data.error || 'Impossible de générer le code.'}`;
            pairingForm.classList.remove('hidden');
            pairingCodeDisplay.classList.add('hidden');
        }
    });

    socket.on('connectionSuccess', () => {
        pairingCodeDisplay.classList.add('hidden');
        pairingForm.classList.add('hidden');
        statusText.textContent = '✅ Bot connecté avec succès !';
    });
});
