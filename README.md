# Wazone - Bot de Jeu WhatsApp

Ce projet est un bot de jeu pour WhatsApp, inspiré de Call of Duty, utilisant un système de connexion par code de jumelage.

## Prérequis

- Node.js (version 16 ou supérieure)
- Un compte WhatsApp actif
- Un numéro de téléphone dédié pour le bot

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

## Configuration Essentielle

Avant de lancer le bot, vous devez configurer votre numéro de téléphone via une variable d'environnement. C'est une étape **obligatoire** pour la sécurité.

**Variable d'environnement :** `PHONE_NUMBER`

- **Description :** Le numéro de téléphone de votre bot au format international, sans le `+` ni espaces.
- **Exemple :** `PHONE_NUMBER=22678363200`

### Pour un déploiement sur Render :

1.  Allez dans le tableau de bord de votre service sur Render.
2.  Naviguez vers l'onglet **"Environment"**.
3.  Dans la section **"Environment Variables"**, cliquez sur **"Add Environment Variable"**.
4.  Entrez `PHONE_NUMBER` dans le champ **"Key"** et votre numéro de téléphone dans le champ **"Value"**.
5.  Sauvegardez les changements. Render redémarrera automatiquement votre service avec la nouvelle variable.

## Lancement

Pour démarrer le serveur et le bot, exécutez la commande :

```bash
yarn start
```

## Comment se connecter

1.  **Assurez-vous d'avoir configuré la variable d'environnement `PHONE_NUMBER`**.
2.  **Démarrez le serveur** (`yarn start` ou via votre service de déploiement comme Render).
3.  **Ouvrez votre navigateur** à l'URL de votre service (ex: `https://wazone-1.onrender.com`).
4.  La page affichera un **code de jumelage** (ex: `ABC-DEF`).
5.  **Ouvrez WhatsApp** sur votre téléphone, allez dans `Paramètres > Appareils connectés > Connecter un appareil`.
6.  Choisissez **"Connecter avec le numéro de téléphone"**.
7.  **Entrez le code** affiché sur la page web.
8.  Une fois la connexion établie, la page web affichera un message de succès.

La session sera sauvegardée dans le répertoire `auth_info_baileys/`. Lors des prochains redémarrages, le bot se reconnectera automatiquement.

## Commandes de jeu

- `/menu` ou `/aide` : Affiche le menu principal des commandes.
- `/statut` : Affiche une image avec vos statistiques actuelles (vie, énergie, arme).
- `/tire` : (En répondant au message d'un autre joueur) Tire sur le joueur ciblé.
- `/regles`, `/missions`, `/lieux`, `/events`, `/armes` : Commandes de catalogue (contenu à développer).
