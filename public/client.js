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

    statusText.textContent = 'INITIALISATION DES PROTOCOLES...';

    socket.on('connect', () => {
        console.log('Connecté au serveur Neoverse !');
        statusText.textContent = 'RECHERCHE DE LIAISON...';
    });

    socket.on('disconnect', (reason) => {
        console.log(`Déconnecté : ${reason}`);
        statusText.textContent = '❌ LIAISON INTERROMPUE. RECONNEXION...';
    });

    socket.on('pairingCode', (data) => {
        if (data && data.code) {
            console.log(`Code de jumelage reçu: ${data.code}`);
            pairingCodeElement.textContent = data.code;
            statusText.textContent = 'PROTOCOLE DE LIAISON PRÊT';
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
        pairingCodeElement.textContent = "ÉCHEC";
        statusText.textContent = errorMessage.toUpperCase();
    });
});
