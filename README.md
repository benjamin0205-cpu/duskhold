# DUSKHOLD

Et online multiplayer action-RPG til browseren. Kampene er som i Diablo, og
quests, klasser og zoner er som i World of Warcraft. Op til 16 spillere kan
være i samme verden på én gang.

- **6 klasser:** Warrior (tank, nærkamp), Mage (magi på afstand, area damage), Ranger (bue,
  kan heale holdet), Paladin (hammer og skjold, stunner, healer og beskytter holdet),
  Necromancer (vækker skeletter, der kæmper for ham) og Assassin (hurtige knive og skyggespring).
- **8 zoner og 4 byer:** Inderst ligger Duskhold med Whispering Meadow (level 1–3),
  Thornwood (3–6), Ashen Graveyard (6–9) og Hollow Crypt (9–10). Bag bjergkammen
  ligger de ydre lande: Frostpeak (11–13) med byen **Frosthaven**, Emberwaste (13–15)
  med **Cinderwatch**, Drowned Marsh (15–17) med **Mirebrook** og Shattered Spire (17–20).
- **Max level 20** og **20 quests** fordelt på fire quest-givere, med to bosser:
  **Morvath, the Hollow King** og **Nharzul, the Shardbound**.
- **5 dungeons med flere etager** under jorden, ligesom i Diablo (2–3 etager hver): Goblin Warren (level 4–6), The Catacombs (7–9),
  Frozen Depths (12–14), The Molten Deep (14–16) og Sunken Temple (16–18). Find trappen ned
  (▼ på kortet), kæmp dig gennem rummene og dræb dungeon-bossen, som vogter en skattekiste.
- **Hest (tast R):** køb en hest hos Borin, og rid 60% hurtigere. Kamp kaster dig af.
- **Treasure goblins:** sjældne goblins med en sæk guld dukker op ude i verden. De løber
  væk og forsvinder, så fang dem hurtigt!
- **Health globes:** monstre taber røde kugler, der healer dig, når du går hen over dem.
- **Town portal (tast T):** stå stille et øjeblik, så åbner en portal til den sidste by, du
  har besøgt. Gå ind i portalen i byen for at komme lige tilbage. Venner kan også bruge den.
- **Smid ting (højreklik på en ting i tasken):** tingen lander på jorden, og alle kan samle
  den op. Sådan giver man ting til en ven.
- **En kiste i hver by** til at gemme ting i. Alle kister deler indhold.
- **Waystones** i hver by: rør dem én gang, så kan du rejse hurtigt mellem byerne.
- **Nye butikker:** større tasker, større kiste, eliksirer (Fury og Stone), mystiske
  kister med chance for legendary, og sjældne våben og rustninger, der skifter hvert 10. minut.
- **Loot i 5 sjældenheder** (hvid, blå, gul, lilla og orange). Hver spiller får sit
  eget loot, så I aldrig skændes om det.
- **Champions** (fjender med blåt skær), potions og "sealed crates", man kan gamble på.
- **Ting man kan smadre, ligesom i Diablo:** tønder, kasser, krukker, knoglebunker og
  sarkofager ligger overalt og giver guld, potions og items. Gyldne skattekister giver
  det bedste loot, og nogle sarkofager er ikke tomme…
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
- Uden en database nulstilles kontiene, når Render genstarter serveren. Heltene ligger dog
  også som backup i din browser: opret bare kontoen igen med samme navn, så kommer de tilbage.
  Sæt en gratis database op (se nedenfor), så sker det slet ikke.

### Gem heltene for altid (gratis database hos Neon)

1. Gå til <https://neon.com> og lav en gratis konto (du kan logge ind med GitHub).
2. Lav et nyt projekt. Kald det `duskhold`, og vælg en region i Europa (fx Frankfurt).
3. Klik **Connect** og kopiér forbindelses-linket. Det starter med `postgresql://`.
4. Gå til <https://dashboard.render.com>, klik på din `duskhold`-service og vælg **Environment**.
5. Klik **Add Environment Variable**:
   - **Key:** `DATABASE_URL` · **Value:** linket fra Neon
   - Klik igen og tilføj **Key:** `ADMINS` · **Value:** dit eget kontonavn i spillet
6. Gem. Render starter serveren igen, og nu bliver alle konti gemt i databasen.

Du kan tjekke, at det virker, ved at åbne `https://DIT-LINK.onrender.com/health`. Der skal stå
`"store":"database"`.

### Konti, chat og admin

- Online skal man lave en gratis konto med navn og kodeord. Så kan man spille fra enhver
  computer. Helte fra før kontiene kom med, flyttes automatisk ind i kontoen.
- Grimme ord bliver lavet om til `****`, og man kan ikke spamme chatten.
- Klik på et navn i chatten for at blokere spilleren. Skriv `/unblock navn` for at fortryde.
  Under **?** kan man også slå spiller-chatten helt fra.
- Står dit kontonavn i `ADMINS`, kan du skrive `/mute navn 30` (30 minutter), `/unmute navn`
  og `/kick navn` i chatten.

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
| **R** | Rid på din hest (hvis du har købt en) |
| **T** | Town portal: åbn en portal til byen og gå tilbage igen bagefter |
| **Højreklik på en ting i tasken** | Smid den på jorden |
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
