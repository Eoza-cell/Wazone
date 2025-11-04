# Wazone - Bot de Jeu WhatsApp

Ce projet est un bot de jeu de combat pour WhatsApp, inspiré de Call of Duty, avec une carte tactique en direct accessible via un navigateur web.

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
    Le projet peut utiliser `npm` ou `yarn`. Sur des plateformes comme Render, `yarn` est souvent utilisé par défaut.
    ```bash
    npm install
    # ou
    yarn
    ```

## Configuration

Avant de lancer le bot, vous devez configurer votre numéro de téléphone. C'est une étape **obligatoire** pour que le bot puisse générer le code de pairage.

**Définissez la variable d'environnement `PHONE_NUMBER`** avec votre numéro de téléphone WhatsApp au format international, sans le `+`.

-   **Sur Linux/macOS :**
    ```bash
    export PHONE_NUMBER="33XXXXXXXXX"
    ```
-   **Sur Windows (Command Prompt) :**
    ```bash
    set PHONE_NUMBER="33XXXXXXXXX"
    ```
-   **Sur une plateforme de déploiement (Render, Heroku, etc.) :**
    Allez dans les paramètres de votre service et ajoutez une variable d'environnement nommée `PHONE_NUMBER` avec votre numéro comme valeur.

## Lancement

Une fois les dépendances installées et la variable d'environnement configurée, vous pouvez démarrer le bot :

```bash
npm start
```

## Comment ça marche ?

1.  **Démarrez le serveur.**
2.  **Ouvrez votre navigateur** à l'adresse `http://localhost:3000` (ou l'URL de votre service de déploiement).
3.  Une section sur la page web affichera un **code de pairage** à 4 chiffres.
4.  **Ouvrez WhatsApp** sur votre téléphone, allez dans `Paramètres > Appareils connectés > Connecter un appareil` et entrez le code affiché sur le site web.
5.  Une fois connecté, la section du code de pairage disparaîtra, et vous verrez la carte tactique. Le bot est prêt à être utilisé sur WhatsApp !
