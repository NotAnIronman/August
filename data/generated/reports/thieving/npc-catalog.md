# Thieving NPC catalog audit

Owner: vanilla Thieving. Review artifact; never a runtime input.

## Provenance

- owner: vanilla-thieving-npc-catalog
- consumer: NPC catalog review; not runtime input
- generator: tools/diagnostics/audit-pickpocket-npcs.ts
- generatorSha256: c5e03089fbd9a3c92c63ff4348c270f665fb95b2673f322564679951aad3ffd4
- command: node tools/node_modules/tsx/dist/cli.mjs --tsconfig tools/tsconfig.json tools/diagnostics/audit-pickpocket-npcs.ts --cache-root=apps/server/var/cache/osrs --cache-name=osrs-237_2026-03-25 --require-morphs --as-of=2026-09-04T17:37:00Z --markdown
- generatedAt: 2026-09-04T17:37:00Z
- input: raw-cache
- inputSha256: c33d2479b3fdcaf0cf3dc89e88988ea432fc4f71123a1f10bf30ea0027052055
- definitionsSha256: 7b733119186d96ecdfc8c136720e4a261cc956e1bce789535dfd99af78d7dd40
- revision: 237
- cacheName: osrs-237_2026-03-25
- retention: Regenerate when NPC cache or definitions change; replace previous audit after review.
- license: Project cache-derived IDs/actions; linked OSRS Wiki evidence is CC BY-NC-SA 3.0, no article text copied.

## Coverage

- npcRecords: 15612
- directPickpocketIds: 475
- definitionGroups: 66
- assignedIds: 475
- enabledIds: 427
- disabledIds: 48
- missingIds: 0
- directEnabledIds: 427
- directDisabledIds: 48
- eligibleIds: 531
- unclassifiedMorphParents: 0
- dynamicallyResolvedParents: 57
- classifiedIds: 531
- morphCoverage: complete
- morphParents: 57

Missing literal IDs: none
Unclassified morph parents: none
Invalid IDs: none
Duplicate assignments: none
Unsafe parent assignments: none
Unresolved morph edges: 0

The original catalog registered 231 IDs. The named snapshot exposed 474 actions; raw r237 has 475, including unnamed Fenkenstrain parent 1955. The 57 morph parents overlap literal IDs once, so the union is 531. Counts are catalog coverage, not a claim that every quest, special reward or presentation behavior is implemented.

## Corrected existing data

