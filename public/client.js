document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const connectionContainer = document.getElementById('connection-container');
    const pairingForm = document.getElementById('pairing-form');
    const phoneNumberInput = document.getElementById('phone-number');
    const getCodeButton = document.getElementById('get-code-button');
    const pairingCodeDisplay = document.getElementById('pairing-code-display');
    const pairingCodeElement = document.getElementById('pairing-code');
    const statusText = document.querySelector('.status-text');

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = 'Prêt à générer un code.';
    });

    getCodeButton.addEventListener('click', () => {
        const phoneNumber = phoneNumberInput.value.trim();
        if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
            alert('Veuillez entrer un numéro de téléphone valide (chiffres uniquement).');
            return;
        }
        console.log(`Demande de code d'appairage pour le numéro : ${phoneNumber}`);
        socket.emit('requestPairingCode', { phoneNumber });

        pairingForm.classList.add('hidden');
        pairingCodeDisplay.classList.remove('hidden');
        statusText.textContent = 'Génération du code en cours...';
    });

    socket.on('pairingCode', (data) => {
        if (data.code) {
            console.log(`Code d'appairage reçu : ${data.code}`);
            pairingCodeElement.textContent = data.code;
            statusText.textContent = 'Veuillez entrer ce code dans WhatsApp.';
        } else {
            console.error('Erreur de réception du code d'appairage.');
            statusText.textContent = `❌ Erreur : ${data.error || 'Impossible de générer le code.'}`;
            pairingForm.classList.remove('hidden');
            pairingCodeDisplay.classList.add('hidden');
        }
    });

    socket.on('connectionSuccess', () => {
        console.log('Connexion du bot réussie !');
        pairingCodeDisplay.classList.add('hidden');
        pairingForm.classList.add('hidden');
        statusText.textContent = '✅ Bot connecté avec succès !';
    });

    socket.on('disconnect', () => {
        console.log('Déconnecté du serveur.');
        statusText.textContent = '❌ Déconnecté. Veuillez rafraîchir la page.';
    });
});
