# FLIP FUSION + TRIX — Nouveau projet propre

Deux jeux de cartes sur un seul site hébergé par **un Web Service Render**.

## Contenu du dossier

Tous ces fichiers doivent se trouver **directement à la racine** du dépôt GitHub :

```
flip-fusion-trix/
├── index.html             # Accueil / choix du jeu
├── flip-fusion.html       # Flip Fusion v13 (2–8 joueurs)
├── trix.html              # TRIX Belote v13 (4 joueurs)
├── server.js              # Serveur Flip Fusion et pages des deux jeux
├── package.json           # Démarrage du serveur
├── README.md              # Cette notice
└── .gitignore             # Facultatif
```

Il ne faut **pas** utiliser les anciens fichiers `flip_fusion_server_v12.js` ou `flip_fusion_server_v13.js` pour ce nouveau dépôt. `package.json` démarre `server.js`.

## A. Repartir de zéro sur GitHub, sans perdre l'ancien dépôt

1. Aller sur https://github.com/new et créer un nouveau dépôt **flip-fusion-trix**.
2. Laisser les cases *Add a README*, *Add .gitignore* et *Choose a license* décochées afin de commencer avec un dépôt vide.
3. Sur la page du dépôt vide, cliquer **uploading an existing file** (ou **Add file → Upload files**).
4. Glisser les fichiers de ce dossier dans GitHub, directement à la racine. Cliquer **Commit changes**.
5. Dans l'onglet **Code**, vérifier que `index.html`, `flip-fusion.html`, `trix.html`, `server.js`, `package.json` apparaissent côte à côte. Ils ne doivent pas être dans un sous-dossier.

Le dépôt précédent peut être conservé comme sauvegarde. Une fois le nouveau site validé, l'ancien dépôt peut être archivé sur GitHub via **Settings → General → Danger Zone → Archive this repository**. Ne le supprimer définitivement qu'après les vérifications.

## B. Nouveau serveur Render

1. Aller sur https://dashboard.render.com/ → **New → Web Service**.
2. Connecter le compte GitHub puis sélectionner **flip-fusion-trix** (branche `main`).
3. Choisir :
   - **Language/Runtime** : Node
   - **Root Directory** : *vide*
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Plan** : Free (s'il est proposé)
4. Cliquer **Create Web Service** et attendre le statut **Live**.
5. Ouvrir l'adresse HTTPS fournie par Render (par exemple `https://nom-du-service.onrender.com`).

### Vérification rapide

- `/` : page d'accueil Card Room
- `/flip-fusion.html` : Flip Fusion
- `/trix.html` : TRIX Belote
- `/api/health` : JSON contenant `ok: true`, `version: 13`, et les deux jeux

## C. Jouer avec des amis

**Flip Fusion** : choisir `Flip Fusion` sur l'accueil, créer une salle, transmettre le code ou le lien aux invités. Les salles fonctionnent avec le relais HTTP/SSE du **serveur Render**, avec chat, vocal WebRTC et reconnexion v13.

**TRIX** : choisir `TRIX`, créer un salon à 6 caractères et partager son lien `trix.html?room=XXXXXX`. TRIX conserve sa connexion **PeerJS** (service de signalisation externe) et sa communication vocale telle que dans la dernière V13, indépendamment des salles Flip Fusion. Le site doit être ouvert en HTTPS.

**Les deux jeux ne partagent pas leurs salles ni leurs scores**. Le serveur TRIX n'est pas une nouvelle API Render : son hôte est le navigateur du joueur qui crée le salon. La connexion PeerJS exige Internet et peut être limitée par certains réseaux. Ne pas fermer l'onglet de l'hôte pendant une partie.

## D. Mises à jour futures

1. Remplacer uniquement le ou les fichiers modifiés dans GitHub, en conservant leurs noms.
2. Cliquer **Commit changes**.
3. Render déploie automatiquement si *Auto Deploy* est activé. Sinon : **Deploys → Manual Deploy → Deploy latest commit**.
4. Rafraîchir le site et vérifier `/api/health`.

## E. Résolution des erreurs

- `Cannot find module '/opt/render/project/src/server.js'` : `server.js` manque, est mal nommé, ou n'est pas à la racine.
- `ENOENT package.json` : `package.json` n'est pas à la racine ou *Root Directory* est incorrect.
- La page affiche une ancienne version : vérifier le **dernier commit déployé** et rafraîchir le navigateur.
- Impossible d'accéder à TRIX en ligne : vérifier que la bibliothèque PeerJS externe se charge et que l'hôte du salon TRIX garde sa page ouverte.
- Render Free peut mettre le serveur en veille après inactivité; les salles Flip Fusion sont en mémoire et peuvent disparaître lors du redémarrage.

**Ne jamais placer de clés API ou mots de passe dans GitHub**. Les clés de récupération des joueurs doivent rester privées.
