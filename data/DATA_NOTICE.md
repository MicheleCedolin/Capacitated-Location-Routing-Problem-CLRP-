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
- The instance page of C. Prodhon (http://prodhonc.free.fr/Instances/instances_us.htm, read in a browser on 20 Nov 2026) offers the
  three sets as archives (Prins et al., Tuzun and Burke, Barreto) with result tables and references. It states no licence and no
  conditions of use. Its `Format.txt` says that integer costs are "multiplied by 100" and truncated; see the next item.
- Distance rule of the P instances: **x100 and rounded up.** Stated in the full text of Prins, Prodhon, Ruiz, Soriano and
  Wolfler Calvo (2007), Transportation Science 41(4), whose authors created the set, and repeated in Yu et al. (2010),
  Computers & Industrial Engineering 58(2). Both papers also state that the B and T distances are not rounded. HGAMP certified
  values reproduce under round-up in our runs. The preprint arXiv:2412.05665 says “rounded to the nearest integer”, and the
  `Format.txt` file on the instance page says truncated. Check on coord20-5-1 (20 Nov 2026): the optimal value in the creators' own
  table is 54793 (routing part 29244 including 5 vehicles); the same solution costs 54793 with rounding up, 54769 with truncation
  and 54777 with rounding to nearest. Only rounding up reproduces the published optimum. The site rounds up.

## Terms

The instance files and the best known values are shared with attribution to their sources, for non-commercial academic purposes.
