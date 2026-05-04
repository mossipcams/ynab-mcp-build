const BLS_CONSUMER_EXPENDITURES_2023_SOURCE =
  "https://www.bls.gov/opub/reports/consumer-expenditures/2023/";
const NIST_NORRIS_CERTIFIED_VALUES_SOURCE =
  "https://www.itl.nist.gov/div898/strd/lls/data/LINKS/v-Norris.shtml";
const NIST_NORRIS_DATA_SOURCE =
  "https://www.itl.nist.gov/div898/strd/lls/data/LINKS/DATA/Norris.dat";
const NIST_LOTTERY_CERTIFIED_VALUES_SOURCE =
  "https://www.itl.nist.gov/div898/strd/univ/certvalues/lottery.html";
const NIST_LOTTERY_DATA_SOURCE =
  "https://www.itl.nist.gov/div898/strd/univ/data/Lottery.dat";
const YNAB_API_MILLIUNITS_SOURCE = "https://api.ynab.com/";

export const ynabMilliunitExamples = [
  { currency: "USD", milliunits: 123_930, amount: "123.93" },
  { currency: "USD", milliunits: -220, amount: "-0.22" },
  { currency: "Euro", milliunits: 4_924_340, amount: "4924.34" },
  { currency: "Euro", milliunits: -2_990, amount: "-2.99" },
  { currency: "Jordanian dinar", milliunits: -395_032, amount: "-395.03" },
] as const;

export const nistNorrisRegressionExample = {
  certifiedCorrelation: 0.999_996_872_936_966_7,
  certifiedSlope: 1.002_116_818_020_45,
  dataSource: NIST_NORRIS_DATA_SOURCE,
  verifiedResultSource: NIST_NORRIS_CERTIFIED_VALUES_SOURCE,
  x: [
    0.2, 337.4, 118.2, 884.6, 10.1, 226.5, 666.3, 996.3, 448.6, 777, 558.2, 0.4,
    0.6, 775.5, 666.9, 338, 447.5, 11.6, 556, 228.1, 995.8, 887.6, 120.2, 0.3,
    0.3, 556.8, 339.1, 887.2, 999, 779, 11.1, 118.3, 229.2, 669.1, 448.9, 0.5,
  ],
  y: [
    0.1, 338.8, 118.1, 888, 9.2, 228.1, 668.5, 998.5, 449.1, 778.9, 559.2, 0.3,
    0.1, 778.1, 668.8, 339.3, 448.9, 10.8, 557.7, 228.3, 998, 888.8, 119.6, 0.3,
    0.6, 557.6, 339.3, 888, 998.5, 778.9, 10.2, 117.6, 228.9, 668.4, 449.2, 0.2,
  ],
} as const;

export const nistLotteryUnivariateExample = {
  certifiedLagOneAutocorrelation: -0.120_948_622_967_393,
  certifiedSampleMean: 518.958_715_596_33,
  certifiedSampleStandardDeviation: 291.699_727_470_969,
  dataSource: NIST_LOTTERY_DATA_SOURCE,
  verifiedResultSource: NIST_LOTTERY_CERTIFIED_VALUES_SOURCE,
  values: [
    162, 671, 933, 414, 788, 730, 817, 33, 536, 875, 670, 236, 473, 167, 877,
    980, 316, 950, 456, 92, 517, 557, 956, 954, 104, 178, 794, 278, 147, 773,
    437, 435, 502, 610, 582, 780, 689, 562, 964, 791, 28, 97, 848, 281, 858,
    538, 660, 972, 671, 613, 867, 448, 738, 966, 139, 636, 847, 659, 754, 243,
    122, 455, 195, 968, 793, 59, 730, 361, 574, 522, 97, 762, 431, 158, 429,
    414, 22, 629, 788, 999, 187, 215, 810, 782, 47, 34, 108, 986, 25, 644, 829,
    630, 315, 567, 919, 331, 207, 412, 242, 607, 668, 944, 749, 168, 864, 442,
    533, 805, 372, 63, 458, 777, 416, 340, 436, 140, 919, 350, 510, 572, 905,
    900, 85, 389, 473, 758, 444, 169, 625, 692, 140, 897, 672, 288, 312, 860,
    724, 226, 884, 508, 976, 741, 476, 417, 831, 15, 318, 432, 241, 114, 799,
    955, 833, 358, 935, 146, 630, 830, 440, 642, 356, 373, 271, 715, 367, 393,
    190, 669, 8, 861, 108, 795, 269, 590, 326, 866, 64, 523, 862, 840, 219, 382,
    998, 4, 628, 305, 747, 247, 34, 747, 729, 645, 856, 974, 24, 568, 24, 694,
    608, 480, 410, 729, 947, 293, 53, 930, 223, 203, 677, 227, 62, 455, 387,
    318, 562, 242, 428, 968,
  ],
} as const;

export const blsAnnualIncomeAndExpenditureSeries = [
  {
    year: 2020,
    month: "2020-01-01",
    incomeMilliunits: 84_352_000,
    expenditureMilliunits: 61_332_000,
  },
  {
    year: 2021,
    month: "2021-01-01",
    incomeMilliunits: 87_432_000,
    expenditureMilliunits: 66_928_000,
  },
  {
    year: 2022,
    month: "2022-01-01",
    incomeMilliunits: 94_003_000,
    expenditureMilliunits: 72_967_000,
  },
  {
    year: 2023,
    month: "2023-01-01",
    incomeMilliunits: 101_805_000,
    expenditureMilliunits: 77_280_000,
  },
] as const;

export const blsMajorCategorySpending2023 = [
  { id: "food", name: "Food", amountMilliunits: 9_985_000 },
  { id: "housing", name: "Housing", amountMilliunits: 25_436_000 },
  {
    id: "transportation",
    name: "Transportation",
    amountMilliunits: 13_174_000,
  },
] as const;

export const blsMajorCategorySpendingSeries = [
  {
    sourceYear: 2020,
    month: "2022-10-01",
    id: "food",
    name: "Food",
    amountMilliunits: 7_310_000,
    totalExpenditureMilliunits: 61_332_000,
  },
  {
    sourceYear: 2021,
    month: "2022-11-01",
    id: "food",
    name: "Food",
    amountMilliunits: 8_289_000,
    totalExpenditureMilliunits: 66_928_000,
  },
  {
    sourceYear: 2022,
    month: "2022-12-01",
    id: "food",
    name: "Food",
    amountMilliunits: 9_343_000,
    totalExpenditureMilliunits: 72_967_000,
  },
  {
    sourceYear: 2023,
    month: "2023-01-01",
    id: "food",
    name: "Food",
    amountMilliunits: 9_985_000,
    totalExpenditureMilliunits: 77_280_000,
  },
] as const;

export const externalCalculationSources = {
  blsConsumerExpenditures2023: BLS_CONSUMER_EXPENDITURES_2023_SOURCE,
  nistLotteryCertifiedValues: NIST_LOTTERY_CERTIFIED_VALUES_SOURCE,
  nistLotteryData: NIST_LOTTERY_DATA_SOURCE,
  nistNorrisCertifiedValues: NIST_NORRIS_CERTIFIED_VALUES_SOURCE,
  nistNorrisData: NIST_NORRIS_DATA_SOURCE,
  ynabApiMilliunits: YNAB_API_MILLIUNITS_SOURCE,
} as const;
