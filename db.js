const { MongoClient, ServerApiVersion } = require('mongodb');
const { URL } = require('url');

const uri = process.env.MONGO_URI;

if (!uri) {
    console.error("ERREUR: La variable d'environnement MONGO_URI n'est pas définie.");
    process.exit(1);
}

if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error("ERREUR: La variable d'environnement MONGO_URI a un format invalide. Elle doit commencer par 'mongodb://' ou 'mongodb+srv://'.");
    process.exit(1);
}

try {
    const mongoUrl = new URL(uri);
    const username = decodeURIComponent(mongoUrl.username);
    const hostname = mongoUrl.hostname;
    console.log(`Tentative de connexion à MongoDB :`);
    console.log(`- Hostname: ${hostname}`);
    console.log(`- Username: ${username || '(non spécifié)'}`);
} catch (e) {
    console.error("ERREUR: Impossible d'analyser le MONGO_URI pour le débogage.");
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    db = client.db("wazone"); // Using a database named "wazone"
    console.log("✅ Successfully connected to MongoDB!");
    return db;
  } catch (err) {
    console.error("❌ Could not connect to MongoDB", err);
    process.exit(1);
  }
}

function getDB() {
    if (!db) {
        throw new Error("Call connectDB first!");
    }
    return db;
}

module.exports = { connectDB, getDB };
