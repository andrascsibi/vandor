# Field note — Budakeszi, a vadaspark mellett (a krónikás feljegyzése)

*Vasárnap este. Hatan: a család négyen, meg a fiam osztálytársa az anyukájával.
Nem nagy expedíció — közeli, könnyű délután. De megint igazolt egy tézist, és
megmutatott két-három alacsonyan lógó gyümölcsöt.*

## A dobás — a biléta mint szűrő

Közeli helyet akartam, ezért **többször újra kellett dobni.** És itt derült ki,
hogy a 🅿️ **autós távolságjelző biléta** nem dísz: pont ez segített kiszűrni,
melyik dobás van elég közel. A dobás a novelty felől választ, de a *kényszer*
(„közel legyen") felől a vándornak kell szűrnie — és a biléta pont ezt a
döntést adta a kezembe, egy pillantásra.

> Felmerült: egy **csúszka** az access-point UI-on, ami a dobást eleve a
> távolsághoz igazítja. De lehet, hogy fölösleges bonyolítás — most jól esik a
> minimalista kinézet, és a biléta + újradobás már most elvégzi a munkát.

## A tézis, megint saját lábon

Az **első kereszteződésnél** meggondoltuk az irányt, és letértünk egy jobb
ösvényre. És mivel **először jártunk itt, teljesen mindegy volt, merre megyünk** —
minden irány ismeretlen volt. Pontosan ez az, amit a
[debütál field note](FIELD-NOTES-VANDOR-DEBUT.md) óta állítunk: a novelty nem a
helyben lakik, hanem az irányban, a szakaszban. Új helyen nincs rossz irány.

## Vándor a túra közben is használt volt

Ez az új. Eddig a tervezés előtt dobtunk; most **menet közben** is elővettem:
pár nyomással **áttervezhettem a túrát**, és láttam

- a **várható emelkedőket** (🩸 faj-turista — **első éles igazolása**, a T12c
  profilja remekül bevált a terepen), és
- a **piknikhelyeket** (🧺).

Vándor nem csak otthon, a kávé mellett tervez — a zsebben is elkísér.

## Két-három alacsonyan lógó gyümölcs

1. **„Hol vagyok?" pont.** Néha csak azért váltottam át Mapy-ra, mert az
   mutatja a lokációm. Ez alacsonyan lógó gyümölcs — csak ne legyen még egy
   kapcsoló a UI-n. Ötlet: **ne kérjünk lokáció-engedélyt alapból**; egy gomb a
   **jobb alsó sarokban** kéri el, és akkor felkerül egy **kis pont egy kis
   nyíllal** (merre nézek). Opt-in, diszkrét, és eltünteti az egyetlen okot,
   amiért átváltok egy másik térképre.

2. **Hiányoznak az 50 m-nél rövidebb szakaszok.** Belefutottam egy régi
   döntésem árnyékába: az 50 m-es merge-szabály eldobja a rövid összekötő
   szakaszokat, ezért a tervező **pontatlan** — azt hiszi, ott nem lehet
   átmenni, pedig lehet. Az eredeti ötlet (a rövid szakaszok végpontjait
   egybefésülni) **nem szép**: összetolja a geometriát, és megnehezítheti a
   navigációt. Jobb: **tartsuk meg a rövid szakaszokat is** (pontos
   összefüggőség), és a **dobókocka jelölti listáját szűkítsük a ~400 m-nél
   hosszabbakra** — a `MIN_RANK_LENGTH_M = 400` konstanst a faj-turistánál már
   használjuk, itt újra. Így a gráf pontos marad, de a dobás nem kínál
   mikroszakaszt.

## A tanulság — magamnak, a krónikásnak

A novelty-tézis megint állt: új helyen minden irány jó. De a nap *igazi*
tanulsága az volt, hogy **Vándor a túra alatt is a kezemben volt** — emelkedő,
piknik, áttervezés, pár nyomással. A két adósság (lokáció-pont, rövid szakaszok)
nem elméleti: a terepen bukkantak fel, ahol számítanak.

*Szuper túra volt, Vándor. Köszönöm. — a krónikás* 🧭

---

Kapcsolódó: a [debütál](FIELD-NOTES-VANDOR-DEBUT.md) novelty-tézise · a
[családi túra](FIELD-NOTES-CSALADI-TURA.md) kényszer-profilja ·
[TURISTA-LENSES.md](TURISTA-LENSES.md) (🩸 faj-turista, 🧺 piknik) ·
[BACKLOG.md](BACKLOG.md) (az itt feljegyzett gyümölcsök).
