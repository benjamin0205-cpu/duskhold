# DUSKHOLD

Et online multiplayer action-RPG til browseren. Kampene er som i Diablo, og
quests, klasser og zoner er som i World of Warcraft. Op til 16 spillere kan
være i samme verden på én gang.

- **3 klasser:** Warrior (tank, nærkamp), Mage (magi på afstand, area damage)
  og Ranger (bue, kan heale holdet).
- **8 zoner og 4 byer:** Inderst ligger Duskhold med Whispering Meadow (level 1–3),
  Thornwood (3–6), Ashen Graveyard (6–9) og Hollow Crypt (9–10). Bag bjergkammen
  ligger de ydre lande: Frostpeak (11–13) med byen **Frosthaven**, Emberwaste (13–15)
  med **Cinderwatch**, Drowned Marsh (15–17) med **Mirebrook** og Shattered Spire (17–20).
- **Max level 20** og **20 quests** fordelt på fire quest-givere, med to bosser:
  **Morvath, the Hollow King** og **Nharzul, the Shardbound**.
- **En kiste i hver by** til at gemme ting i. Alle kister deler indhold.
- **Waystones** i hver by: rør dem én gang, så kan du rejse hurtigt mellem byerne.
- **Nye butikker:** større tasker, større kiste, eliksirer (Fury og Stone), mystiske
  kister med chance for legendary, og sjældne våben og rustninger, der skifter hvert 10. minut.
- **Loot i 5 sjældenheder** (hvid, blå, gul, lilla og orange). Hver spiller får sit
  eget loot, så I aldrig skændes om det.
- **Champions** (fjender med blåt skær), potions og "sealed crates", man kan gamble på.
- Party-rammer, chat, minimap, verdenskort, lyd og musik.

---

## Spil sammen med venner

Du har to muligheder.

### A) Hjemme på din egen computer (venner på samme wifi)

1. Installér **Node.js** (vælg "LTS") fra <https://nodejs.org>. Det skal kun gøres én gang.
2. Pak zip-filen ud.
3. Dobbeltklik på:
   - **Windows:** `start-windows.bat`
   - **Mac:** `start-mac.command` (giver Mac en advarsel, så højreklik på filen og vælg **Åbn**)
4. Spillet åbner selv i din browser på `http://localhost:3000`.
5. Dine venner på samme wifi skriver `http://DIN-IP:3000` i deres browser. Sådan finder du din IP:
   - **Windows:** Åbn "Kommandoprompt", skriv `ipconfig`, og find **IPv4-adresse** (fx `192.168.1.23`).
   - **Mac:** Systemindstillinger → Wi-Fi → Detaljer → **IP-adresse**.
   - Spørger Windows Firewall om adgang, så klik **Tillad**.

Serveren kører, så længe vinduet er åbent. Luk vinduet for at stoppe den.

### B) Online, så alle kan spille med et link (gratis på Render)

1. Lav en gratis konto på <https://github.com>.
2. Klik **New repository**, kald det `duskhold`, og klik **Create repository**.
3. Klik **uploading an existing file**, og træk **alt indholdet** af den udpakkede mappe
   ind på siden. Mappen `node_modules` skal ikke med, hvis du har den. Klik **Commit changes**.
4. Lav en gratis konto på <https://render.com> (log ind med din GitHub).
5. Klik **New +** → **Blueprint**, og vælg dit `duskhold`-repository. Render finder selv
   filen `render.yaml`. Klik **Apply**.
6. Vent et par minutter. Så får du et link som `https://duskhold-xxxx.onrender.com`.
   Send det til dine venner. Det virker på alle computere.

**Godt at vide om gratis-planen på Render:**
- Serveren går i dvale efter 15 minutter uden spillere. Den første, der åbner linket
  bagefter, venter cirka et minut, mens den vågner.
- Når Render genstarter serveren, nulstilles den gemte fil på serveren. Spillet gemmer
  derfor også din helt i din egen browser og lægger den automatisk tilbage, når du logger
  ind igen. Dine helte forsvinder altså ikke, så længe du bruger samme browser.

---

## Styring

| Tast | Hvad den gør |
|---|---|
| **Venstreklik** | Gå derhen. Klik på en fjende for at angribe den, indtil den dør. Hold knappen nede for at blive ved med at gå. |
| **W A S D** | Gå direkte |
| **Højreklik / 1** | Første evne (sigt med musen) |
| **2 · 3 · 4** | Flere evner, som låses op på level 3, 5 og 8 |
| **Shift + klik** | Angrib mod musen uden at gå |
| **Q** | Drik en healing potion |
| **C** eller **I** | Karakter og tasker. Klik på en ting for at tage den på. |
| **L · M · H** | Quest log · kort · hjælp og indstillinger |
| **Enter** | Chat |
| **Musehjul** | Zoom |

Tal med **Elder Maren** (gult "!" over hovedet) for at få quests, og med **Borin** for at handle.
Springvandet i byen healer dig.

Kører spillet langsomt på en ældre computer, så tryk **H** og skift **Graphics** til **fast**.

---

## Filerne

| Fil | Hvad den er |
|---|---|
| `server.js` | Serveren. Den styrer verden, fjender, loot og gemmer heltene i `data/`. |
| `public/sim.js` | Spillets regler: klasser, evner, fjender, ting og quests. |
| `public/client/` | Det, du ser: 3D-grafik, lyd og menuer. |
| `public/index.html` | Siden, browseren åbner. |
| `solo-version/index.html` | Solo-udgaven i én fil. Den kan fx uploades til itch.io som HTML-spil. |
| `src/` + `build.mjs` | Kildefiler til at bygge solo-udgaven igen (`npm install` og så `npm run build`). |

Vil du ændre noget, fx gøre bossen sværere eller give flere guld, så ligger tallene i
`public/sim.js` (søg efter `MONSTERS`, `CLASSES` og `QUESTS`).
