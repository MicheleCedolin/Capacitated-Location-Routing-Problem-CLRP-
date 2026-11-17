# Data notice

The licence of the program code does **not** cover the files in `data/instances/`, `data/instances.json`
(coordinates, demands, costs) or the best known values it lists. They come from the sources below.

| Item | Origin |
|---|---|
| P instances | Prins, Prodhon and Wolfler Calvo (2006), 4OR 4(3):221–238, doi:10.1007/s10288-006-0001-9 |
| B instances | Barreto, Ferreira, Paixão and Santos (2007) |
| T instances | Tüzün and Burke (1999) |
| Best known values | published tables: He, Hao and Wu (INFORMS Journal on Computing 38(3), 2026), Schneider and Drexl (2017), Löffler, Bartolini and Schneider (2023), Baldacci, Mingozzi and Wolfler Calvo (2011) |

Full references with DOIs are on the Learn page.

## What was checked (17 Nov 2026)

- The HGAMP code and data archive (https://github.com/INFORMSJoC/2023.0416, doi:10.1287/ijoc.2023.0416.cd) is released under
  the **MIT License**, copyright 2025 Pengfei He, Jin-Kao Hao and Qinghua Wu (LICENSE file read). Its README says it contains the
  benchmark instances and the best solutions. An MIT licence on that archive does not by itself show that the original authors
  of the P, B and T sets allowed redistribution.
- The page of the P instances (prodhonc.free.fr) could not be read from this workspace (blocked for automatic access),
  so its usage terms are unknown.
- Distance rule of the P instances: **x100 and rounded up.** Stated in the full text of Prins, Prodhon, Ruiz, Soriano and
  Wolfler Calvo (2007), Transportation Science 41(4), whose authors created the set, and repeated in Yu et al. (2010),
  Computers & Industrial Engineering 58(2). Both papers also state that the B and T distances are not rounded. HGAMP certified
  values reproduce under round-up in our runs. The preprint arXiv:2412.05665 says “rounded to the nearest integer”; an earlier
  note of ours said “rounded down”; neither is supported by the creators' paper. The site rounds up.

## Still open (repository owner)

- [ ] Written permission (or licence terms) for redistributing the P, B and T instance files and the best known values is
  confirmed and filed with the release records. The author's statement of permission is recorded in internal notes;
  the written terms are not filed yet.
- [x] Distance rule of the P instances recorded (see above).
