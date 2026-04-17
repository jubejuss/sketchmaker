# Stiilileidja — kuidas kasutada

Töölauarakendus disaineritele. Sisesta kliendi veebileht või brief → saad tagasi SEO/WCAG analüüsi, konkurentide ülevaate, brändistrateegia ja kolm visuaalset suunda koos elav-moodboardiga Figmas või Pencilis.

---

## 1. Seadistus (ühekordne)

Ava **Seaded** ja pane sisse API võtmed:

- **Anthropic API võti** — kohustuslik. `sk-ant-api03-...` formaadis võti lehelt platform.claude.com/api-keys. *NB!* OAuth tokenid (`sk-ant-oat...`) enam ei tööta.
- **Pexels API võti** — vaikimisi piltide allikas, tasuta 200 päringut/tunnis. Võti pexels.com/api/new.
- **OpenAI API võti** — ainult siis, kui vahetad piltide allika `OpenAI` peale (genereerib AI-pilte `dall-e-2` või `dall-e-3` mudeliga; seadistuses vali üks neist). Nõuab verifitseeritud organisatsiooni + projekti allowlist'i.
- **Ahrefs API võti** — valikuline. Ilma selleta jäävad SEO-konkurendid puudu, aga kõik muu töötab.
- **Figma Personal Access Token** — valikuline, ainult kui soovid moodboardi otse Figmasse. figma.com → Settings → Security.

**Piltide allikas:** Pexels (päris fotod, kiire, tasuta) või OpenAI (genereeritud stseenid, kallim, aeglasem). Vaikimisi Pexels.

**Väljundi kaust** — vaikimisi `~/Desktop/stiilileidja-output`. Siia tulevad PDF-raportid, HTML-versioonid ja salvestatud projektid.

---

## 2. Kliendiandmed ja soovid

**Sisendvaates** saad valida kahe režiimi vahel:

**A) URL-režiim** — kliendi praegune veebileht
- Süsteem scrape'ib ekraanipildid, värvid, fondid
- Ahrefs toob SEO-konkurendid (kui võti olemas)
- Claude teeb SEO + WCAG analüüsi olemasoleva lehe kohta
- Ideaalne redesign-projektideks

**B) Brief-režiim** — tekstiline kliendi soov
- Kirjuta lahti: mis ettevõte, kellele, mis väärtus, eelistused
- Kasuta kui klienti pole veel veebilehte või teed täiesti uut brändi

**Konkurentide ulatus** (local / regional / global):
- *Local* — kohalikud samasuguse turusegmendi tegijad
- *Regional* — Euroopa/Balti regiooni
- *Global* — maailma tipptegijad

Viimati tehtud projektid salvestuvad automaatselt — saad need ühe klikiga uuesti avada või kustutada.

---

## 3. Mis raportist välja tuleb

Pärast ~2-3 minutit (olenevalt sisendist) saad:

**SEO & WCAG analüüs** (URL-režiimis)
- Praeguse lehe tugevused, nõrkused, soovitused
- WCAG 2.1 AA-vastavus

**Konkurendid**
- SEO-konkurendid Ahrefsist (domeeni rating, orgaaniline liiklus, märksõnad)
- Disaini-konkurendid Claude'i avastatud (visuaalne stiil, värvid, tüpograafia, eristuv joon)

**Brändistrateegia**
- Positsioneering, tonaalsus, värvistrateegia, tüpograafia-suunised

**Kolm visuaalset suunda** — iga suund sisaldab:
- Mockup'i webilehe elementidest (nav + hero + kaardid + footer)
- Värvipaletti
- Fondipaari
- Soovituslikku layoutit ja tunnet
- Moodboardi pilte (Pexels või OpenAI)

**PDF + HTML-raport** — klientidele saatmiseks, automaatselt salvestatud väljundi kausta.

---

## 4. Moodboard — valik Sulle

Tulemustevaates saad iga suuna puhul valida 4 väljundivõimaluse vahel:

| Režiim | Mis juhtub |
|--------|------------|
| **Figma — Ehita kohe** | Loob elava moodboardi otse Figmas (nõuab Desktop Bridge plugina avamist) |
| **Pencil — Ehita kohe** | Loob moodboardi Pencil rakenduses (nõuab, et Pencil.app oleks avatud — MCP binaar käivitub automaatselt) |
| **Figma — Prompt** | Salvestab kopeeritava prompt'i `.md` failina — saad ise Figma AI-sse panna |
| **Pencil — Prompt** | Sama, aga Pencili jaoks |

See tähendab: kui MCP-ühendused töötavad → **üks klikk ja moodboard ilmub ekraanile**. Kui ei tööta või tahad ise kontrollida → saad sama info kopeeritava promptina.

---

## 5. Figma MCP eeldused (kui tahad "Ehita kohe")

1. Figma Desktop peab olema lahti
2. **Figma Desktop Bridge** plugin peab olema avatud (Plugins → Development → Figma Desktop Bridge)
3. Plugin peab näitama rohelist "MCP ready" indikaatorit

Sama plugin, mida kasutab Claude Desktop — saad mõlemat korraga kasutada.

**Seaded → "Testi MCP ühendust"** nupp näitab kohe, kas Figma ja Pencil on kättesaadavad.

---

## TL;DR

1. Seadista võtmed (ühekordne)
2. Sisesta URL või brief + vali konkurentide ulatus
3. Klõpsa "Käivita" → oota ~2-3 min
4. Tulemustes: loe raport, vali moodboardi väljundrežiim suuna kohta
5. Saad PDF-raporti + Figma/Pencil moodboardi või kopeeritavad promptid
