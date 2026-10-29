# Turista-lencsék — Benedek István négy vándora

*Design-note. Hogyan lesz Benedek István turista-tipológiájából négy olvasat
ugyanarra a szakasz-gráfra — a tájra, nem a túrára.*

Kapcsolódó: a filozófia ([[vandor-philosophy]] a memóriában), az
[AWESOMENESS-SURFACE.md](AWESOMENESS-SURFACE.md), és a két field note
([debütál](FIELD-NOTES-VANDOR-DEBUT.md) · [családi](FIELD-NOTES-CSALADI-TURA.md)).

## A keret

Benedek István a *Csavargások*-ban az **igazi turistá**-t állítja szembe a
kóklerekkel: a **kultúrista**, a **faj-turista**, a **kóca-turista**. A kísértés
az volna, hogy ezekből négy *üzemmódot* csináljunk, amelyek *mást terveznek*. De
az nem Vándor. Vándor északi csillaga változatlan: **a szakasz az egység, az út a
cél.** Ezért ezek nem módok —

> **Négy lencse ugyanarra a gráfra. A lencse nem változtatja meg a túrát;
> megváltoztatja, mit mutat Vándor a tájból.**

Ez pontosan illik a tézishez: a szakasz marad az egység, a lencse csak egy
*olvasata*. Közös architektúra: két overlay-lencse (kontextus-POI réteg), egy
re-ranking lencse (meredekség), plusz a mai default.

## A négy lencse

