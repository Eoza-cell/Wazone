document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const pairingForm = document.getElementById('pairing-form');
    const phoneNumberInput = document.getElementById('phone-number');
    const getCodeButton = document.getElementById('get-code-button');
    const pairingCodeDisplay = document.getElementById('pairing-code-display');
    const pairingCodeElement = document.getElementById('pairing-code');
    const statusText = document.querySelector('.status-text');

    socket.on('connect', () => {
        statusText.textContent = 'Prêt à générer un code.';
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

    socket.on('disconnect', () => {
        statusText.textContent = '❌ Déconnecté. Veuillez rafraîchir la page.';
    });
});
