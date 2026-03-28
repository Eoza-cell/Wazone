# Cote RP - Bot de Jeu WhatsApp (Inspiré par Classroom of the Elite)

Ce projet est un bot de jeu de rôle (RP) pour WhatsApp, inspiré de l'univers de *Classroom of the Elite*, utilisant un système de connexion par QR Code.

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
    npm install
    ```

## Configuration

Le bot peut être configuré via des variables d'environnement (optionnel pour le local, recommandé pour le déploiement) :

- `PORT` : Port du serveur web (par défaut 3000).
- `PROXY_URL` : URL du proxy (utile pour le déploiement sur des plateformes comme Render où WhatsApp est souvent bloqué).

## Lancement

Pour démarrer le serveur et le bot, exécutez la commande :

```bash
npm start
```

## Comment se connecter

1.  **Démarrez le serveur** (`npm start` ou via votre service de déploiement).
2.  **Ouvrez votre navigateur** à l'URL de votre service (ex: `http://localhost:3000` ou votre URL Render).
3.  La page affichera un **QR Code**.
4.  **Ouvrez WhatsApp** sur votre téléphone, allez dans `Paramètres > Appareils connectés > Connecter un appareil`.
5.  **Scannez le QR Code** affiché sur la page web.
6.  Une fois la connexion établie, le bot est prêt à l'emploi.

La session sera sauvegardée dans le répertoire `auth_info_baileys/`. Lors des prochains redémarrages, le bot se reconnectera automatiquement.

## Commandes de jeu

### Élèves
- `/inscription [A/B/C/D]` : Rejoindre une classe (obligatoire pour jouer).
- `/statut` : Affiche votre profil (points privés, rôle, Stellars/Tonitos).
- `/examen` : Passer un examen pour gagner des points.
- `/bonneaction` : Aider un camarade pour gagner quelques points.
- `/ordre [mention] [texte]` : (VIP uniquement) Donner un ordre à un ENG.
- `/menu` ou `/aide` : Affiche le catalogue des commandes.
- `/regles` : Affiche le règlement du lycée.

### Administration (Staff)
- `/donnerpoints [mention] [n]` : Attribuer des points privés.
- `/enleverpoints [mention] [n]` : Retirer des points (0 pts = expulsion).
- `/expulser [mention]` : Expulser définitivement un élève.
- `/promouvoir [mention] [rôle]` : Nommer un Professeur ou un Principal.
- `/stellar [mention] [n]` : Attribuer des Stellars (13+ = VIP).
- `/tonito [mention] [n]` : Attribuer des Tonitos (-10 = ENG).
