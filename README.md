# Wazone - Bot de Jeu WhatsApp

Ce projet est un bot de jeu de combat pour WhatsApp, inspiré de Call of Duty, avec une carte tactique en direct accessible via un navigateur web.

## Prérequis

- Node.js (version 16 ou supérieure)
- Un compte WhatsApp actif (Standard ou Business)

## Installation

1.  **Clonez le dépôt :**
    ```bash
    git clone https://github.com/Eoza-cell/Wazone.git
    cd Wazone
    ```

2.  **Installez les dépendances :**
    Le projet peut utiliser `npm` ou `yarn`. Sur des plateformes comme Render, `yarn` est souvent utilisé par défaut.
    ```bash
    npm install
    # ou
    yarn
    ```

## Lancement

Il n'y a **aucune configuration** nécessaire avant le premier lancement.

Pour démarrer le bot, exécutez la commande :

```bash
npm start
```

## Comment se connecter (Première Utilisation)

1.  **Démarrez le serveur** avec la commande `npm start`.
2.  **Ouvrez votre navigateur** à l'adresse `http://localhost:3000` (ou l'URL de votre service de déploiement).
3.  Une section sur la page web affichera un **QR code**.
4.  **Ouvrez WhatsApp** sur votre téléphone, allez dans `Paramètres > Appareils connectés > Connecter un appareil`.
5.  **Scannez le QR code** affiché sur le site web avec votre téléphone.
6.  Une fois la connexion établie, la section du QR code disparaîtra, et vous verrez la carte tactique. Le bot est maintenant connecté et prêt à être utilisé sur WhatsApp !

La session sera sauvegardée. Lors des prochains redémarrages, le bot se reconnectera automatiquement sans que vous ayez besoin de scanner à nouveau le QR code.