- Both H.A.M. forms: level 15, 22.2 XP. Gnome 133.3 XP, Paladin 131.8 XP, Hero 163.3 XP / 3 damage; Rogue 36.5 XP, desert bandit 79.4 XP, TzHaar-Hur 103.4 XP.
- Watchman always awards 60 coins AND bread; Paladin always awards 80 coins AND two chaos runes. Guaranteed loot is separate from weighted selection.
- Pouch IDs were shifted after Farmer: HAM 22523, Warrior 22524, Rogue 22525, Cave goblin 22526, Guard 22527, Fremennik 22528, bearded bandit 22529, desert bandit 22530, Knight 22531, nonbearded bandit 22532, Watchman 22533, Menaphite 22534, Paladin 22535, Gnome 22536, Hero 22537, Elf 22538, Vyre 24703, Wealthy citizen 28822, Pirate 32895. TzHaar has no pouch. Source: [Coin pouch](https://oldschool.runescape.wiki/w/Coin_pouch) and generated server item examine strings.
- Rogue: remove gold bar, 25-40 coins and exact 144-slot weights. Gnome: restore arrow shafts / 128-slot weights. Cave goblin: restore wire 10981 and swamp tar, 10-50 coins / 20-slot table. Desert bandit: Antipoison(1) 179 and 5:1:1 weights. TzHaar: 3-7 Tokkul / 195-slot weights.
- Cave goblin food identity corrected against server item definitions: green gloop soup 10960, frogspawn gumbo 10961, frogburger 10962, coated frogs' legs 10963, bat shish 10964, fingers 10965. Old food IDs accidentally included grubs la mode, mushrooms and loach.
- Master Farmer: 45 seeds including snape grass, seaweed and potato cactus; hop quantities corrected. Rounded Farming-85 frequencies remain explicitly provisional, not a replacement for Farming-level scaling.

## NPC families and all explicit IDs

Chance columns are Wiki endpoints at levels 1 and 99. Runtime uses round-half-up combined interpolation plus one, divided by 256; bonus endpoint truncation precedes interpolation. Missing curves retain a provisional runtime fallback. Stun ticks are action timing, not automatically identical to rounded Wiki seconds.

| Family | Exact IDs | Level / XP | Failure damage / ticks | Curve | Pouch | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [Guard](https://oldschool.runescape.wiki/w/Guard) | 397, 398, 399, 400, 1546, 1547, 1548, 1549, 1550, 3010, 3011, 3254, 3269, 3270, 3271, 3272, 3273, 3274, 3283, 4522, 4523, 4524, 4525, 4526, 5418, 11092, 11094, 11096, 11098, 11100, 11102, 11104, 11106, 11911, 11912, 11913, 11914, 11915, 11916, 11917, 11922, 11923, 11924, 11937, 11938, 11939, 11942, 11943, 11944, 11945, 11946, 11947, 13100, 13101, 13102, 13103, 13104, 13105, 13106, 13107, 13108, 13109, 13986, 13987, 13988, 13989, 13990, 13991, 13992, 13993, 13994, 13995, 14663, 14664, 14665, 14666, 14667, 14668, 14669, 14670, 14716, 14717, 14718, 14719, 14720, 14721, 14722, 14723, 14887, 14888, 14889, 14890 | 40 / 46.8 | 2-2 / 8 | 50, 240 | 22527 | enabled |
| [Rogue](https://oldschool.runescape.wiki/w/Rogue) | 526 | 32 / 36.5 | 2-2 / 8 | 75, 240 | 22525 | enabled |
| [Bandit (Bandit Camp)](https://oldschool.runescape.wiki/w/Bandit_(Bandit_Camp)) | 690, 695 | 53 / 79.4 | 3-3 / 8 | 50, 240 | 22530 | enabled |
| [Bandit (Pollnivneach)](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)) | 734, 735 | 55 / 84.3 | 5-5 / 8 | provisional | 22532 | enabled |
| [Bandit (Pollnivneach)](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)) | 736, 737 | 45 / 65 | 5-5 / 8 | provisional | 22529 | enabled |
| [Dr Fenkenstrain](https://oldschool.runescape.wiki/w/Dr_Fenkenstrain) | 1269 | 25 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Cave goblin (Dorgesh-Kaan)](https://oldschool.runescape.wiki/w/Cave_goblin_(Dorgesh-Kaan)) | 2268, 2269, 2270, 2271, 2272, 2273, 2274, 2275, 2276, 2277, 2278, 2279, 2280, 2281, 2282, 2283, 2284, 2285 | 36 / 40 | 1-1 / 8 | provisional | 22526 | enabled |
| [Movario](https://oldschool.runescape.wiki/w/Movario) | 2341 | 42 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [H.A.M. Member](https://oldschool.runescape.wiki/w/H.A.M._Member) | 2540 | 15 / 22.2 | 1-3 / 6 | 135, 239 | 22523 | enabled |
| [H.A.M. Member](https://oldschool.runescape.wiki/w/H.A.M._Member) | 2541 | 15 / 22.2 | 1-3 / 6 | 135, 239 | 22523 | enabled |
| [Man](https://oldschool.runescape.wiki/w/Man) | 3014, 3015, 3106, 3107, 3108, 3109, 3110, 3111, 3112, 3113, 3261, 3264, 3265, 3268, 3298, 3299, 3652, 6815, 6818, 6987, 6988, 6989, 6990, 6991, 6992, 10728, 11053, 11054, 11057, 11058, 14920, 14921 | 1 / 8 | 1-1 / 8 | 180, 240 | 22521 | enabled |
| [Farmer](https://oldschool.runescape.wiki/w/Farmer) | 3114, 3243, 3244, 11918, 11919, 11920, 11921, 13228, 13229, 13230, 13231, 13232, 13233, 13234, 13235, 14751, 14752, 14753, 14754, 14773 | 10 / 14.5 | 1-1 / 8 | 150, 240 | 22522 | enabled |
| [Warrior (Thieving)](https://oldschool.runescape.wiki/w/Warrior_(Thieving)) | 3260, 3292, 11925, 11926, 11927, 11928, 11929 | 25 / 26 | 2-2 / 8 | 100, 240 | 22524 | enabled |
| [Drunken man](https://oldschool.runescape.wiki/w/Drunken_man) | 3263 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Cuffs](https://oldschool.runescape.wiki/w/Cuffs) | 3279 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Narf](https://oldschool.runescape.wiki/w/Narf) | 3280 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Rusty](https://oldschool.runescape.wiki/w/Rusty) | 3281 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Jeff](https://oldschool.runescape.wiki/w/Jeff) | 3282 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Hengel](https://oldschool.runescape.wiki/w/Hengel) | 3284 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Anja](https://oldschool.runescape.wiki/w/Anja) | 3285 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Paladin](https://oldschool.runescape.wiki/w/Paladin) | 3293, 3294, 8853, 11901, 11930, 11931, 11932, 11933 | 70 / 131.8 | 3-3 / 8 | 40, 170 | 22535 | enabled |
| [Hero](https://oldschool.runescape.wiki/w/Hero) | 3295, 11934, 11935 | 80 / 163.3 | 3-3 / 10 | 39, 160 | 22537 | enabled |
| [Knight of Ardougne](https://oldschool.runescape.wiki/w/Knight_of_Ardougne) | 3297, 3300, 8854, 11902, 11936 | 55 / 84.3 | 3-3 / 8 | 50, 240 | 22531 | enabled |
| [Menaphite Thug](https://oldschool.runescape.wiki/w/Menaphite_Thug) | 3550 | 65 / 137.5 | 5-5 / 8 | 50, 160 | 22534 | enabled |
| [Villager (The Feud)](https://oldschool.runescape.wiki/w/Villager) | 3552, 3553, 3554, 3555, 3556, 3557, 3558, 3559, 3560 | 30 / 8 | 0-0 / 0 | provisional | direct | disabled |
| ['Black-eye'](https://oldschool.runescape.wiki/w/'Black-eye') | 3596 | 1 / 8 | 0-0 / 0 | provisional | direct | disabled |
| ['No fingers'](https://oldschool.runescape.wiki/w/'No_fingers') | 3597 | 1 / 8 | 0-0 / 0 | provisional | direct | disabled |
| ['Gummy'](https://oldschool.runescape.wiki/w/'Gummy') | 3598 | 1 / 8 | 0-0 / 0 | provisional | direct | disabled |
| ['The Guns'](https://oldschool.runescape.wiki/w/'The_Guns') | 3599 | 1 / 8 | 0-0 / 0 | provisional | direct | disabled |
| [Zealot](https://oldschool.runescape.wiki/w/Zealot) | 3611 | 1 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Student](https://oldschool.runescape.wiki/w/Student) | 3634 | 1 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Fremennik](https://oldschool.runescape.wiki/w/Fremennik_citizen) | 3937, 3938, 3939, 3940, 3941, 3943, 3944, 3945, 3946 | 45 / 65 | 2-2 / 8 | provisional | 22528 | enabled |
| [Twig](https://oldschool.runescape.wiki/w/Twig) | 4133 | 30 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Berry](https://oldschool.runescape.wiki/w/Berry) | 4134 | 30 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Gnome](https://oldschool.runescape.wiki/w/Gnome) | 5130, 6077, 6078, 6079, 6086, 6087, 6094, 6095, 6096 | 75 / 133.3 | 1-1 / 8 | 43, 175 | 22536 | enabled |
| [Curator Haig Halen](https://oldschool.runescape.wiki/w/Curator_Haig_Halen) | 5214 | 25 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Elf (Lletya)](https://oldschool.runescape.wiki/w/Elf_(Thieving)) | 5297, 5299, 5300 | 85 / 353.3 | 5-5 / 10 | 6, 100 | 22538 | enabled |
| [Sigmund](https://oldschool.runescape.wiki/w/Sigmund) | 5322 | 13 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Sandy](https://oldschool.runescape.wiki/w/Sandy) | 5384 | 17 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Watchman](https://oldschool.runescape.wiki/w/Watchman) | 5420 | 65 / 137.5 | 3-3 / 8 | 15, 160 | 22533 | enabled |
| [Master Farmer](https://oldschool.runescape.wiki/w/Master_Farmer) | 5730, 5731, 5832, 11940, 11941, 13236, 13237, 13238, 13239, 13240, 13241, 13242, 13243, 14755, 14756, 14757, 14758 | 38 / 43 | 3-3 / 8 | 90, 240 | direct | enabled |
| [TzHaar-Hur](https://oldschool.runescape.wiki/w/TzHaar-Hur) | 7682, 7683, 7684, 7685, 7686, 7687 | 90 / 103.4 | 4-4 / 10 | -200, 200 | direct | enabled |
| [Elf (Prifddinas)](https://oldschool.runescape.wiki/w/Elf_(Thieving)) | 9015, 9054, 9055, 9056, 9057, 9058, 9059, 9060, 9061, 9062, 9063, 9064, 9065, 9066, 9067, 9068, 9069, 9070, 9071, 9072, 9073, 9074, 9075, 9076, 9077, 9078, 9079, 9080, 9081, 9082, 9083, 9084, 9085, 9086, 9087, 9088, 9089, 9090, 9106, 9107, 9108, 9109, 9110, 9111, 9112, 9113, 9114, 9115, 9116, 9117 | 85 / 353.3 | 5-5 / 10 | 6, 100 | 22538 | enabled |
| [Vyre](https://oldschool.runescape.wiki/w/Vyre) | 9685, 9686, 9687, 9688, 9689, 9690, 9691, 9692, 9693, 9694, 9695, 9696, 9697, 9698, 9699, 9700, 9701, 9702, 9703, 9704, 9705, 9706, 9707, 9708, 9709, 9710, 9711, 9712, 9713, 9714 | 82 / 306.9 | 5-5 / 10 | 8, 128 | 24703 | enabled |
| [Head Guard](https://oldschool.runescape.wiki/w/Head_Guard) | 11093, 11095, 11097, 11099, 11101, 11103, 11105, 11107 | 1 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Istoria](https://oldschool.runescape.wiki/w/Istoria) | 11113 | 52 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Priest](https://oldschool.runescape.wiki/w/Priest) | 11303, 11305, 11307, 11309, 11311, 11313 | 1 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Citizen (Twilight's Promise)](https://oldschool.runescape.wiki/w/Citizen_(Twilight's_Promise)) | 12929 | 1 / 8 | 0-0 / 0 | provisional | direct | disabled |
| [Knight of Varlamore](https://oldschool.runescape.wiki/w/Knight_of_Varlamore) | 13114, 13115, 13116, 13117, 13118, 13119 | 55 / 84.3 | 3-3 / 8 | provisional | 22531 | enabled |
| [Citizen (Civitas illa Fortis)](https://oldschool.runescape.wiki/w/Citizen_(Civitas_illa_Fortis)) | 13164, 13165, 13166, 13167, 13168, 13169, 13170, 13171, 13172, 13173, 13178, 13179, 13180, 13181, 13182, 13183, 13184, 13185, 13186, 13187, 13192, 13193, 13194, 13195, 13196, 13197, 13198, 13199, 13200, 13201 | 1 / 8 | 1-1 / 8 | 180, 240 | 22521 | enabled |
| [Tourist](https://oldschool.runescape.wiki/w/Tourist) | 13206, 13207, 13208, 13209, 13210, 13211 | 1 / 8 | 1-1 / 8 | 180, 240 | 22521 | enabled |
| [Wealthy citizen](https://oldschool.runescape.wiki/w/Wealthy_citizen) | 13302, 13303, 13304, 13305 | 50 / 96 | 3-3 / 6 | 35, 200 | 28822 | enabled |
| [Emissary Ascended](https://oldschool.runescape.wiki/w/Emissary_Ascended) | 13767, 13768, 13769 | 1 / 0 | 0-0 / 0 | provisional | direct | disabled |
| [Patzi](https://oldschool.runescape.wiki/w/Patzi) | 13819 | 34 / 10 | 0-0 / 0 | provisional | direct | disabled |
| [Adala](https://oldschool.runescape.wiki/w/Adala) | 13823 | 34 / 10 | 0-0 / 0 | provisional | direct | disabled |
| [Constantinius](https://oldschool.runescape.wiki/w/Constantinius) | 13826 | 34 / 10 | 0-0 / 0 | provisional | direct | disabled |
| [Cozyac](https://oldschool.runescape.wiki/w/Cozyac) | 13828 | 34 / 10 | 0-0 / 0 | provisional | direct | disabled |
| [Xocotla](https://oldschool.runescape.wiki/w/Xocotla) | 13830 | 34 / 10 | 0-0 / 0 | provisional | direct | disabled |
| [Pavo](https://oldschool.runescape.wiki/w/Pavo) | 13832 | 34 / 10 | 0-0 / 0 | provisional | direct | disabled |
| [Citizen (Aldarin)](https://oldschool.runescape.wiki/w/Citizen_(Aldarin)) | 13883, 13884, 13885, 13886, 13887, 13888, 13889, 13890, 13891, 13892, 13893, 13894, 13895, 13896, 13897, 13898, 13899, 13900, 13901 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Salvager](https://oldschool.runescape.wiki/w/Salvager) | 13971, 13972, 13973, 13975, 13976, 13977 | 1 / 8 | 1-1 / 8 | 180, 240 | 22521 | enabled |
| [Citizen (Auburnvale)](https://oldschool.runescape.wiki/w/Citizen_(Auburnvale)) | 14646, 14647, 14648, 14649, 14650, 14651, 14652, 14653 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Citizen (Kastori)](https://oldschool.runescape.wiki/w/Citizen_(Kastori)) | 14741, 14742, 14743, 14744, 14745, 14746, 14747, 14748 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Citizen (Tal Teklan)](https://oldschool.runescape.wiki/w/Citizen_(Tal_Teklan)) | 14763, 14764, 14765, 14766, 14767, 14768, 14769, 14770 | 1 / 8 | 1-1 / 8 | provisional | 22521 | enabled |
| [Pirate](https://oldschool.runescape.wiki/w/Pirate_(Thieving)) | 14933, 14934, 14935, 14936, 14937 | 60 / 72 | 3-3 / 8 | provisional | 32895 | enabled |

## Loot, gating, and failure evidence by family

Loot notation: item ID × amount @ relative weight. Weighted entries select ONE reward; guaranteed entries all apply. Weights are not independent probabilities. Evidence labels distinguish verified ordinary tables from provisional/missing special rolls.

### Guard (397)

Weighted: 995 × 30 @ 256.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Guard).
Chance: [verified](https://oldschool.runescape.wiki/w/Guard); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Guard).
Failure: [provisional](https://oldschool.runescape.wiki/w/Guard); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Rogue (526)

Weighted: 995 × 25-40 @ 123; 556 × 8 @ 9; 1523 × 1 @ 5; 1993 × 1 @ 6; 1219 × 1 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Rogue).
Chance: [verified](https://oldschool.runescape.wiki/w/Rogue); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Rogue).
Failure: [provisional](https://oldschool.runescape.wiki/w/Rogue); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Bandit (Bandit Camp) (690)

Weighted: 995 × 30 @ 5; 179 × 1 @ 1; 1523 × 1 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Bandit_(Bandit_Camp)).
Chance: [verified](https://oldschool.runescape.wiki/w/Bandit_(Bandit_Camp)); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Bandit_(Bandit_Camp)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Bandit_(Bandit_Camp)); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Bandit (Pollnivneach) (734)

Weighted: 995 × 50 @ 256.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)); Awake pickpocket only. Knockout uses direct coins and a different roll..
Chance: [provisional](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)); No verified ordinary success curve; generic fallback is tuning only..
Requirement: [verified](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Bandit (Pollnivneach) (736)

Weighted: 995 × 40 @ 256.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)); Awake pickpocket only. Knockout uses direct coins and a different roll..
Chance: [provisional](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)); No verified ordinary success curve; generic fallback is tuning only..
Requirement: [verified](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Bandit_(Pollnivneach)); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Dr Fenkenstrain (1269)

Weighted: none.
Guaranteed: none.
Disabled: Ring of Charos reclaim depends on quest state, ownership and activation.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Dr_Fenkenstrain); Ring of Charos reclaim depends on quest state, ownership and activation..
Chance: [provisional](https://oldschool.runescape.wiki/w/Dr_Fenkenstrain); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Dr_Fenkenstrain); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Dr_Fenkenstrain); Ring of Charos reclaim depends on quest state, ownership and activation..

### Cave goblin (Dorgesh-Kaan) (2268)

Weighted: 10964 × 1 @ 1; 10963 × 1 @ 1; 10965 × 1 @ 1; 10962 × 1 @ 1; 10961 × 1 @ 1; 10960 × 1 @ 1; 995 × 10-50 @ 7; 4550 × 1 @ 1; 10981 × 1 @ 1; 440 × 1-4 @ 1; 4539 × 1 @ 1; 1939 × 1 @ 1; 590 × 1 @ 1; 596 × 1 @ 1.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Cave_goblin_(Dorgesh-Kaan)); Base 20-slot table; elite Lumbridge diary wire doubling not yet represented..
Chance: [provisional](https://oldschool.runescape.wiki/w/Cave_goblin_(Dorgesh-Kaan)); No verified ordinary success curve; generic fallback is tuning only..
Requirement: [verified](https://oldschool.runescape.wiki/w/Cave_goblin_(Dorgesh-Kaan)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Guard_(Cave_goblin)); Guards 2316/2317 MAY attack. Probability and radius unverified, so no fabricated always-alert policy..

### Movario (2341)

Weighted: none.
Guaranteed: none.
Disabled: Temple of Ikov, While Guthix Sleeps availability, Agility 70 access and pendant ownership gates.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Movario); Temple of Ikov, While Guthix Sleeps availability, Agility 70 access and pendant ownership gates..
Chance: [provisional](https://oldschool.runescape.wiki/w/Movario); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Movario); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Movario); Temple of Ikov, While Guthix Sleeps availability, Agility 70 access and pendant ownership gates..

### H.A.M. Member (2540)

Weighted: 4310 × 1 @ 1; 4306 × 1 @ 1; 4308 × 1 @ 1; 4302 × 1 @ 1; 4312 × 1 @ 1; 4300 × 1 @ 1; 4298 × 1 @ 1; 882 × 1-13 @ 3; 1351 × 1 @ 3; 1205 × 1 @ 3; 1265 × 1 @ 3; 1349 × 1 @ 3; 1203 × 1 @ 3; 1267 × 1 @ 3; 1129 × 1 @ 3; 886 × 1-13 @ 2; 1353 × 1 @ 2; 1207 × 1 @ 2; 1269 × 1 @ 2; 688 × 1 @ 4; 995 × 1-21 @ 17; 314 × 1-7 @ 3; 946 × 1 @ 2; 1511 × 1 @ 3; 1733 × 1 @ 2; 321 × 1 @ 2; 2138 × 1 @ 2; 1734 × 1-10 @ 3; 590 × 1 @ 2; 1625 × 1 @ 2; 453 × 1 @ 2; 1739 × 1 @ 3; 4509 × 1 @ 4; 199 × 1 @ 1.0909091; 201 × 1 @ 0.54545455; 203 × 1 @ 0.36363636; 440 × 1 @ 2; 686 × 1 @ 4; 1627 × 1 @ 2.
Guaranteed: none.
Failure policy: {"kind":"relocate","chance":1,"threshold":3,"counterKey":"ham-concussion","avoidance":{"skillId":16,"lowChance":0,"highChance":254},"destinations":[{"x":3186,"y":3211,"level":0}],"resetArea":{"minX":3136,"maxX":3199,"minY":9600,"maxY":9663,"level":0},"message":"You're beaten unconscious and bundled out of the H.A.M. hideout."}.
Loot: [provisional](https://oldschool.runescape.wiki/w/H.A.M._Member); Conditional ordinary table. Separate 1/50 clue/nothing roll and Death to the Dorgeshuun clothing override need runtime support..
Chance: [verified](https://oldschool.runescape.wiki/w/H.A.M._Member); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/H.A.M._Member).
Failure: [provisional](https://oldschool.runescape.wiki/w/H.A.M._Member); Three concussions; Wiki Agility 0/254 chart. PROVISIONAL single documented outside destination 3186,3211; no jail split/clothing mitigation. Reset bounds are inferred from hideout map region, not verified OSRS code. Chance 1 is conditional on the third concussion, not every failure..

### H.A.M. Member (2541)

Weighted: 4310 × 1 @ 1; 4306 × 1 @ 1; 4308 × 1 @ 1; 4302 × 1 @ 1; 4312 × 1 @ 1; 4300 × 1 @ 1; 4298 × 1 @ 1; 882 × 1-13 @ 3; 1351 × 1 @ 3; 1205 × 1 @ 3; 1265 × 1 @ 3; 1349 × 1 @ 3; 1203 × 1 @ 3; 1267 × 1 @ 3; 1129 × 1 @ 3; 886 × 1-13 @ 2; 1353 × 1 @ 2; 1207 × 1 @ 2; 1269 × 1 @ 2; 688 × 1 @ 4; 995 × 1-21 @ 17; 314 × 1-7 @ 3; 946 × 1 @ 2; 1511 × 1 @ 3; 1733 × 1 @ 2; 321 × 1 @ 2; 2138 × 1 @ 2; 1734 × 1-10 @ 3; 590 × 1 @ 2; 1625 × 1 @ 2; 453 × 1 @ 2; 1739 × 1 @ 3; 4509 × 1 @ 4; 199 × 1 @ 1.0909091; 201 × 1 @ 0.54545455; 203 × 1 @ 0.36363636; 440 × 1 @ 2; 686 × 1 @ 4; 1627 × 1 @ 2.
Guaranteed: none.
Failure policy: {"kind":"relocate","chance":1,"threshold":3,"counterKey":"ham-concussion","avoidance":{"skillId":16,"lowChance":0,"highChance":254},"destinations":[{"x":3186,"y":3211,"level":0}],"resetArea":{"minX":3136,"maxX":3199,"minY":9600,"maxY":9663,"level":0},"message":"You're beaten unconscious and bundled out of the H.A.M. hideout."}.
Loot: [provisional](https://oldschool.runescape.wiki/w/H.A.M._Member); Conditional ordinary table. Separate 1/50 clue/nothing roll and Death to the Dorgeshuun clothing override need runtime support..
Chance: [verified](https://oldschool.runescape.wiki/w/H.A.M._Member); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/H.A.M._Member).
Failure: [provisional](https://oldschool.runescape.wiki/w/H.A.M._Member); Three concussions; Wiki Agility 0/254 chart. PROVISIONAL single documented outside destination 3186,3211; no jail split/clothing mitigation. Reset bounds are inferred from hideout map region, not verified OSRS code. Chance 1 is conditional on the third concussion, not every failure..

### Man (3014)

Weighted: 995 × 3 @ 256.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Man).
Chance: [verified](https://oldschool.runescape.wiki/w/Man); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Man).
Failure: [provisional](https://oldschool.runescape.wiki/w/Man); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Farmer (3114)

Weighted: 995 × 9 @ 123; 5318 × 1 @ 5.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Farmer).
Chance: [verified](https://oldschool.runescape.wiki/w/Farmer); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Farmer).
Failure: [provisional](https://oldschool.runescape.wiki/w/Farmer); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Warrior (Thieving) (3260)

Weighted: 995 × 18 @ 256.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Warrior_(Thieving)).
Chance: [verified](https://oldschool.runescape.wiki/w/Warrior_(Thieving)); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Warrior_(Thieving)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Warrior_(Thieving)); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Drunken man (3263)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Drunken_man).
Chance: [provisional](https://oldschool.runescape.wiki/w/Drunken_man); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Drunken_man).
Failure: [provisional](https://oldschool.runescape.wiki/w/Drunken_man); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Cuffs (3279)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Cuffs).
Chance: [provisional](https://oldschool.runescape.wiki/w/Cuffs); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Cuffs).
Failure: [provisional](https://oldschool.runescape.wiki/w/Cuffs); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Narf (3280)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Narf).
Chance: [provisional](https://oldschool.runescape.wiki/w/Narf); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Narf).
Failure: [provisional](https://oldschool.runescape.wiki/w/Narf); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Rusty (3281)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Rusty).
Chance: [provisional](https://oldschool.runescape.wiki/w/Rusty); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Rusty).
Failure: [provisional](https://oldschool.runescape.wiki/w/Rusty); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Jeff (3282)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Jeff).
Chance: [provisional](https://oldschool.runescape.wiki/w/Jeff); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Jeff).
Failure: [provisional](https://oldschool.runescape.wiki/w/Jeff); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Hengel (3284)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Hengel).
Chance: [provisional](https://oldschool.runescape.wiki/w/Hengel); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Hengel).
Failure: [provisional](https://oldschool.runescape.wiki/w/Hengel); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Anja (3285)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Anja).
Chance: [provisional](https://oldschool.runescape.wiki/w/Anja); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Anja).
Failure: [provisional](https://oldschool.runescape.wiki/w/Anja); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Paladin (3293)

Weighted: none.
Guaranteed: 995 × 80 @ 256; 562 × 2 @ 256.
Loot: [provisional](https://oldschool.runescape.wiki/w/Paladin); Both guaranteed rewards verified; independent hard clue (approximately 1/500) and Rocky rolls unsupported..
Chance: [verified](https://oldschool.runescape.wiki/w/Paladin); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Paladin).
Failure: [provisional](https://oldschool.runescape.wiki/w/Paladin); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Hero (3295)

Weighted: 995 × 200-300 @ 105; 560 × 2 @ 8; 565 × 1 @ 5; 444 × 1 @ 1; 1993 × 1 @ 6; 569 × 1 @ 2; 1601 × 1 @ 1.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Hero); 128-slot main table verified; independent elite clue was 1/1200 at r237, 1/900 since 2026-08-19; pet roll unsupported..
Chance: [verified](https://oldschool.runescape.wiki/w/Hero); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Hero).
Failure: [provisional](https://oldschool.runescape.wiki/w/Hero); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Knight of Ardougne (3297)

Weighted: 995 × 50 @ 256.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Knight_of_Ardougne).
Chance: [verified](https://oldschool.runescape.wiki/w/Knight_of_Ardougne); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Knight_of_Ardougne).
Failure: [provisional](https://oldschool.runescape.wiki/w/Knight_of_Ardougne); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Menaphite Thug (3550)

Weighted: 995 × 60 @ 256.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Menaphite_Thug); Awake pickpocket. Ordinary curve is 50/160; 78/240 is knockout, not ordinary pickpocket..
Chance: [verified](https://oldschool.runescape.wiki/w/Menaphite_Thug); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Menaphite_Thug).
Failure: [provisional](https://oldschool.runescape.wiki/w/Menaphite_Thug); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Villager (The Feud) (3552)

Weighted: none.
Guaranteed: none.
Disabled: Quest phases alternate ordinary theft, distraction and knockout; post-quest only blackjack, zero pickpocket XP.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Villager); Quest phases alternate ordinary theft, distraction and knockout; post-quest only blackjack, zero pickpocket XP..
Chance: [provisional](https://oldschool.runescape.wiki/w/Villager); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Villager); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Villager); Quest phases alternate ordinary theft, distraction and knockout; post-quest only blackjack, zero pickpocket XP..

### 'Black-eye' (3596)

Weighted: none.
Guaranteed: none.
Disabled: Tower of Life builder: sandwich/clothing behavior unresolved.
Loot: [unsupported](https://oldschool.runescape.wiki/w/'Black-eye'); Tower of Life builder: sandwich/clothing behavior unresolved..
Chance: [provisional](https://oldschool.runescape.wiki/w/'Black-eye'); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/'Black-eye'); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/'Black-eye'); Tower of Life builder: sandwich/clothing behavior unresolved..

### 'No fingers' (3597)

Weighted: none.
Guaranteed: none.
Disabled: Sandwich normally; eligible builder boots use flat 1/4 quest roll unaffected by boosts. Rogue outfit does not double.
Loot: [unsupported](https://oldschool.runescape.wiki/w/'No_fingers'); Sandwich normally; eligible builder boots use flat 1/4 quest roll unaffected by boosts. Rogue outfit does not double..
Chance: [provisional](https://oldschool.runescape.wiki/w/'No_fingers'); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/'No_fingers'); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/'No_fingers'); Sandwich normally; eligible builder boots use flat 1/4 quest roll unaffected by boosts. Rogue outfit does not double..

### 'Gummy' (3598)

Weighted: none.
Guaranteed: none.
Disabled: Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/'Gummy'); Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot..
Chance: [provisional](https://oldschool.runescape.wiki/w/'Gummy'); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/'Gummy'); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/'Gummy'); Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot..

### 'The Guns' (3599)

Weighted: none.
Guaranteed: none.
Disabled: Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/'The_Guns'); Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot..
Chance: [provisional](https://oldschool.runescape.wiki/w/'The_Guns'); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/'The_Guns'); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/'The_Guns'); Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot..

### Zealot (3611)

Weighted: none.
Guaranteed: none.
Disabled: Haunted Mine dialogue must reveal key before theft; quest ownership handling.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Zealot); Haunted Mine dialogue must reveal key before theft; quest ownership handling..
Chance: [provisional](https://oldschool.runescape.wiki/w/Zealot); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Zealot); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Zealot); Haunted Mine dialogue must reveal key before theft; quest ownership handling..

### Student (3634)

Weighted: none.
Guaranteed: none.
Disabled: Female student returns Teddy after The Dig Site; NOT Digsite workman.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Student); Female student returns Teddy after The Dig Site; NOT Digsite workman..
Chance: [provisional](https://oldschool.runescape.wiki/w/Student); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Student); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Student); Female student returns Teddy after The Dig Site; NOT Digsite workman..

### Fremennik (3937)

Weighted: 995 × 40 @ 256.
Guaranteed: none.
Required completed internal quest: fremennik_trials.
Loot: [verified](https://oldschool.runescape.wiki/w/Fremennik_citizen).
Chance: [provisional](https://oldschool.runescape.wiki/w/Fremennik_citizen); No verified ordinary success curve; generic fallback is tuning only..
Requirement: [verified](https://oldschool.runescape.wiki/w/Fremennik_citizen).
Failure: [provisional](https://oldschool.runescape.wiki/w/Fremennik_citizen); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Twig (4133)

Weighted: none.
Guaranteed: none.
Disabled: Troll Stronghold cell key 1, quest stage/ownership and waking combat morph.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Twig); Troll Stronghold cell key 1, quest stage/ownership and waking combat morph..
Chance: [provisional](https://oldschool.runescape.wiki/w/Twig); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Twig); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Twig); Troll Stronghold cell key 1, quest stage/ownership and waking combat morph..

### Berry (4134)

Weighted: none.
Guaranteed: none.
Disabled: Troll Stronghold cell key 2, quest stage/ownership and waking combat morph.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Berry); Troll Stronghold cell key 2, quest stage/ownership and waking combat morph..
Chance: [provisional](https://oldschool.runescape.wiki/w/Berry); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Berry); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Berry); Troll Stronghold cell key 2, quest stage/ownership and waking combat morph..

### Gnome (5130)

Weighted: 52 × 2-4 @ 56; 995 × 300 @ 30; 557 × 1 @ 5; 444 × 1 @ 8; 569 × 1 @ 2; 2150 × 1 @ 24; 2162 × 1 @ 3.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Gnome); 128-slot main table verified; independent medium clue (1/150) and Rocky rolls unsupported..
Chance: [verified](https://oldschool.runescape.wiki/w/Gnome); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Gnome).
Failure: [provisional](https://oldschool.runescape.wiki/w/Gnome); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Curator Haig Halen (5214)

Weighted: none.
Guaranteed: none.
Disabled: Distinct keys for The Golem and Ethically Acquired Antiquities require exact stages and ownership.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Curator_Haig_Halen); Distinct keys for The Golem and Ethically Acquired Antiquities require exact stages and ownership..
Chance: [provisional](https://oldschool.runescape.wiki/w/Curator_Haig_Halen); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Curator_Haig_Halen); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Curator_Haig_Halen); Distinct keys for The Golem and Ethically Acquired Antiquities require exact stages and ownership..

### Elf (Lletya) (5297)

Weighted: 995 × 280-350 @ 105; 560 × 2 @ 8; 561 × 3 @ 5; 1993 × 1 @ 6; 1601 × 1 @ 1; 569 × 1 @ 2; 444 × 1 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Elf_(Thieving)).
Chance: [verified](https://oldschool.runescape.wiki/w/Elf_(Thieving)); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [provisional](https://oldschool.runescape.wiki/w/Elf_(Thieving)); Level verified. Mourning's End Part I STARTED access belongs to area integration, not a completion gate here..
Failure: [provisional](https://oldschool.runescape.wiki/w/Elf_(Thieving)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Sigmund (5322)

Weighted: none.
Guaranteed: none.
Disabled: The Lost Tribe key, quest stage and ownership.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Sigmund); The Lost Tribe key, quest stage and ownership..
Chance: [provisional](https://oldschool.runescape.wiki/w/Sigmund); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Sigmund); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Sigmund); The Lost Tribe key, quest stage and ownership..

### Sandy (5384)

Weighted: none.
Guaranteed: none.
Disabled: The Hand in the Sand quest sample.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Sandy); The Hand in the Sand quest sample..
Chance: [provisional](https://oldschool.runescape.wiki/w/Sandy); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Sandy); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Sandy); The Hand in the Sand quest sample..

### Watchman (5420)

Weighted: none.
Guaranteed: 995 × 60 @ 256; 2309 × 1 @ 256.
Loot: [verified](https://oldschool.runescape.wiki/w/Watchman).
Chance: [verified](https://oldschool.runescape.wiki/w/Watchman); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Watchman).
Failure: [provisional](https://oldschool.runescape.wiki/w/Watchman); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### Master Farmer (5730)

Weighted: 5318 × 1-4 @ 0.17699115; 5319 × 1-3 @ 0.13280212; 5324 × 1-3 @ 0.069444444; 5322 × 1-2 @ 0.063694268; 5320 × 1-2 @ 0.022123894; 5323 × 1 @ 0.011061947; 5321 × 1 @ 0.0052910053; 22879 × 1 @ 0.0038461538; 5305 × 1-12 @ 0.055555556; 5307 × 1-9 @ 0.055555556; 5308 × 1-6 @ 0.041841004; 5306 × 1-9 @ 0.041493776; 5309 × 1-6 @ 0.027700831; 5310 × 1-6 @ 0.013850416; 5311 × 1-3 @ 0.0070422535; 5096 × 1 @ 0.04587156; 5098 × 1 @ 0.030395137; 5097 × 1 @ 0.019646365; 5099 × 1 @ 0.014513788; 5100 × 1 @ 0.011587486; 5101 × 1 @ 0.03875969; 5102 × 1 @ 0.027173913; 5103 × 1 @ 0.019417476; 5104 × 1 @ 0.007751938; 5105 × 1 @ 0.0028169014; 5106 × 1 @ 0.0010672359; 5282 × 1 @ 0.0020325203; 5281 × 1 @ 0.0012195122; 5280 × 1 @ 0.00081300813; 21490 × 1 @ 0.00052854123; 22873 × 1 @ 0.00040650407; 5291 × 1 @ 0.014880952; 5292 × 1 @ 0.010460251; 5293 × 1 @ 0.0071428571; 5294 × 1 @ 0.0048543689; 5295 × 1 @ 0.0037209302; 5296 × 1 @ 0.0022573363; 5297 × 1 @ 0.0015360983; 5298 × 1 @ 0.0010559662; 5299 × 1 @ 0.0007199424; 5300 × 1 @ 0.00053925798; 5301 × 1 @ 0.00033602151; 5302 × 1 @ 0.0002399808; 5303 × 1 @ 0.00014400922; 5304 × 1 @ 0.00010785183.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Master_Farmer); 45 seed types. Rounded Wiki level-85 Farming rates normalized as weights; Farming scaling and tertiary rolls unsupported..
Chance: [verified](https://oldschool.runescape.wiki/w/Master_Farmer); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Master_Farmer).
Failure: [provisional](https://oldschool.runescape.wiki/w/Master_Farmer); Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans..

### TzHaar-Hur (7682)

Weighted: 6529 × 3-7 @ 182; 1623 × 1 @ 5; 1621 × 1 @ 4; 1619 × 1 @ 3; 1617 × 1 @ 1.
Guaranteed: none.
Success damage: {"amount":4,"preventedByEquippedItemIds":[1580]}.
Loot: [verified](https://oldschool.runescape.wiki/w/TzHaar-Hur).
Chance: [verified](https://oldschool.runescape.wiki/w/TzHaar-Hur); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/TzHaar-Hur).
Failure: [provisional](https://oldschool.runescape.wiki/w/TzHaar-Hur); Without ice gloves every attempt deals 4 damage; with gloves only failure. Ten stun ticks. Inner-area cape access belongs to entrance integration. Failure animation and chat unverified; no guard-call evidence..

### Elf (Prifddinas) (9015)

Weighted: 995 × 280-350 @ 105; 560 × 2 @ 8; 561 × 3 @ 5; 1993 × 1 @ 6; 1601 × 1 @ 1; 569 × 1 @ 2; 444 × 1 @ 1.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Elf_(Thieving)); Before ordinary loot: crystal shard 23962 at 1/35 and enhanced crystal teleport seed 23959 at 1/1024. Rare pre-roll integration remains; do not flatten into equal weights..
Chance: [verified](https://oldschool.runescape.wiki/w/Elf_(Thieving)); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [provisional](https://oldschool.runescape.wiki/w/Elf_(Thieving)); Level verified; Song of the Elves completion belongs to area integration..
Failure: [provisional](https://oldschool.runescape.wiki/w/Elf_(Thieving)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Vyre (9685)

Weighted: 995 × 230-315 @ 109; 560 × 2 @ 8; 565 × 4 @ 2; 24774 × 1 @ 6; 1619 × 1 @ 5; 1601 × 1 @ 1; 24785 × 1 @ 1.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Vyre); 132-slot ordinary table verified. Separate blood shard 24777 roll at 1/5000 not implemented; Sins of the Father access belongs to area integration..
Chance: [verified](https://oldschool.runescape.wiki/w/Vyre); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Vyre).
Failure: [provisional](https://oldschool.runescape.wiki/w/Vyre); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Head Guard (11093)

Weighted: none.
Guaranteed: none.
Disabled: Cache Pickpocket but no published thieving table. Do not inherit ordinary Guard behavior by name.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Head_Guard); Cache Pickpocket but no published thieving table. Do not inherit ordinary Guard behavior by name..
Chance: [provisional](https://oldschool.runescape.wiki/w/Head_Guard); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Head_Guard); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Head_Guard); Cache Pickpocket but no published thieving table. Do not inherit ordinary Guard behavior by name..

### Istoria (11113)

Weighted: none.
Guaranteed: none.
Disabled: A Kingdom Divided bluish key; quest-only.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Istoria); A Kingdom Divided bluish key; quest-only..
Chance: [provisional](https://oldschool.runescape.wiki/w/Istoria); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Istoria); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Istoria); A Kingdom Divided bluish key; quest-only..

### Priest (11303)

Weighted: none.
Guaranteed: none.
Disabled: Exact variant/quest identity and loot unresolved; not East Ardougne priest 5417.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Priest); Exact variant/quest identity and loot unresolved; not East Ardougne priest 5417..
Chance: [provisional](https://oldschool.runescape.wiki/w/Priest); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Priest); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Priest); Exact variant/quest identity and loot unresolved; not East Ardougne priest 5417..

### Citizen (Twilight's Promise) (12929)

Weighted: none.
Guaranteed: none.
Disabled: Coins become stolen amulet at a quest stage; disappears after completion.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Citizen_(Twilight's_Promise)); Coins become stolen amulet at a quest stage; disappears after completion..
Chance: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Twilight's_Promise)); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Citizen_(Twilight's_Promise)); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Citizen_(Twilight's_Promise)); Coins become stolen amulet at a quest stage; disappears after completion..

### Knight of Varlamore (13114)

Weighted: 995 × 50 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Knight_of_Varlamore).
Chance: [provisional](https://oldschool.runescape.wiki/w/Knight_of_Varlamore); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Knight_of_Varlamore).
Failure: [provisional](https://oldschool.runescape.wiki/w/Knight_of_Varlamore); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Citizen (Civitas illa Fortis) (13164)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Civitas_illa_Fortis)); Ordinary coins verified; conditional red-token reward not implemented..
Chance: [verified](https://oldschool.runescape.wiki/w/Citizen_(Civitas_illa_Fortis)); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Citizen_(Civitas_illa_Fortis)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Civitas_illa_Fortis)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Tourist (13206)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Tourist).
Chance: [verified](https://oldschool.runescape.wiki/w/Tourist); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Tourist).
Failure: [provisional](https://oldschool.runescape.wiki/w/Tourist); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Wealthy citizen (13302)

Weighted: 995 × 85 @ 79; 29325 × 1 @ 5; 2677 × 1 @ 1.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Wealthy_citizen); Ordinary Wiki approximate 79:5:1 coins/house keys/easy clue. Distraction (100% automatic theft), inventory and clue ownership exceptions remain external integrations..
Chance: [verified](https://oldschool.runescape.wiki/w/Wealthy_citizen); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Wealthy_citizen).
Failure: [provisional](https://oldschool.runescape.wiki/w/Wealthy_citizen); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Emissary Ascended (13767)

Weighted: none.
Guaranteed: none.
Disabled: The Heart of Darkness quest forms; exact reward/gate unverified.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Emissary_Ascended); The Heart of Darkness quest forms; exact reward/gate unverified..
Chance: [provisional](https://oldschool.runescape.wiki/w/Emissary_Ascended); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Emissary_Ascended); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Emissary_Ascended); The Heart of Darkness quest forms; exact reward/gate unverified..

### Patzi (13819)

Weighted: none.
Guaranteed: none.
Disabled: Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Patzi); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..
Chance: [provisional](https://oldschool.runescape.wiki/w/Patzi); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Patzi); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Patzi); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..

### Adala (13823)

Weighted: none.
Guaranteed: none.
Disabled: Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Adala); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..
Chance: [provisional](https://oldschool.runescape.wiki/w/Adala); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Adala); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Adala); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..

### Constantinius (13826)

Weighted: none.
Guaranteed: none.
Disabled: Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Constantinius); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..
Chance: [provisional](https://oldschool.runescape.wiki/w/Constantinius); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Constantinius); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Constantinius); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..

### Cozyac (13828)

Weighted: none.
Guaranteed: none.
Disabled: Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Cozyac); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..
Chance: [provisional](https://oldschool.runescape.wiki/w/Cozyac); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Cozyac); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Cozyac); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..

### Xocotla (13830)

Weighted: none.
Guaranteed: none.
Disabled: Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Xocotla); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..
Chance: [provisional](https://oldschool.runescape.wiki/w/Xocotla); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Xocotla); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Xocotla); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..

### Pavo (13832)

Weighted: none.
Guaranteed: none.
Disabled: Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot.
Loot: [unsupported](https://oldschool.runescape.wiki/w/Pavo); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..
Chance: [provisional](https://oldschool.runescape.wiki/w/Pavo); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [unsupported](https://oldschool.runescape.wiki/w/Pavo); Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler..
Failure: [unsupported](https://oldschool.runescape.wiki/w/Pavo); Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot..

### Citizen (Aldarin) (13883)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Citizen_(Aldarin)).
Chance: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Aldarin)); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Citizen_(Aldarin)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Aldarin)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Salvager (13971)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Salvager).
Chance: [verified](https://oldschool.runescape.wiki/w/Salvager); Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts..
Requirement: [verified](https://oldschool.runescape.wiki/w/Salvager).
Failure: [provisional](https://oldschool.runescape.wiki/w/Salvager); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Citizen (Auburnvale) (14646)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Citizen_(Auburnvale)).
Chance: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Auburnvale)); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Citizen_(Auburnvale)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Auburnvale)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Citizen (Kastori) (14741)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Citizen_(Kastori)).
Chance: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Kastori)); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Citizen_(Kastori)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Kastori)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Citizen (Tal Teklan) (14763)

Weighted: 995 × 3 @ 1.
Guaranteed: none.
Loot: [verified](https://oldschool.runescape.wiki/w/Citizen_(Tal_Teklan)).
Chance: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Tal_Teklan)); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Citizen_(Tal_Teklan)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Citizen_(Tal_Teklan)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

### Pirate (14933)

Weighted: 995 × 20 @ 170; 31906 × 1 @ 14; 31908 × 1 @ 10; 2 × 1 @ 5; 31511 × 1 @ 1.
Guaranteed: none.
Loot: [provisional](https://oldschool.runescape.wiki/w/Pirate_(Thieving)); Main table verified. Onyx Crest-only 1/10 medallion fragment needs location condition; Sailing 47 is an access requirement..
Chance: [provisional](https://oldschool.runescape.wiki/w/Pirate_(Thieving)); No verified ordinary curve; runtime fallback is tuning, not OSRS evidence..
Requirement: [verified](https://oldschool.runescape.wiki/w/Pirate_(Thieving)).
Failure: [provisional](https://oldschool.runescape.wiki/w/Pirate_(Thieving)); Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing..

## All morph parents

Parents are classified dynamically resolved when all reachable Pickpocket definitions are mapped, including explicit unsupported children. This does not mean every child is enabled. Runtime must resolve the player's current transformed ID and revalidate its action before lookup; there are no unconditional parent aliases. Targets include non-Pickpocket states. Repeated selector-array values are deduplicated here; raw JSON preserves complete indexed arrays.

| Parent | Varbit | Varp | All nonnegative targets | Pickpocket descendants |
| --- | --- | --- | --- | --- |
| 1955 | -1 | 980 | 1269 | 1269, 1955 |
| 1975 | 340 | -1 | 734, 735 | 734, 735 |
| 1976 | 340 | -1 | 736, 737 | 736, 737 |
| 2014 | -1 | 399 | 1269 | 1269 |
| 2015 | -1 | 399 | 1269 | 1269 |
| 3187 | 10809 | -1 | 2341 | 2341 |
| 4262 | 9016 | -1 | 8853 | 8853 |
| 4267 | 9016 | -1 | 8854 | 8854 |
| 5082 | 9016 | -1 | 11901 | 11901 |
| 6138 | 340 | -1 | 3549, 3550 | 3550 |
| 6139 | 340 | -1 | 3552, 3553, 3554 | 3552, 3553, 3554 |
| 6140 | 340 | -1 | 3555, 3556, 3557 | 3555, 3556, 3557 |
| 6141 | 340 | -1 | 3558, 3559, 3560 | 3558, 3559, 3560 |
| 6256 | 9016 | -1 | 11902 | 11902 |
| 6288 | 532 | -1 | 5322 | 5322 |
| 6289 | 540 | -1 | 5322 | 5322 |
| 6405 | 1535 | -1 | 5384 | 5384 |
| 6819 | 3075 | -1 | 3106 | 3106 |
| 6820 | 3075 | -1 | 3106 | 3106 |
| 6821 | 3075 | -1 | 3106 | 3106 |
| 6822 | 3075 | -1 | 3106 | 3106 |
| 7210 | 3075 | -1 | 3106 | 3106 |
| 7211 | 3075 | -1 | 3106 | 3106 |
| 7547 | 3075 | -1 | 3106 | 3106 |
| 8516 | 3075 | -1 | 3106 | 3106 |
| 8734 | 3075 | -1 | 3106 | 3106 |
| 8740 | 3075 | -1 | 3106 | 3106 |
| 9234 | 9035 | -1 | 9015 | 9015 |
| 9384 | 3075 | -1 | 3106 | 3106 |
| 9385 | 3075 | -1 | 3106 | 3106 |
| 9386 | 3075 | -1 | 3106 | 3106 |
| 9387 | 3075 | -1 | 3106 | 3106 |
| 9388 | 3075 | -1 | 3106 | 3106 |
| 9389 | 3075 | -1 | 3106 | 3106 |
| 9390 | 3075 | -1 | 3106 | 3106 |
| 9391 | 3075 | -1 | 3106 | 3106 |
| 9392 | 3075 | -1 | 3106 | 3106 |
| 9393 | 3075 | -1 | 3106 | 3106 |
| 9394 | 3075 | -1 | 3106 | 3106 |
| 9395 | 3075 | -1 | 3106 | 3106 |
| 9396 | 3075 | -1 | 3106 | 3106 |
| 9397 | 3075 | -1 | 3106 | 3106 |
| 11151 | 12296 | -1 | 11112, 11113 | 11113 |
| 11392 | 13599 | -1 | 11302, 11303 | 11303 |
| 11393 | 13599 | -1 | 11304, 11305 | 11305 |
| 11394 | 13599 | -1 | 11306, 11307 | 11307 |
| 11395 | 13599 | -1 | 11308, 11309 | 11309 |
| 11396 | 13599 | -1 | 11310, 11311 | 11311 |
| 11397 | 13599 | -1 | 11312, 11313 | 11313 |
| 13399 | 9649 | -1 | 12929 | 12929 |
| 14066 | 11210 | -1 | 13818, 13819 | 13819 |
| 14070 | 11210 | -1 | 13820, 13823 | 13823 |
| 14073 | 11210 | -1 | 13825, 13826 | 13826 |
| 14076 | 11210 | -1 | 13827, 13828 | 13828 |
| 14079 | 11210 | -1 | 13829, 13830 | 13830 |
| 14083 | 11210 | -1 | 13831, 13832 | 13832 |
| 15088 | 3075 | -1 | 3106 | 3106 |

## Remaining integration work

- Resolve morphs per player before lookup and at resolution time. Some parents have hidden states and different non-thieving children. 1955 has a literal action despite its null name; 6138 has non-pickpocket target 3549 as well as 3550.
- Keep ordinary elf/vyre/TzHaar/wealthy-citizen loot enabled. Entrance progression belongs to area integration. Add conditional rare pre-rolls, clues/pets and distractions using each family's evidence; do not flatten independent or ordered rolls into arbitrary weights.
- H.A.M. three-concussion/Agility model uses one documented outside tile. Jail-vs-outside split, clothing reduction and exact reset bounds remain provisional. Coordinate any jail destination with an escape handler.
- Cave goblin guard IDs 2316/2317 are verified; alert probability/radius are not. TzHaar combat assistance is not evidence of pickpocket guard calls. Nonhuman failure animations and NPC-specific overhead chat remain unverified.
- Quest-only thefts, villagers, builder special rewards, head guards and unidentified priests remain explicit unsupported catalog entries; preserve exact context rather than assigning a same-name family's table.
- Raw decoding validates action/transform identity, not server-side XP, loot odds or quest scripts. Wiki was fetched through the approved public API because browser access was blocked; per-NPC pages supersede the stale general Thieving table and historical charts.
