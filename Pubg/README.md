# ZONE ROYALE

An original top-down battle royale game inspired by the PUBG formula, built with pure HTML5 Canvas + JavaScript — no dependencies, no build step.

## How to Play

Open `index.html` in any modern browser, or serve the folder:

```
node serve.js        # http://localhost:8123
# or, if you have Python:
python -m http.server 8000
```

## Gameplay

- 24 combatants drop into a 3200×3200 map. Last one standing wins.
- Loot buildings for weapons (Pistol, Shotgun, SMG, Rifle, Sniper), ammo, vests (Lv 1–3) and heals.
- A blue zone shrinks in phases and deals increasing damage outside it — keep moving toward the white circle.
- 23 AI enemies loot, fight each other, hunt you, heal, and rotate with the zone.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move |
| Mouse | Aim |
| Left click | Shoot / punch |
| R | Reload |
| 1 / 2 | Switch weapon slot |
| 3 | Use bandage (+30 HP) |
| 4 | Use medkit (full HP) |
| Walk over items | Auto-pickup |

## Files

- `index.html` — page structure and HUD
- `style.css` — HUD, start and end screens
- `game.js` — full game engine: world generation, loot, bot AI, zone, combat, rendering
