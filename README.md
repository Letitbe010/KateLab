# KateLab

**EU** · Kate zinematikoen ariketak entrenatzeko aplikazioa (Euskadiko OPE, 1508: *Fabrikazio Mekanikoaren Antolamendua eta Proiektuak*). Aplikazioak eskema zinematikoa ematen du; erabiltzaileak kalkuluak egiten ditu; aplikazioak modu deterministan zuzentzen ditu (AArik gabe).

**ES** · Aplicación para entrenar ejercicios de cadenas cinemáticas (OPE de Euskadi, 1508: *Organización y Proyectos de Fabricación Mecánica*). La aplicación muestra el esquema cinemático; el usuario calcula; la aplicación corrige de forma determinista (sin IA).

## Egoera / Estado

| Fasea | Edukia | Egoera |
|---|---|---|
| 0 | Vite + TS + React, CI, GitHub Pages | Lokalean prest; GitHub biltegia eta Pages oraindik ez |
| 1 | `rational.ts`, `model.ts`, `validate.ts` | Testak berde |
| 2 | A eta B ebazleak, `checks.ts`, Python orakulua | KG1–KG10 eta property testak berde |
| 3 | Eskema zinematikoa (SVG) + layout automatikoa eta eskuzkoa | Erabiltzaileak onartua (2026-11-19) |
| 4 | Zuzentzailea (soluzio anitzekoak barne) + diagnostikoa + ebazpen-datuak | Testak berde |
| 5 | Sorgailua (10 arketipo) + pool-a (Euskadi 2020 + sortutakoak) | 10 000 ariketa egiaztatuta; pool-a orakuluarekin |
| 6 | UI: Praktika (erantzun-formularioa, zuzenketa, ebazpena), eu/es | KG1 eta KG3 mugikorrean (390 px) bi hizkuntzetan: e2e berde |
| 7 | Ariketa ebatziak (11), urratsez urrats, zer/zergatik/kontuz | Zenbaki-testak berde (zenbaki guztiak ebazletik) |

## Komandoak / Comandos

```bash
npm install
npm run dev          # garapen-zerbitzaria
npm test             # test guztiak (golden, property, zuzentzailea)
npm run lint
npm run typecheck
npm run build
```

Python orakulua (aukerakoa lokalean, derrigorrezkoa CIan):

```bash
python -m venv tools/oracle/.venv
tools/oracle/.venv/Scripts/python -m pip install -r tools/oracle/requirements.txt
tools/oracle/.venv/Scripts/python tools/oracle/kinematics.py tools/oracle/out/oracle.json tests/golden/golden.json tests/fixtures/euskadi2020.json tests/oracle/random-chains.json
npm run oracle
```

## Zuzentasun-bermeak / Garantías de corrección

- Aritmetika zehatza (BigInt arrazionalak), π sinbolikoki.
- Bi ebazle independente (A: bide-biderketa; B: ekuazio-sistema lineala, Gauss–Jordan) eta hirugarren bat Python-en (sympy). Bat ez badatoz, ariketa ez da erakusten.
- Golden kasuak (`tests/golden/golden.json`) eskuz egiaztatuak dira eta ez dira inoiz aldatzen inplementaziora egokitzeko.

## Lizentzia / Licencia

Kodea: MIT. Edukia (teoria, ariketak, irudiak): CC BY-SA 4.0. Ikus `LICENSE`.

URL: https://letitbe010.github.io/KateLab/
