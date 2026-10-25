# Field notes — családi túra tervezés (anonimizált)

Valós használati eset: egy baráti társaság Vándorral próbált vasárnapi túrát
szervezni (Budai-hegyek). A beszélgetés megmutatja, **mi mentén dől el** egy
csoportos túra a gyakorlatban — ez a planner (T8/T9) igazi substrate-je, és
egyben az „awesomeness = újdonság" tézis ellenpontja: itt a cél **nem** a
teljesítés, hanem a kényelmes együttlét.

Szereplők (szerepcímkék): **Szervező** (összehívta) · **Társ** (társházigazda,
Vándort hozta) · **Apa** / **Anya** / **Kicsi** (kisgyerekes család) · **Én**
(a fő vándor).

## Mi derült ki — a tervezés tengelyei

A társaság egy **random szakaszt** dobott az appal, aztán **köré** próbált túrát
tervezni. A döntést végül nem a dobás, hanem ezek a kényszerek vezették:

1. **„Bébi túra", nem teljesítés.** Kifejezetten *nem* a jeligére teljesítés a
   cél — szociális élet, friss levegő. Rövid, laza kör. → a novelty-hajtott
   dobás itt nem a fő szempont; kell egy „kényelmes/rövid" üzemmód.
2. **Kisgyerek napirend.** A Kicsinek 11-től aludnia kéne; alvás menet közben
   (háton/hátizsákban) vagy hazafelé az autóban. → **max. séta-idő / -hossz**
   kemény korlát, nem ajánlás.
3. **Étterem séta-távolságban.** Óraátállítás miatt korán indulnának, utána
   ebéd — ideális, ha az étterem gyalog elérhető a túra végén. → POI-típus:
   **vendéglátás az access-pont közelében.**
4. **Parkolás-biztonság.** Konkrét választás esett egy parkolóra, mert ott
   **nagyobb eséllyel van szabad hely** (és 3 percre a másik belépőtől). →
   access-pont rangsorban számítson a parkoló mérete/zsúfoltsága.
5. **„Kerüld, amerre sokat járunk."** Az egyik fél elutasított egy népszerű
   játszó/belépőt, mert túl gyakran járnak arra. → **avoid / „már láttam"**
   szűrő — a segment-spaced-repetition modell inverze (ismerős = unalmas).
6. **Autóval mennek → BKV irreleváns.** A csoport kocsival jön, tömegközlekedés
   nem szempont. → az access-mód a *csoport* tulajdonsága; a planner kérdezze
   meg (autó vs. transit) a T8 előtt.
7. **Indulási idő egyeztetés.** „Új 9 / régi 10" — a találkozó időpontja és a
   parkoló a végső megállapodás tárgya. → a megosztott túra-linkhez jól jönne
   egy **találkozó idő + hely** mező.

## Tanulság a backlogra

- **T8/T9 planner:** a bemenet nem egy cél-POI, hanem egy **kényszer-profil**
  (max séta-idő, access-mód, kell-e étterem a végén, avoid-lista, parkolás-
  biztonság). Érdemes ezt külön „túra-profil" objektumként modellezni.
- **Avoid / „ismerős" szűrő:** a spaced-repetition logika fordítottja — adjunk
  módot a *túl ismerős* szakaszok kizárására (család-mód ≠ felfedező-mód).
- **Vendéglátó POI** az access-pont köré (az eddigi parking/bus_stop mellé).
- **Parkoló-kapacitás** az access-rangsorba (szabad hely valószínűsége).
- **Megosztott túra-link:** találkozó idő + hely a `#t=…&p=…` hash mellé.

## Anonimizált kivonat

> **Szervező:** Csináltam egy ilyet [vasárnapi kirándulás].
> **Társ:** Éljen — ezzel tudunk hozzájárulni 🙂 [Vándor app link]. Andris
> tollával ékeskedve.
> **Szervező:** Annyi, hogy mi inkább bébi-kirándulást tolnánk — szociális
> élet / friss levegő, nem teljesítés a jeligére. Remélem van ilyen szűrő 🤓
> **Én:** Az app csak dob egy random szakaszt, olyan túrát tervezünk köré,
> amilyet szeretnénk. De dobhatunk, amíg kijön a [kedvelt játszó] 🤣
> **Anya:** Nekünk teljesen jó — viszont óraátállítás van, a Kicsinek 11-től
> aludnia kéne.
> **Társ:** Én örülnék, ha nem oda mennénk, eleg sokat járunk arra.
> **Szervező:** Csak [egy bizonyos helyet] kerüljünk el, kérlek.
> **Apa:** Nekünk is jó, ha ti dobjátok kockával; az óraátállítás miatt minél
> hamarabb mennénk, és jó lenne, ha lenne valami étterem a közelben.
> **Társ:** Akkor vagy lőjük be, hogy közeli legyen, vagy mehet [hegyvidék].
> Hánykor kezdenétek? Autóval jön mindenki, szóval a BKV nem szempont, ugye?
> **Apa:** Autóznánk, igen. Új kilenc / régi tíz?
> **Anya:** A Kicsi alvása: hazafelé 1 körül az autóban, vagy útközben
> hátizsákban — ha sétatávban van étterem, az lenne ideális.
> **Társ:** És ha nyomunk egy olyan kört, mint [korábban]? [Parkoló], aztán
> [étterem]?
> **Anya:** Az is szuper, ott a [játszó] is, onnan a [kilátó] — bár az arrébb
> van, ~35 perc gyalog.
> **Anya:** Akkor holnap 9:30 a [étteremnél]?
> **Én:** Ez a másik kör klasszabb túrának tűnik, de nem érinti az éttermet. A
> [másik] parkoló 3 percre van autóval, és nagyobb eséllyel lesz szabad hely —
> ne ott találkozzunk 9:30-kor?
> **Apa:** De!!
> **Anya (másnap reggel):** Minket megcsavart az óraátállítás, 5 óta mindenki
> ébren — valószínű nem ebédelünk, csak hazazúzunk 11-kor.
> **Szervező:** Kitartást! 🤞

*(Nevek, gyereknév, konkrét helyszínek és a személyes részletek eltávolítva /
általánosítva.)*
