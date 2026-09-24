# IMMO 360 · Paris

Application web en français pour préparer un achat, une location et une visite immobilière à Paris. Interface pensée pour desktop, également utilisable sur mobile. Next.js 16, React 19, TypeScript et Leaflet. Aucun compte utilisateur nécessaire. Une clé CARTO Basemaps est nécessaire pour afficher le fond de carte sans filigrane.

## Démarrer

Node.js 24 LTS, fixé par `engines.node` et `.nvmrc` pour aligner le développement, la CI et Vercel. Le script d’installation de la version verrouillée d’esbuild est explicitement autorisé dans `allowScripts`.

```bash
npm ci
npm run dev
```

Avant de démarrer, copier `.env.example` vers `.env.local` et renseigner `NEXT_PUBLIC_CARTO_API_KEY` avec une [clé CARTO Basemaps](https://carto.com/basemaps/apikey/). Redémarrer le serveur après modification. Cette clé est destinée au navigateur ; utiliser les restrictions de domaines proposées par CARTO. Les autres sources publiques fonctionnent sans clé. Sans clé CARTO, les points restent consultables et le fond de carte est signalé indisponible ; aucune tuile avec filigrane n’est chargée.

Ouvrir http://127.0.0.1:3000. L’accueil ne lance aucune analyse automatiquement : rechercher une adresse ou choisir l’exemple du 10 rue de Bretagne pour commencer. Un lien partagé contenant une adresse ouvre directement sa fiche. Les codes postaux parisiens, y compris 75116, sont acceptés ; la banlieue est exclue.

```bash
npm run test
npm run typecheck
npm run build
npm start
```

## Mettre en ligne sur Vercel

1. Dans Vercel, choisir **Add New → Project** et importer `Z2VvZ2Vv/IMMO-360`.
2. Conserver le preset **Next.js**, le dossier racine `./` et les commandes détectées automatiquement.
3. Choisir **Node.js 24.x** dans les réglages de build Vercel, comme indiqué dans `package.json`. Ajouter `NEXT_PUBLIC_CARTO_API_KEY` dans **Settings → Environment Variables**, avec la clé CARTO Basemaps comme valeur, pour Production et Preview.
4. Déployer. Si la variable est ajoutée après un premier déploiement, redéployer : Next.js l’intègre au build. Définir `main` comme branche de production : les pushes suivants déclencheront un déploiement.

Le fichier `vercel.json` sélectionne Paris (`cdg1`) pour les fonctions. Les sources externes sont appelées uniquement à la consultation, pas pendant le build. La route d’analyse prévoit 60 secondes maximum ; chaque requête externe a un délai de 9 secondes. Les requêtes indépendantes sont concurrentes et les indisponibilités sont isolées. Le fonctionnement dépend de l’accès réseau aux sources publiques.

## Parcours disponibles

- Recherche d’adresses IGN avec autocomplétion, filtrée sur Paris et accessible au clavier.
- Fiche synthétique et carte des terrasses, espaces verts et lieux de fraîcheur.
- Cadre de vie : carte filtrable, liste des points et limites sur bruit / chaleur.
- Marché : ventes comparables de la section, prix médian, filtre de période et diagnostics ADEME à l’adresse.
- Jusqu’à 12 favoris locaux et comparaison de trois adresses.
- Checklist, étage, exposition et notes de visite conservés par adresse dans le navigateur.
- Export JSON du dossier et impression de la fiche complète en PDF via le navigateur, indépendamment de l’onglet actif.
- Lien d’adresse partageable sans inclure les notes.
- Sources, limites et état de disponibilité par indicateur.

## Sources et méthode

| Source                                                | Utilisation                                                                        | Limite importante                                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| IGN / BAN · `data.geopf.fr/geocodage/search`          | Recherche, coordonnées, précision                                                  | Une rue sans numéro ne localise pas un appartement                                                                               |
| Paris Data · `terrasses-autorisations`                | Autorisations de terrasses dans un rayon de 200 m                                  | Plusieurs autorisations par établissement ; aucune inférence de nuisance                                                         |
| Paris Data · `espaces_verts`                          | Espaces recensés à 500 m                                                           | Comprend la végétalisation de voirie, pas seulement les jardins accessibles                                                      |
| Paris Data · `ilots-de-fraicheur-espaces-verts-frais` | Lieux de fraîcheur à 500 m                                                         | Ne mesure pas le confort thermique intérieur                                                                                     |
| ADEME · `dpe03existant`                               | Jusqu’à 100 DPE proches à 20 m, puis correspondance normalisée exacte de l’adresse | Aucun DPE n’est automatiquement attribué à un appartement ; les résultats peuvent être incomplets dans les immeubles très denses |
| IGN API Carto + DGFiP / Etalab DVF                    | Parcelle, section puis 100 dernières ventes retenues à moins de 500 m              | Section cadastrale seulement ; prix historique total avec dépendances éventuelles                                                |
| Géorisques / GASPAR                                   | Risques à la commune de Paris                                                      | Ne permet pas de déterminer le risque à l’adresse ; ERRIAL reste à consulter                                                     |

Le connecteur Paris Data utilise le domaine du portail `parisdata.opendatasoft.com`. Lors de l’implémentation, le domaine `opendata.paris.fr` ne résolvait pas depuis cet environnement. Le connecteur ADEME utilise le jeu actuel `dpe03existant`, le précédent `dpe-v2-logements-existants` renvoyant 404.

Les distances sont calculées par la formule de Haversine et sont à vol d’oiseau. Pour DVF, une mutation contenant plusieurs appartements, plusieurs parcelles, plusieurs dispositions, ou un local autre qu’un appartement et des dépendances est exclue. Les surfaces/prix manquants sont exclus. La médiane est calculée seulement avec au moins trois ventes retenues ; elle n’est pas une estimation immobilière.

Le cercle de synthèse indique le nombre de sources ayant retourné des données, **pas un score de qualité de vie**. Zéro résultat n’est jamais assimilé à une absence de risque. Un service en erreur apparaît indisponible, sans données de remplacement fictives. Les données brutes sont mises en cache une heure ; la fiche peut également être servie par le cache Vercel. Le bouton Actualiser relance la consultation et reste soumis à ce cache.

Les cartes acoustiques Bruitparif, les données fines APUR, les odeurs et les températures à l’intérieur du logement ne sont **pas intégrées automatiquement**. Leur absence est indiquée dans le produit et les vérifications sont proposées dans la checklist. Lors des vérifications du 24 septembre 2026, une erreur 503 temporaire de Géorisques a été correctement isolée, puis un appel ultérieur a réussi. Les six sources de la fiche ont renvoyé des données réelles pour le 24 rue des Martyrs.

La fiabilité documentaire est une appréciation qualitative explicitée dans le produit : élevée pour le recensement municipal, modérée pour les DPE dont le logement reste à identifier et les échantillons DVF, limitée pour les risques communaux. Elle ne correspond pas à une probabilité statistique de confort ou de sécurité.

## Données personnelles

Pas d’authentification, de base de comptes, de paiement ou de traceur publicitaire. Les favoris et carnets restent dans `localStorage` sur l’appareil utilisé. Ils ne sont pas synchronisés et peuvent être perdus si l’utilisateur efface les données du navigateur. Les exports JSON et PDF contiennent les notes choisies par l’utilisateur.

Les adresses recherchées transitent par le serveur et les fournisseurs publics. Les tuiles sont fournies par CARTO / OpenStreetMap avec attribution. Les polices DM Sans et Manrope sont chargées depuis Google Fonts avec polices de repli locales. L’hébergeur et les fournisseurs peuvent conserver leurs journaux techniques selon leurs propres politiques. L’écran Confidentialité permet d’effacer les données locales après confirmation.

Une API WebMCP optionnelle `read_current_address_report` expose seulement les résultats publics de la fiche, sans les favoris ou notes, dans les navigateurs compatibles.

## Structure

```text
src/app/api/search/    Autocomplétion Paris
src/app/api/report/    Orchestration de la fiche
src/components/       Interface, carte, outil navigateur optionnel
src/lib/providers.ts  Connecteurs publics et métadonnées de sources
src/lib/analysis.ts   Distances, restriction Paris et sélection des ventes
src/lib/storage.ts    Validation du carnet local
tests/                Tests des règles de traitement
```

Les tests protègent notamment le calcul DVF contre l’attribution du prix d’une mutation complète à chacun de ses appartements. Un workflow GitHub Actions vérifie les tests, le typage et le build sur les pushes de `main`.

## Suite possible

Pour un usage multiutilisateur : ajouter une authentification et une base de données, définir une politique de conservation, instrumenter les erreurs fournisseurs et ajouter une limitation de requêtes partagée. Pour les nouveaux indicateurs : qualifier l’accès et la licence des données Bruitparif / APUR, formaliser les échelles spatiales et temporelles, puis documenter et valider un éventuel modèle d’estimation avant d’afficher un score de qualité de vie.
