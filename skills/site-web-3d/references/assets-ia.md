# Visuels IA via ChatGPT (Codex CLI)

Claude ne génère pas d'images ; l'utilisateur a **Codex CLI** (`~/.local/bin/codex`) connecté à son compte ChatGPT, fonctionnalité `image_generation` activée (vérifier : `codex features list | grep image_generation`). Chaque image consomme son quota ChatGPT : ne génère que ce qui sert, et pas de « variantes pour voir » sans raison.

## Commande

```bash
~/.claude/skills/site-web-3d/scripts/codex_image.sh <dossier_projet> <chemin_relatif_sortie> "<prompt>" [image_reference]
```
- Lancé en arrière-plan (`nohup`), journal dans `<projet>/.gen/<nom>.log`. Durée : 2–6 min. Lancer toutes les images d'un coup, puis coder.
- Vérifier la fin : `tail -2 <projet>/.gen/*.log` et `ls <sortie>` ; `ps aux | grep -c "[c]odex exec"` pour le nombre encore en cours.
- Les originaux sont aussi dans `~/.codex/generated_images/`.

## Structure de prompt qui marche
`[type de photo] de [sujet précis], [cadrage/angle], [lumière], [ambiance/couleurs de la marque], [ce qu'il ne faut pas : aucun texte, aucun logo], format paysage 1536x1024 (ou portrait 1024x1536), photoréaliste.`

Exemples réutilisables :
- **Ciel de hero** : « photographie cinématographique d'une mer de nuages vue depuis l'altitude de croisière à l'heure dorée, soleil bas à droite, ciel du bleu profond à l'ambre, grande zone de ciel vide au centre pour du texte, aucun avion, aucun texte, 16:9 1536x1024, photoréaliste ».
- **Sujet à détourer** : « … avion entier visible et centré avec de la marge, ISOLÉ sur fond magenta uni pur #FF00FF sans dégradé ni ombre portée (pour détourage) ». Puis `key_magenta.py`.
- **Produit réel fidèle** : passer la photo officielle en référence + « en te basant FIDÈLEMENT sur [l'objet] de la photo jointe (décrire livrée/couleurs/logo) ».
- **Vue aérienne d'une ville** : « photographie aérienne cinématographique à l'heure dorée de [ville, pays] : [repères visuels réels], vue depuis un avion en approche (sans montrer le hublot), aucun texte ».
- **Intérieur / ambiance** : préciser matières, couleurs de la marque, lumière, « aucune personne » si besoin.
- **Images de début/fin pour une vidéo** : même cadrage et même lumière dans les deux prompts, seule l'action change (« tasse vide » / « tasse pleine, mousse dorée »).

## Après génération
1. `python3 scripts/optimize_images.py <brut> <dossier_img> --width 1600` (JPEG progressif q80) — ou `key_magenta.py` pour un sujet détouré (WebP avec transparence, recadré).
2. Regarder chaque image (Read) : cohérence avec la marque, défauts (texte parasite, mains, logos faux).
3. Mettre les originaux de côté dans `<projet>/.gen/originals/`.

## Limites à dire à l'utilisateur
- Les personnes générées ne sont pas de vrais employés ; les logos/livrées peuvent être approximatifs → à remplacer par des photos réelles avant mise en ligne.
- Codex ne produit pas de vidéo : pour une séquence au scroll, l'utilisateur génère la vidéo (Kling, Veo, Runway) à partir des images de début et de fin.
