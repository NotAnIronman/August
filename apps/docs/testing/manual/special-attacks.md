# Special-attack manual test matrix

> **Status:** Active working notes
>
> **Owner:** Combat maintainers (`@NotAnIronman`)
>
> **Record date:** 2026-08-29; individual observations may predate this migration
>
> **Validation:** Manual in-game activation and hit-behavior checks. “Yes” means the
> recorded scenario was observed, not that every edge case is correct or automated.
>
> **Lifecycle:** Add an automated regression for each confirmed rule or defect. Remove
> an entry once its expected behavior, test coverage, and any follow-up issue are recorded.
> Re-run unresolved entries after combat-system or item-data changes.

|Name                  |Item ID|Working|Notes                                                                                                                        |
|----------------------|-------|-------|-----------------------------------------------------------------------------------------------------------------------------|
|Dragon dagger         |1215   |Yes    |Hits twice                                                                                                                   |
|Dragon Claws          |13652  |Yes    |Hits 4 times                                                                                                                 |
|Granite Maul          |4153   |Yes    | Hits once, allows spam use with enough special attack energy                                                                |
|Dragon Warhammer      |13576  |Yes    |Hits once                                                                                                                    |
|Bandos Godsword       |11804  |Yes    |Hits onec, Not using special attack animation                                                                                |
|Saradomin Godsword    |11806  |Yes    |Hits once                                                                                                                    |
|Zamorak Godsword      |11808  |Yes    |Hits once, properly freezes                                                                                                  |
|Armadyl Godsword      |11802  |Yes    |Hits once                                                                                                                    |
|Abyssal Whip          |4151   |Maybe  |Hits once, don't have pvp partner to test with.                                                                              |
|Dragon Scimitar       |4587   |Maybe  |Hits once, no special animation                                                                                              |
|Dragon Longsword      |1305   |Maybe  |Hits once, no special animation                                                                                              |
|Dragon Mace           |1434   |Yes    |Hits once                                                                                                                    |
|Dragon 2H Sword       |7158   |Yes    |Hits multiple                                                                                                                |
|Dragon/Crystal Halberd|23987  |Yes    |hitting twice even on enemies 1x1;should only affect enemies larger than 1x1. Also causing lag? Regular attack anim is punch |
|Dihn's bulwark        |21015  |Yes    |Hits multiple                                                                                                                |
|Magic Shortbow        |861    |Yes    |Hits twice                                                                                                                   |
|Dark Bow              |11235  |Yes    |Hits twice                                                                                                                   |
|Toxic Blowpipe        |12926  |No     |Cannot attack with it, as it states it has no zulrah scales left                                                             |
|Heavy balista         |19481  |Yes    |Hits once                                                                                                                    |
|Dragon Spear          |1249   |Yes    |Doesn't hit (correct)                                                                                                        |
|Staff of the Dead     |11791  |No     |Does not activate                                                                                                            |
|Dragon Battleaxe      |1377   |Half   |Only activates on hit, instead of when activated, allows re-specing without limitations                                      |
|Excalibur             |35     |No     |Uses energy, doesn't heal, wrong animation                                                                                   |
|Dragon Axe            |6739   |Yes    |Boosts Woodcutting, wrong animation                                                                                          |
|Dragon Harpoon        |21028  |Yes    |Boosts Fishing, Wrong animation                                                                                              |
|Dragon Pickaxe        |11920  |Yes    |Boost mining                                                                                                                 |
|Ancient Mace          |11061  |Yes    |Hits once                                                                                                                    |
|Bone Dagger           |8872   |Maybe  |Hits once, uses punch animation, cannot see if defence is reduced                                                            |
|Seercull              |6724   |Maybe  |Hits once, Uses regular animation, cannot test pvp                                                                           |
|Voidwaker             |27690  |Yes    |Always hits once, uses punch animation                                                                                       |
|Webweaver bow         |27655  |No     |Cannot use as states out of ether                                                                                            |

Overall notes:
All bows allow attacking without arrows, need to fix that, and enforce lowest level arrows usible rules.
