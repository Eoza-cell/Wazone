# Wazone - Bot de Jeu WhatsApp

Ce projet est un bot de jeu pour WhatsApp, inspiré de Call of Duty, avec un système de connexion web basé sur le code d'appairage.

## Prérequis

- Node.js (version 16 ou supérieure)
- Un numéro de téléphone avec un compte WhatsApp actif

## Installation

1.  **Clonez le dépôt :**
    ```bash
    git clone https://github.com/Eoza-cell/Wazone.git
    cd Wazone
    ```

2.  **Installez les dépendances :**
    ```bash
    npm install
    ```

## Lancement

Pour démarrer le serveur et le bot, exécutez la commande :

```bash
npm start
```
*Note : Assurez-vous d'avoir défini le script `start` dans votre `package.json` comme suit : `"start": "node bot.js"`.*

## Comment se connecter

1.  **Démarrez le serveur** avec `npm start`.
2.  **Ouvrez votre navigateur** à l'adresse `http://localhost:3000` (ou l'URL de votre service de déploiement).
3.  **Entrez votre numéro de téléphone** (avec l'indicatif de pays, sans le `+`, par exemple `33612345678`) et cliquez sur "Obtenir le code".
4.  La page affichera un **code d'appairage** à 8 caractères.
5.  **Ouvrez WhatsApp** sur votre téléphone, allez dans `Paramètres > Appareils connectés > Connecter un appareil > Connecter avec le numéro de téléphone`.
6.  **Entrez le code** affiché sur le site web.
7.  Une fois la connexion établie, la page web affichera un message de succès.

La session sera sauvegardée dans le répertoire `auth_info_baileys/`. Lors des prochains redémarrages, le bot tentera de se reconnecter automatiquement. Si vous souhaitez connecter un nouveau numéro, vous devrez peut-être supprimer ce dossier.

## Commandes de jeu

- `/statut` : Affiche une image avec vos statistiques actuelles (vie, énergie, arme).
- `/tire` : (En répondant au message d'un autre joueur) Tire sur le joueur ciblé, lui infligeant 15 points de dégâts.
- `/regles`, `/missions`, `/lieux`, `/events`, `/armes` : Commandes de catalogue (contenu à développer).