| Lencse | Ikon | Típus | Mit mutat |
|---|---|---|---|
| **turista** (default) | 🧭 | — | A mai app. Az út a cél, novelty-roll (`pickNovelSegment`). |
| **kultúrista** | 🍷 | POI-overlay | Vendéglátás a szakasz / access körül — amire egy rendes turista a hátizsákjában költ. |
| **faj-turista** | 🩸 | re-ranking + aura | Minden szakasz **meredekség-aurája** (delta_h, a jelzésszín helyett egy szekvenciális ramp — lapos = halvány, meredek = vérvörös 🩸), a top-5 korona-badge („👑 #3 · 24%"), és egy stat-kártya (leggorombább szakasz, lejtés-hisztogram = egyben a ramp jelmagyarázata). |
| **kóca-turista** | 🐷 | POI-overlay (gag) | Felszerelés-boltok (`shop=outdoor/sports`). Vicc, de olcsó vicc. |

## Az iránytű — a négy aspektus egysége (UI, T12b)

A négy lencse nem egy sor gomb a panelben, hanem egy **iránytű-rózsa**. A geometria a
filozófia: a **turista (🧭) északon**, vele szemben az árnyéka, a **kóca (🐷) délen**
(turista vs. anti-turista); a **faj-turista (🩸) keleten** (a hajnali kaptató, a Harcos)
szemben a **kultúristával (🍷 nyugaton**, az alkonyi bor, a Szerető). A kör a
King/Warrior/Mage/Lover kvaternió: *egy igazi turista mind a négyből egy kicsi.* A **kör
közepén a dobókocka** — a legnagyobb, leghangsúlyosabb elem, az app elsődleges akciója —, és
**lencse-függő stratégiával dob** (lásd lent).

**Elhelyezés — egy jobbra-fenti „vezérlő-oszlop" (hub):** az egész `#panel` egy **átlátszó,
auto-szélességű** flex-oszlop jobbra fent (desktop + mobil egységesen). Maga a hub click-through;
a kártyái/gombjai a saját papír-felületeik, így a térkép a köztük lévő résekben is kattintható.
Az oszlop fentről: iránytű-rózsa (kocka + lencsék) → felirat-kapcsoló → Benedek-kártya →
[összecsukott módban: akció-pirulák] → fogantyú → túra-kártya. „Auto-szélesség" = csak annyi
széles, amennyi a tartalma: összecsukva a rózsa-szélesség, kinyitva a (maximált) túra-kártya.
A régi bal-fenti panel megszűnt; a **túra-tartalom a hub papír-kártyája** (`.panel-body`), a rózsa
fölötte lebeg.

**Mobil-munkafolyamat (összecsukható):** mobilon a hub **alapból össze van csukva** — csak a
kompakt iránytű + az **akció-pirulák** (🔄 kör-zárás / 🧩 hézag-kitöltés / 🗑️ ürítés, ikon-only,
amelyik épp releváns, szövegek nélkül) + egy fogantyú (`#panel-handle`, ▾); a térkép szabad,
miközben **dobsz / lencsét váltasz / gyors akciót nyomsz**. A fogantyú kinyitja a túra-kártyát;
a kocka vagy egy túra-akció (kör-zárás / hézag) **automatikusan visszacsukja** (`collapsePanel`).
Desktopon a `.panel-body` mindig látszik, a fogantyú és a pirulák rejtve. A pirulák a kártya
szöveges gombjaival **közös `class`-t** viselnek, így egy delegált kezelő (`#panel`-en) hajtja
mindkettőt. A Benedek-kártya alapja mobilon **csukva**, desktopon nyitva (`isMobile`=`innerWidth≤640`).

**Önmagát magyarázó iránytű:** a kocka alatti felirat (`rollLabel`: „Vándor dob" /
„Kultúrista dob" / …) egyben **nyitó/záró kapcsoló**: kinyitva egy kis kártya mutatja az
aktív turista **Benedek István-i jellemzését** (modern megfogalmazásban, `LENS_META.blurb`) +
hogy mit csinál a lencse. A nyitott/zárt állapot **localStorage-ban ragad** (alap: nyitva).
A négy idézet fölött a keret: *„Az emberiség két részre oszlik: aki turista, és aki nem…"*

A dob stratégiái: 🧭 novelty (az északi csillag); 🍷 novelty az étel/ital-közeli ösvény-
poolban (`segmentsNearHospitality`); 🐷 **anti-Vándor** — már bejárt szakaszt dob
(`pickWalkedSegment`, a „járatlanért" inverze); 🩸 a **meredek kvantilis** (`steepPool`, felső
25% átlag-lejtés) `pickNovelSegment`-tel súlyozva — kemény kaptató, de a járatlanért felé húzva;
üres pool (nincs DEM) → novelty-fallback.
A piknik a **turistáé, nem a kultúristáé** (a turistának minden a hátizsákjában van): 🧭 rajzol
🧺 pikniket, 🍷 rajzol 🍴🍷 étel/italt.

## A szintézis — kultúrista = a családi field note ingestje

A legfontosabb felismerés: a 🍷 **kultúrista lencse** és a
[családi field note](FIELD-NOTES-CSALADI-TURA.md) „étterem sétatávban a túra
végén" igénye **ugyanaz az egy ingest.** Egy vendéglátás-réteg két igényt
szolgál — ez teszi ezt a legjobb első sávvá.

## Adat & méret (a „reasonable ingest" kérdés)

- **Vendéglátás (🍷 + família):** egy új Overpass-lekérés a `ingest/pois.ts`
  mintájára — `amenity ∈ {restaurant, cafe, fast_food, pub, bar, biergarten}`,
  `tourism=picnic_site` (a `shelter` már megvan). A 20 km bbox fél Budát fedi →
  nyersen sok; **kódban klippeljük** a marked-net közelébe (< ~600 m bármely
  szakasz-koordinátától vagy access-ponttól), így a *csatolt* halmaz kicsi és
  hegyvidéki. A vendéglátás **kontextus-POI, nem gráf-csúcs** (nem endpoint).
- **Magasság (🩸): kész** (T12d, 2026-10-29). NE API (rate-limit, flaky) — **SRTM
  1-arcsec `.hgt`** csempe a bboxra (2 tile: N47E018/9), az **AWS `elevation-tiles-prod`
  skadi** mirrorról (`.hgt.gz`, auth nélkül), Node `zlib`-bel kitömörítve → nyers
  int16, **nulla függőség**, offline, determinisztikus, illik a „commit the data"
  etoszhoz (a nyers tile gitignore-olt, csak a derivált metrika kerül be). Lokális
  bilineáris mintavétel a polyline mentén ~30 m-enként → per-szakasz
  `gainM/lossM/netM` + átlag- és csúcs-lejtés (`grade`/`maxGrade`, ~90 m ablak),
  `edge.elevation`-be sütve (`ingest/dem.ts` + `graph/attach-elevation.ts`). Ez az
  ingest a rég halogatott szintprofilt (T7 later), a nehézségi jelzést és később
  az awesomeness-score bemenetét is megnyitja — high-leverage.
- **Boltok (🐷):** `shop=outdoor/sports`, a kultúrista-overlay újrahasznosítása.

## Ami NEM ingest (a családi field note többi tanulsága)

Planner-profil (T8/T9), nem ingest: max séta-idő, parkoló-kapacitás a rangsorba,
avoid / „ismerős" szűrő (a spaced-repetition inverze — a `profile.ts` megvan,
csak invertálni egy „család-mód" alatt), találkozó idő+hely a megosztott linkben.
A vendéglátás az **egyetlen**, amit egy tiszta kis ingest old meg — és az
egybeesik a kultúristával.

## Javasolt sorrend

1. ~~Lencseváltó substrate (előfeltétel, kicsi).~~ **kész** (T12a, 2026-10-25).
2. ~~**🍷 kultúrista + vendéglátás-ingest**~~ **kész** (T12b, 2026-10-26) — `data/hospitality.json`
   (600 m-re klippelve a hálóhoz), futásidőben a túra köré szűrve (800 m sétatáv), pin-overlay + panel-sor.
3. 🚌 transit switch (a `planWalk` close:false mag kész — lásd BACKLOG T8).
4. ~~🩸 faj-turista + DEM.~~ **kész** (T12d, 2026-10-29) — SRTM `.hgt` DEM-ingest,
   `edge.elevation`, meredekség-aura + stat-kártya + korona-badge + meredek-dob. ← **következő volt**
5. 🐷 kóca (gag, ha marad kedv).

Mindegyik önálló, tesztelhető ship a granularity-szabály szerint.
