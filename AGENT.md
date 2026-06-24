# Instructions pour Vibe Work - Data-Mind

## 📌 Contexte du projet
Data-Mind est une **plateforme d'analyse d'intelligence multi-sources** conçue pour produire des rapports structurés et actionnables.
- **Technologie** : React (frontend), Mistral AI (moteur d'analyse)
- **Fonctionnalités** : Ingestion de données (web, fichiers, news, réseaux sociaux, bases de données), analyse croisée, génération de rapports structurés
- **Langues supportées** : Français, Anglais, Arabe, Espagnol, Chinois

---

## 🛠 Configuration et exécution

### Prérequis
- Node.js 18+
- **Clé API Mistral** (remplace l'ancienne clé Anthropic)
- Clés API optionnelles : NewsAPI, Meta, Twitter, Google Drive, Dropbox, etc.

### Installation
```bash
git clone https://github.com/Mxcs-Scxm/Data-Mind.git
cd Data-Mind
npm install
```

### Variables d'environnement
Crée un fichier `.env` à la racine avec :
```env
REACT_APP_MISTRAL_API_KEY=ta_cle_api_mistral
```

> ⚠️ **Important** : Toutes les autres clés API (NewsAPI, réseaux sociaux, etc.) sont saisies directement dans l'interface de l'application et stockées localement dans la session du navigateur.

### Démarrage
```bash
npm start
```
- L'application sera accessible sur `http://localhost:5173`

---

## 📁 Structure du projet
``
Data-Mind/
├── src/
│   ├── App.jsx              # Application principale
│   ├── components/         # Composants React
│   │   ├── ConnectorCard.jsx
│   │   ├── CockpitPanel.jsx
│   │   └── ...
│   ├── constants/          # Configurations statiques
│   │   ├── connectors.js    # Registre des connecteurs
│   │   └── analysis.js      # Types d'analyse
│   └── styles/             # Styles
├── .devcontainer/          # Configuration VS Code Dev Containers
├── package.json
└── README.md
```

---

## 🎯 Instructions pour Vibe Work

### 🔧 Tâches courantes
- **Analyser le code** : `"Explique-moi le fonctionnement de src/App.jsx`"
- **Ajouter une fonctionnalité** : `"Ajoute un connecteur pour [service] dans constants/connectors.js`"
- **Corriger un bug** : `"Le composant CockpitPanel.jsx a un bug dans [description]`"
- **Documenter** : `"Crée une documentation pour le module [X]`"

### 📝 Conventions à respecter
- **Code** : Suis les conventions existantes (React hooks, JSX)
- **Commits** : Messages clairs en anglais (ex: `feat: add Twitter connector`)
- **Tests** : Si tu ajoutes une fonctionnalité, propose des tests unitaires
- **Sécurité** : Ne jamais committer de clés API dans le code

### ⚠️ Points d'attention
- **API Mistral** : Remplace tous les appels à l'API Anthropic par l'API Mistral
  - Endpoint : `https://api.mistral.ai/v1/chat/completions`
  - Modèle : `mistral-medium` ou `mistral-3.5`
- **Branches** : Travaille toujours sur une branche dédiée (ex: `vibe/feature-x`)
- **Pull Requests** : Décris clairement les changements pour faciliter la relecture

---

## 🚀 Roadmap et contributions
- **v1.0** : MVP actuel (ingestion multi-onglets, 75+ sources médias, cockpit guidé)
- **v1.1** : Export PDF/PPTX, historique des analyses, visualisations
- **v2.0** : Chatbot intégré, alertes en temps réel, API publique

Pour contribuer :
1. Crée une branche : `git checkout -b feature/ta-fonctionnalité`
2. Commite tes changements
3. Ouvre une Pull Request

---

## 🔒 Sécurité et confidentialité
- **Stockage des clés** : Toutes les clés API sont stockées **localement dans le navigateur** (sessionStorage)
- **Appels API** : Tous les appels partent directement du client vers les APIs des fournisseurs
- **Politique Mistral** : Les appels à l'API Mistral suivent la [politique de confidentialité de Mistral](https://mistral.ai/privacy-policy/)

---

*Dernière mise à jour : 24 juin 2026*
*Géré par Vibe Work (Mistral AI)*
