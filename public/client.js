document.addEventListener('DOMContentLoaded', () => {
    const socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    const formContainer = document.getElementById('form-container');
    const codeContainer = document.getElementById('code-container');
    const phoneNumberInput = document.getElementById('phone-number');
    const connectButton = document.getElementById('connect-button');
    const pairingCodeDisplay = document.getElementById('pairing-code');
    const statusText = document.querySelector('.status-text');

    statusText.textContent = 'Connexion au serveur...';

    socket.on('connect', () => {
        console.log('Connecté au serveur !');
        statusText.textContent = 'Prêt. Entrez votre numéro de téléphone.';
    });

    socket.on('disconnect', (reason) => {
        console.log(`Déconnecté : ${reason}`);
        statusText.textContent = '❌ Déconnecté. Tentative de reconnexion...';
        formContainer.style.display = 'block';
        codeContainer.style.display = 'none';
    });

    connectButton.addEventListener('click', () => {
        const phoneNumber = phoneNumberInput.value.trim();
        if (phoneNumber) {
            console.log(`Envoi du numéro ${phoneNumber} au serveur.`);
            socket.emit('start-connection', phoneNumber);
            statusText.textContent = '⏳ Demande du code d\'appairage...';
            connectButton.disabled = true;
            phoneNumberInput.disabled = true;
        } else {
            alert('Veuillez entrer un numéro de téléphone valide.');
        }
    });

    socket.on('pairingCode', (code) => {
        console.log(`Code reçu : ${code}`);
        formContainer.style.display = 'none';
        codeContainer.style.display = 'block';
        pairingCodeDisplay.textContent = code;
        statusText.textContent = 'Code reçu. Entrez-le dans WhatsApp.';
    });

    socket.on('connectionSuccess', (message) => {
        console.log('Connexion du bot réussie !');
        codeContainer.style.display = 'none';
        formContainer.style.display = 'none';
        statusText.innerHTML = `✅ ${message} <br> Vous pouvez fermer cette page.`;
    });

    socket.on('connectionError', (errorMessage) => {
        console.error(`Erreur du serveur: ${errorMessage}`);
        statusText.textContent = `❌ Erreur : ${errorMessage}`;
        // Réactiver les champs uniquement si l'erreur n'est pas "déjà connecté"
        if (!errorMessage.includes('déjà en cours')) {
            connectButton.disabled = false;
            phoneNumberInput.disabled = false;
        }
        formContainer.style.display = 'block';
        codeContainer.style.display = 'none';
    });
});
