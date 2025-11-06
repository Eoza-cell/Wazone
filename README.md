# Wazone - Bot de Jeu WhatsApp

Ce projet est un bot de jeu pour WhatsApp, inspiré de Call of Duty, avec un système de connexion web basé sur un QR code.

## Prérequis

- Node.js (version 16 ou supérieure)
- Un compte WhatsApp actif

## Installation

1.  **Clonez le dépôt :**
    ```bash
    git clone https://github.com/Eoza-cell/Wazone.git
    cd Wazone
    ```

2.  **Installez les dépendances :**
    ```bash
    yarn install
    ```

## Lancement

Pour démarrer le serveur et le bot, exécutez la commande :

```bash
yarn start
```
*Note : Assurez-vous d'avoir défini le script `start` dans votre `package.json` comme suit : `"start": "node bot.js"`.*

## Comment se connecter

1.  **Démarrez le serveur** avec `yarn start`.
2.  **Ouvrez votre navigateur** à l'adresse `http://localhost:3000` (ou l'URL de votre service de déploiement).
3.  La page affichera un **QR code**.
4.  **Ouvrez WhatsApp** sur votre téléphone, allez dans `Paramètres > Appareils connectés > Connecter un appareil`.
5.  **Scannez le QR code** affiché sur la page web avec votre téléphone.
6.  Une fois la connexion établie, la page web affichera un message de succès.

La session sera sauvegardée dans le répertoire `auth_info_baileys/`. Lors des prochains redémarrages, le bot tentera de se reconnecter automatiquement. Si vous souhaitez connecter un nouveau numéro, vous devrez supprimer ce dossier.

## Commandes de jeu

- `/statut` : Affiche une image avec vos statistiques actuelles (vie, énergie, arme).
- `/tire` : (En répondant au message d'un autre joueur) Tire sur le joueur ciblé, lui infligeant 15 points de dégâts.
- `/regles`, `/missions`, `/lieux`, `/events`, `/armes` : Commandes de catalogue (contenu à développer).
