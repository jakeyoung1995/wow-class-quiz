/**
 * forever-data.js - the single source of truth for the WoW Forever quizzes
 * -----------------------------------------------------------------------
 * Four quiz pages (fun free, fun Pro, strongest free, strongest Pro) and the
 * class guide all read from this file, so a fact is corrected once, not five
 * times. The Classic and Midnight quizzes each inline their own data and have
 * drifted before; this is the lesson from that.
 *
 * Sourcing rule: every claim here traces to Blizzard's official posts, Wowhead,
 * Icy Veins or Warcraft Tavern, last re-checked 2026-10-18 (briefs and changelogs in
 * work/research/wow-forever/, outside this repo). Anything third-party-only is
 * either omitted or phrased as "in beta", never as fact. No tier rankings are
 * encoded anywhere in this file, on purpose: the game is in beta, there is no
 * level-60 data, and Blizzard's stated goal is that all 27 talent trees are
 * viable.
 *
 * `strength` ratings are structural assessments (what the kit can do), 1-5,
 * and every page that renders them labels them as pre-launch.
 */
window.FOREVER = (function () {
  'use strict';

  var META = {
    name: 'World of Warcraft: Forever',
    short: 'WoW Forever',
    launch: '2026-11-04',
    launchHuman: 'November 4, 2026',
    launchTime: '3:00 pm PT',
    betaStart: '2026-09-17',
    betaEnd: '2026-10-21',
    betaCap: 'level 30 (raised from 20 on October 1, 2026)',
    dualSpec: 'level 40',
    nameReservation: '2026-10-27 to 2026-11-03',
    firstRaids: '2026-12-09',
    levelCap: 60,
    build: '1.60.1',
    researched: '2026-10-18'
  };

  // Where the game is right now, from the dates above and today's date, so the
  // note on every quiz page stays true across beta end, launch and first raids
  // without anyone editing it. scripts/forever_phase.py does the same for the
  // static strings crawlers see.
  (function () {
    var today = new Date().toISOString().slice(0, 10);
    var long = function (iso) {
      var d = new Date(iso + 'T12:00:00Z');
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    };
    var checked = long(META.researched);
    if (today >= META.firstRaids) {
      META.phase = 'raids';
      META.betaNote = 'WoW Forever is live and its raids are open. Class facts here were last checked against Blizzard, Wowhead and Icy Veins on ' + checked + '. Relative strength is still kit-based until Wowhead publishes live rankings, and those will be added as a labelled layer.';
    } else if (today >= META.launch) {
      META.phase = 'live';
      META.betaNote = 'WoW Forever launched on ' + META.launchHuman + '. Raids open ' + long(META.firstRaids) + ', so there is no level-60 performance data yet; anything about strength is kit-based. Class facts were last checked on ' + checked + '.';
    } else if (today >= META.betaEnd) {
      META.phase = 'prelaunch';
      META.betaNote = 'The WoW Forever beta has closed and the game launches ' + META.launchHuman + '. Launch builds can still change numbers. Class facts were last checked against Blizzard, Wowhead and Icy Veins on ' + checked + '.';
    } else {
      META.phase = 'beta';
      META.betaNote = 'WoW Forever is in beta until ' + long(META.betaEnd) + ' and launches ' + META.launchHuman + '. Class kits are still being tuned, so anything here can change before launch. This page was last checked against Blizzard, Wowhead and Icy Veins on ' + checked + '.';
    }
  })();

  // Race data. `paid` marks the Skyborne, which needs the Heroic Pack or higher.
  var RACES = {
    human:   { name: 'Human',     faction: 'alliance', classes: ['warrior','paladin','hunter','rogue','priest','mage','warlock'], racials: 'Will to Survive removes stuns · Perception spots stealth · Ruthless +2% crit chance with any weapon · +5% Spirit' },
    dwarf:   { name: 'Dwarf',     faction: 'alliance', classes: ['warrior','paladin','hunter','rogue','priest','shaman'], racials: 'Stoneform clears bleeds, poisons and disease · Find Treasure · Earth Fury +2% crit damage and healing · +5% damage to Beasts' },
    nightelf:{ name: 'Night Elf', faction: 'alliance', classes: ['warrior','hunter','rogue','priest','druid'], racials: "Elune's Light +10% crit for 15s · Shadowmeld · +2% run speed that stacks with other speed buffs · fast wisp" },
    gnome:   { name: 'Gnome',     faction: 'alliance', classes: ['warrior','rogue','priest','mage','warlock'], racials: 'Escape Artist · Eureka! cuts costs 10% and adds 10% damage or healing for 8 seconds · +5% max mana/rage/energy · reliable Engineering' },
    skyborneA:{ name: 'Skyborne (High Order)', faction: 'alliance', paid: true, classes: ['warrior','hunter','rogue','mage','druid'], racials: 'Walk on Air 10s glide · Read Leyline doubles regen, castable while moving · +3% haste · +5% damage to Elementals' },
    orc:     { name: 'Orc',       faction: 'horde', classes: ['warrior','hunter','rogue','shaman','mage','warlock'], racials: 'Blood Fury +10% attack and spell power (3 min) · Shatter Curse dispels curses and banes · Savage +1% crit chance · stuns 20% shorter' },
    undead:  { name: 'Undead',    faction: 'horde', classes: ['warrior','paladin','rogue','priest','mage','warlock'], racials: 'Will of the Forsaken breaks charm, fear, sleep · Cannibalize restores health AND mana · Touch of the Grave leech' },
    tauren:  { name: 'Tauren',    faction: 'horde', classes: ['warrior','hunter','shaman','druid'], racials: 'War Stomp · Cultivation grows bonus herbs with no Herbalism · Plainsrunning speed · +5% health, +2% crit damage and healing' },
    troll:   { name: 'Troll',     faction: 'horde', classes: ['warrior','hunter','rogue','priest','shaman','mage','warlock'], racials: 'Berserking +10% attack and cast speed · Rapid Regeneration heals 50% · +5% damage to Beasts · 20% more health regen, part of it in combat' },
    skyborneH:{ name: 'Skyborne (Windshaper)', faction: 'horde', paid: true, classes: ['warrior','hunter','rogue','shaman','druid'], racials: 'Walk on Air 10s glide · Skysight +10% run speed, castable while moving · +3% haste · +5% damage to Elementals' }
  };

  // Combos that did not exist in Classic Era. Blizzard: "with more planned".
  var NEW_COMBOS = {
    'human:hunter': true, 'dwarf:shaman': true, 'gnome:priest': true,
    'orc:mage': true, 'troll:warlock': true, 'undead:paladin': true
  };

  var CLASSES = {
    warrior: {
      key: 'warrior', name: 'Warrior', icon: '⚔️', color: '#c79c6e',
      tagline: 'Strong, tough, and exceptionally violent.',
      fantasy: 'Weapons, rage and glorious battle. No pets, no spells, no excuses. The only class every race in the game can play.',
      vibe: ['Front line', 'Big weapons', 'Brute force'],
      roles: ['Tank', 'Melee DPS'],
      specs: [
        { name: 'Arms', role: 'Melee DPS / PvP', note: 'Mortal Strike plus the new Spearing Strike, which dismounts riders and hits Giants and Dragonkin extra hard.' },
        { name: 'Fury', role: 'Melee DPS', note: 'Dual-wield, unlimited Cleaves and big Whirlwinds. Icy Veins still calls it the go-to PvE damage spec.' },
        { name: 'Protection', role: 'Tank', note: 'Shield tank with improved AoE threat. Vanguard, the 16-point talent, lets you Charge in Defensive Stance.' }
      ],
      whatsNew: [
        'Spearing Strike (Arms): dismounts mounted targets and deals bonus damage to Giants and Dragonkin.',
        'Weaponmaster folds every weapon specialisation into one talent: axes and polearms crit, maces ignore armor, swords swing extra.',
        'Bloodthrill: main-hand hits on a Rended target can enable Overpower. Its proc chance was doubled in the September 24 beta build.',
        'Battle Shout is improved by default and buffs the whole raid since the October 15 build. Victory Rush at 20 heals 10% of your health after a kill.'
      ],
      leveling: 'The hardest 1 to 60 in the game, on purpose. Victory Rush at 20 is your only self-heal, so you eat every hit. Icy Veins: "leveling alone can be less forgiving than playing something like Hunter or Warlock." Blizzard rebuilt Rage generation in the October 1 and 8 builds: crits now give double Rage and several calculation bugs were fixed. Warcraft Tavern still calls Rage low compared to Classic. You arrive at 60 as a tank every group wants, or a Fury DPS that scales with every upgrade.',
      levelingEase: 1,
      mobility: 'Charge and Intercept. Never kited, always first in.',
      utility: 'Battle Shout for the party, Sunder Armor for the melee, and tanking.',
      knowGoingIn: ['Slowest, most punishing leveling of the nine', 'Lives and dies by weapon upgrades', 'No heals, no pet, no escape button', 'Rage generation was rebuilt in the October builds; Warcraft Tavern still rates it low versus Classic'],
      loveIt: ['Charge is still the most satisfying button in the game', 'Every race can be one, including both Skyborne', 'Tank and DPS on one character', 'Fury scales harder than anything else with gear'],
      milestones: [['1', 'Battle Stance, Heroic Strike'], ['4', 'Charge'], ['10', 'Defensive Stance quest, Taunt'], ['14', 'Tactical Mastery'], ['20', 'Cleave, Victory Rush, Sunder Armor stacking, first talent milestone'], ['30', 'Berserker Stance, Berserker Rage, Whirlwind, Intercept'], ['40', 'Mortal Strike or Bloodthirst; Dual Specialization'], ['60', 'Raid tank or Fury DPS']],
      professions: {
        forever: [
          { pair: 'Mining + Engineering', why: 'Wowhead: "Engineering will once again be the strongest profession for Fury Warrior." Grenades, Nitro Boosts, a Goblin Glider and a Repair Bot at your campsite.' },
          { pair: 'Mining + Blacksmithing', why: 'Eleven new plate and mail sets, tanking swords and maces, and your own Anvil and Master Forge in the field. Self-made upgrades every ten levels.' }
        ],
        alt: { pair: 'Herbalism + Alchemy', why: 'Wowhead lists Alchemy second for Fury: burst potions and Melee Attack Power flasks.' }
      },
      camp: 'Sharpening Wheel (Blacksmithing, +Strength) or Lodestone (Mining, +melee attack power).',
      strength: { solo: 1, scaling: 5, utility: 3, flexibility: 3, control: 3, selfSufficiency: 1, burst: 3, aoe: 4, mobility: 4, demand: 5 },
      strengthNotes: {
        why: 'Warrior is the class that turns gear into damage most directly. Icy Veins: "scaling excellently from both weapons and gear." Every raid needs tanks, and Protection is the classic answer. Weaponmaster removes the old weapon-skill lottery.',
        risk: 'Everything before 60 is the price of admission. If your definition of strong includes "strong at level 25", this is the wrong pick.',
        powerRaces: { alliance: 'Human (Ruthless +2% crit, Will to Survive) or Skyborne (+3% haste)', horde: 'Orc (Blood Fury, Savage +1% crit, shorter stuns) or Troll (Berserking)' },
        powerProfs: 'Engineering first (Wowhead), Alchemy second. Blacksmithing while leveling for self-made plate.',
        pilot: ['Level with a healer friend or a Hunter/Warlock partner; solo Warrior is the slow road', 'Buy or craft a weapon upgrade every 5 levels; weapon damage is your whole rotation', 'Learn Defensive Stance early. Tanks get instant dungeon groups from level 15']
      }
    },

    paladin: {
      key: 'paladin', name: 'Paladin', icon: '🛡️', color: '#f48cba',
      tagline: 'Call upon the Light. Heal, shield, incinerate.',
      fantasy: 'Plate, holy fire and an hour-long Blessing for everyone. Tank, heal or hit things with a glowing hammer. And for the first time ever, you can be Horde.',
      vibe: ['Holy warrior', 'Unkillable', 'Group support'],
      roles: ['Tank', 'Healer', 'Melee DPS'],
      specs: [
        { name: 'Holy', role: 'Healer', note: 'Holy Shock on a 10-second cooldown, Infusion of Light, and Light\'s Vigil for AoE healing. A Shockadin DPS build exists in beta.' },
        { name: 'Protection', role: 'Tank', note: 'Seal of Fury, baseline at level 10, makes Judgment a taunt. Wowhead\'s headline: "Paladins Now Have a Taunt."' },
        { name: 'Retribution', role: 'Melee DPS', note: 'Holy Strike, Seals that survive Judgment, and Twist of Light for supported seal twisting. Hit and crit were merged partly to help Ret.' }
      ],
      whatsNew: [
        'Holy Strike at level 6: an instant Holy strike for 50% weapon damage plus a bonus, on a 10-second cooldown. Warcraft Tavern says it helps leveling "immensely".',
        'Seals are no longer consumed by Judgment, and Judgment debuffs last 40 seconds.',
        'Consecration and Blessing of Kings are baseline at 20. Blessings last an hour. Auras are raid-wide. Salvation is no longer a Blessing (Mass Salvation for raids), so it costs no Blessing slot.',
        'Undead Paladins: a new Horde combo with its own story hub at Bandarion Keep.'
      ],
      leveling: 'Reported as the strongest leveler in the beta at level 20. Holy Strike, self-heals and Divine Shield mean you almost never die, and you never wait for a group as a tank or healer. Blizzard kept the gaps on purpose: no interrupt, no slow, fewer ranged options against anything that is not Undead or Demon.',
      levelingEase: 4,
      mobility: 'Low. No gap closer, no slow. Blessing of Freedom and a bubble.',
      utility: 'Blessings, raid-wide auras, Lay on Hands (now 20 minutes), Kings baseline, and Holy Wrath stuns Undead and Demons.',
      knowGoingIn: ['Only three races: Human, Dwarf, Undead. No Tauren, no Skyborne', 'No interrupt and no slow, by design', 'Slowest movement kit in the game', 'Ret and Prot both live on the Seal and Judgment rhythm; if you hate upkeep, look elsewhere'],
      loveIt: ['Every role on one character', 'Divine Shield: still the most iconic button in WoW', 'Strongest leveler in beta so far', 'Horde Paladin is finally real'],
      milestones: [['1', 'Seal of Righteousness, Holy Light'], ['6', 'Holy Strike'], ['10', 'Divine Shield, Seal of Fury (the tank taunt, from level 10)'], ['20', 'Consecration and Blessing of Kings baseline'], ['30', 'Blessing of Freedom era: you stop getting kited to death'], ['40', 'Dual Specialization. Riding and the charger: level and cost still unpublished'], ['60', 'Epic charger quest: Redemption for Alliance, Retribution for the Forsaken']],
      professions: {
        forever: [
          { pair: 'Mining + Blacksmithing', why: 'Wowhead: "Mining and Blacksmithing are strong choices for Retribution Paladins currently." Self-made plate from level 10 and your own Anvil at camp.' },
          { pair: 'Herbalism + Alchemy', why: 'Warcraft Tavern recommends Alchemy for Paladins because the class "was reliant on potions". In beta, healing potions come from First Aid, which anyone can learn; Alchemy keeps mana potions and flasks. Mana Well campsite object gives party mp5.' }
        ],
        alt: { pair: 'Mining + Engineering', why: 'The class has no interrupt or slow. Engineering grenades and Nitro Boosts patch both holes.' }
      },
      camp: 'Sharpening Wheel (+Strength) for Ret and Prot, Mana Well (Alchemy) for Holy.',
      strength: { solo: 4, scaling: 3, utility: 5, flexibility: 5, control: 2, selfSufficiency: 5, burst: 2, aoe: 3, mobility: 1, demand: 5 },
      strengthNotes: {
        why: 'Three roles, an hour-long buff for the whole raid, raid-wide auras, and a tank spec that finally has a taunt. Whatever a group is short of, a Paladin can respec into it. Blizzard merged hit and crit specifically to help Retribution scale.',
        risk: 'Three races only, and the kit deliberately lacks an interrupt and a slow. Not a PvP control class, and Ret damage at 60 is unproven until raids open on December 9.',
        powerRaces: { alliance: 'Human (Ruthless +2% crit, Will to Survive); Dwarf (Earth Fury +2% crit damage and healing, Stoneform)', horde: 'Undead, the only Horde option: Will of the Forsaken and Cannibalize now restores mana' },
        powerProfs: 'Blacksmithing while leveling (Wowhead), Alchemy for flasks and burst potions, Engineering to cover the missing interrupt.',
        pilot: ['Learn the Seal then Judgment rhythm early; Seals now persist, so keep one up always', 'Tank from level 10: Seal of Fury is baseline and its Judgment taunts; groups are instant', 'Refresh Blessings once an hour, not every five minutes']
      }
    },

    hunter: {
      key: 'hunter', name: 'Hunter', icon: '🏹', color: '#abd473',
      tagline: 'Tame the wild. Shoot from range. Never die.',
      fantasy: 'A pet that fights beside you from level 10, a bow that never runs out of targets, and Feign Death for when it all goes wrong. Widely called the easiest class to level.',
      vibe: ['Ranger', 'Pet partner', 'Explorer'],
      roles: ['Ranged DPS', 'Melee DPS (Survival)'],
      specs: [
        { name: 'Beast Mastery', role: 'Ranged DPS', note: 'Pets scale with your attack power and crit. Summon Hawk adds a second and third animal to the fight.' },
        { name: 'Marksmanship', role: 'Ranged DPS', note: 'Aimed Shot baseline, a Sniper Shot capstone (4-second cast, 15-second cooldown, out-damages Aimed Shot), and Lone Wolf for +20% damage if you would rather have no pet at all.' },
        { name: 'Survival', role: 'Melee DPS', note: 'Fully redesigned as a dual-wielding melee spec with Strider Kick and Mongoose Bite. Icy Veins: "extremely promising", but plan to play ranged in early dungeons.' }
      ],
      whatsNew: [
        'Survival is now a melee spec.',
        'Traps can be placed in combat on a 30-second cooldown, and since October 15 one Fire and one Ice trap can be down at once.',
        'Summon Hawk (Beast Mastery) and Sniper Shot (Marksmanship) are new. Trueshot Aura buffs the whole raid.',
        'Human Hunter is a new Alliance combo. Skyborne Hunters exist on both factions.'
      ],
      leveling: 'The consensus easiest solo class. Icy Veins: "one of the best solo classes in the game, especially when it comes to leveling." Warcraft Tavern calls it S-tier for soloing. Your pet tanks, you shoot, Feign Death erases mistakes, Aspect of the Cheetah gets you everywhere first.',
      levelingEase: 5,
      mobility: 'Highest in the game out of combat. Kiting is the whole job in combat.',
      utility: 'Tracking, traps, kiting, pet off-tanking, Feign Death to dump threat.',
      knowGoingIn: ['Pure DPS: never a tank or healer seat', 'Survival melee is rough in early dungeons', 'Pet management is constant', 'Beast Slaying racials on Troll and Dwarf are +5% vs Beasts, not everything', 'Auto Shot needs half a second standing still before it fires (October 15 build)'],
      loveIt: ['Nearly impossible to die while leveling', 'Feign Death is the best get-out-of-jail card in WoW', 'A pet with a name', 'Now a melee option if you get bored of ranged'],
      milestones: [['1', 'Auto Shot, Raptor Strike'], ['10', 'Tame Beast quest: your first pet'], ['20', 'Aspect of the Cheetah, Freezing Trap'], ['25', 'Summon Hawk (16 points)'], ['30', 'Feign Death; Strider Kick for Survival (21 points)'], ['40', 'Sniper Shot or Lacerating Strikes (31 points); Dual Specialization'], ['60', 'Rare pet hunting, dungeon and raid ranged DPS']],
      professions: {
        forever: [
          { pair: 'Skinning + Leatherworking', why: 'Wowhead: Leatherworking is "a staple for Hunters" in Forever. 289 new patterns, mail and leather sets, plus a Camp Tent for rested XP.' },
          { pair: 'Mining + Engineering', why: 'Guns, scopes, goggles and grenades. Warcraft Tavern lists it right behind Leatherworking.' }
        ],
        alt: { pair: 'Herbalism + Alchemy', why: 'Agility elixirs and a reliable money-maker; Alchemy sells to every class.' }
      },
      camp: 'Camp Tent (Leatherworking, rested XP) or Field Guide (Skinning, Track Beasts).',
      strength: { solo: 5, scaling: 3, utility: 2, flexibility: 1, control: 4, selfSufficiency: 4, burst: 3, aoe: 3, mobility: 5, demand: 3 },
      strengthNotes: {
        why: 'Nothing levels faster or dies less. The pet is a free tank, Feign Death resets any fight, and in-combat traps plus kiting make Hunters a nightmare to pin down in PvP. Third-party beta lists put Hunter first for leveling at the level-20 cap.',
        risk: 'One role. Ranged DPS seats are the most contested seats in any raid, and Hunter has never been the top raid damage class in Classic. Strength here means the open world and PvP, not the meter.',
        powerRaces: { alliance: 'Night Elf (Elune\'s Light +10% crit, Shadowmeld) or Dwarf (+5% vs Beasts, Stoneform)', horde: 'Troll (Berserking, +5% vs Beasts) or Orc (Blood Fury)' },
        powerProfs: 'Leatherworking for self-made mail (Wowhead), Engineering for scopes and utility.',
        pilot: ['Keep your pet fed and one level behind you at most', 'Freezing Trap in combat is new: use it as a second CC on every pull', 'Ranged until 40 even if you want Survival; Icy Veins says early melee Survival "will suffer heavily" in dungeons']
      }
    },

    rogue: {
      key: 'rogue', name: 'Rogue', icon: '🗡️', color: '#fff569',
      tagline: 'Most successful when your deeds never come to light.',
      fantasy: 'Stealth, poisons, a stun for every occasion and Vanish when it goes wrong. You choose every fight, and you win the ones you choose.',
      vibe: ['Assassin', 'Stealth', 'Fights on your terms'],
      roles: ['Melee DPS'],
      specs: [
        { name: 'Assassination', role: 'Melee DPS', note: 'Mutilate builds combo points with daggers; Venom is a new finisher that "massively" empowers poisons.' },
        { name: 'Combat', role: 'Melee DPS', note: 'Slower heavy weapons, reworked Puncturing Wounds. One-handed axes are allowed for every Rogue now; Hack and Slash gives them the old sword extra-attack proc.' },
        { name: 'Subtlety', role: 'Melee DPS', note: 'Rebuilt around bleeds and Rupture with the Thousand Cuts capstone. Icy Veins: "the option to be competitive in PvE" for the first time.' }
      ],
      whatsNew: [
        'Rogues can use one-handed axes.',
        'Mutilate and Venom for Assassination, Thousand Cuts for Subtlety.',
        'Poisons have more charges and stack with Sharpening Stones and Weightstones. Sap no longer breaks Stealth.',
        'Merged hit stat makes poison application reliable.'
      ],
      leveling: 'Stealth past what you cannot kill, Sap what you can, and pick fights one at a time. Icy Veins: "leveling a Rogue can always feel a bit sluggish due to the inherently slow generation of resources." Beta Rogues at level 20 report being energy-starved. It gets better as talents fill in.',
      levelingEase: 3,
      mobility: 'Sprint, Stealth, Vanish. You are wherever you want to be, unseen.',
      utility: 'Sap, Kick, lockpicking, poisons, and the best control kit in the game.',
      knowGoingIn: ['Pure DPS, no other seat, ever', 'Slow single-target killer while leveling: almost no AoE', 'Energy-starved at low levels in the current beta', 'Gear dependent for raid performance'],
      loveIt: ['Best 1v1 class in Classic history and nothing here changes that', 'Stealth turns dangerous zones into shortcuts', 'Vanish, still the greatest safety net in WoW', 'Three genuinely different specs now'],
      milestones: [['1', 'Stealth, Sinister Strike'], ['10', 'Sap, Kick, Poisons quest'], ['20', 'Kidney Shot, first stealth-opener burst'], ['22', 'Vanish'], ['30', 'Blind era; Mutilate (21 points) for dagger Assassination'], ['40', 'Venom or Thousand Cuts (31 points); Dual Specialization'], ['60', 'Raid melee DPS, world PvP menace']],
      professions: {
        forever: [
          { pair: 'Skinning + Leatherworking', why: 'Warcraft Tavern: Leatherworking is "very strong" for Forever Rogues with new leather sets for every level bracket. Skinning "remains excellent for gold-making".' },
          { pair: 'Mining + Engineering', why: 'Warcraft Tavern: Engineering is "even better" for Rogues than in Classic. Stealthman 52 is redundant for you, but the glider, Nitro Boosts and grenades are not.' }
        ],
        alt: { pair: 'Herbalism + Alchemy', why: 'Agility elixirs, burst potions and the safest income.' }
      },
      camp: 'Camp Chair (Skinning, +2% crit) or Camp Tent (Leatherworking, rested XP).',
      strength: { solo: 2, scaling: 4, utility: 2, flexibility: 1, control: 5, selfSufficiency: 2, burst: 5, aoe: 1, mobility: 4, demand: 3 },
      strengthNotes: {
        why: 'The strongest 1v1 kit in the game: stealth opener, two stuns, Blind, Vanish. Raid melee damage has always been top-tier in Classic and Assassination\'s new Venom finisher plus stackable poisons keep it there. Every one of the three trees now has a PvE argument.',
        risk: 'One role, no AoE, gear hungry, and the slowest resource generation while leveling. If you measure strength by "how useful am I to a struggling dungeon group", the answer is "as useful as my damage".',
        powerRaces: { alliance: 'Human (Ruthless +2% crit, Perception) or Night Elf (Elune\'s Light, Shadowmeld)', horde: 'Undead (Will of the Forsaken) or Orc (Savage +1% crit, Blood Fury)' },
        powerProfs: 'Engineering for PvP and utility (Warcraft Tavern), Leatherworking for self-made leather while leveling.',
        pilot: ['Open from stealth every single fight; a Rogue who runs at things is a bad Warrior', 'Keep poisons on both weapons from level 20', 'Pick daggers early if you want Assassination; Mutilate is daggers-only']
      }
    },

    priest: {
      key: 'priest', name: 'Priest', icon: '✨', color: '#ffffff',
      tagline: 'Creation and devastation, through faith.',
      fantasy: 'Two ways to heal and one way to hurt. Shields, mind control, Vampiric Embrace and a Shadowform that looks better than anything else in the game.',
      vibe: ['Faith healer', 'Dark side', 'Mind games'],
      roles: ['Healer', 'Ranged DPS'],
      specs: [
        { name: 'Discipline', role: 'Healer', note: 'Penance at 21 points, Divine Aegis shields on crit heals, Power Infusion deep in the tree. Icy Veins: "a more proactive healer" built on shields and utility.' },
        { name: 'Holy', role: 'Healer', note: 'Binding Heal, Prayer of Mending as the capstone, and Renew can crit. Built for multi-target healing.' },
        { name: 'Shadow', role: 'Ranged DPS', note: 'Devouring Plague baseline at 20 for every race (24-second cooldown since October 15), Shadow Word: Death baseline at 32, Vampiric Embrace on a 30-second cooldown, and a Shadowform that halves Shadow mana costs. Vampiric Embrace remains a support tool no other DPS has.' }
      ],
      whatsNew: [
        'Fear Ward and Devouring Plague are baseline for all races at level 20.',
        'Gnome Priest is a new combo, with Confounding Flash and Contingency Plan as race spells.',
        'Discipline and Holy each have real identities: shields versus multi-target heals.',
        'Wands carry spell power from about level 10; every guide says level with one. Since October 15 a wand needs half a second standing still before it fires.'
      ],
      leveling: 'Wand and Smite early, Shadow later. Icy Veins: "at lower levels, Shadow Priests are incredibly reliant on Spirit Tap... upon reaching Level 40 and unlocking Shadowform, Shadow\'s situation improves drastically." You will be invited to every dungeon as a healer whether you asked or not.',
      levelingEase: 3,
      mobility: 'Low. Power Word: Shield, Fear and Psychic Scream keep things off you.',
      utility: 'Fear Ward for everyone, Power Infusion, Vampiric Embrace healing while you DPS, Mind Control for chaos.',
      knowGoingIn: ['Shadow has no real AoE; Icy Veins says Holy Nova is the only option and it breaks Shadowform', 'Guilds will ask you to heal', 'Squishy and slow-moving', 'Six races, none of them Skyborne'],
      loveIt: ['Shadowform is the best-looking form in Classic', 'Two healing specs that play nothing alike', 'Mind Control an enemy into fighting its friends', 'Race spells are back and rebuilt: Gnome, Dwarf, Human, Night Elf, Troll, Undead each get two'],
      milestones: [['1', 'Smite, Lesser Heal'], ['10', 'Power Word: Shield, first wand'], ['20', 'Mind Blast rhythm; Fear Ward and Devouring Plague for every race'], ['30', 'Mind Control, Divine Spirit baseline'], ['32', 'Shadow Word: Death'], ['40', 'Shadowform; Dual Specialization'], ['60', 'Raid healer or the one Shadow seat every raid wants for Vampiric Embrace']],
      professions: {
        forever: [
          { pair: 'Tailoring + Enchanting', why: 'Wowhead for Discipline: Enchanting for wands plus Tailoring. Warcraft Tavern says Forever cloth crafts "exceed quest reward equivalents" and wands are "very, very strong" while leveling.' },
          { pair: 'Herbalism + Alchemy', why: 'Warcraft Tavern recommends Alchemy for Priests as a potion-reliant class. Mana Well campsite object for party mp5.' }
        ],
        alt: { pair: 'Mining + Engineering', why: 'Goggles, a glider and grenades give a slow class the escape tools it lacks.' }
      },
      camp: 'Incense Candle (Herbalism, +Intellect) or Faction Banner (Tailoring, +Spirit).',
      strength: { solo: 3, scaling: 3, utility: 4, flexibility: 4, control: 3, selfSufficiency: 3, burst: 2, aoe: 1, mobility: 1, demand: 5 },
      strengthNotes: {
        why: 'Healers are never benched, and Priest brings two healing styles plus the only DPS spec that heals the group passively. Fear Ward baseline for every race removes the old "Dwarf or nothing" raid rule. Power Infusion makes someone else stronger too.',
        risk: 'Shadow has no AoE and its raid seat depends on the guild wanting Vampiric Embrace. The class is slow, fragile, and its power is mostly power lent to others.',
        powerRaces: { alliance: 'Human (+5% Spirit, Divine Grace) or Dwarf (Stoneform, Chastise root)', horde: 'Undead (Will of the Forsaken, Dark Sacrifice for mana) or Troll (Berserking for cast speed)' },
        powerProfs: 'Tailoring plus Enchanting (Wowhead). Alchemy for mana potions and flasks.',
        pilot: ['Buy a wand at 10 and upgrade it every 10 levels', 'Shield before the pull, not after', 'Shadow: Spirit Tap and Mind Blast until 40, then Shadowform changes everything']
      }
    },

    shaman: {
      key: 'shaman', name: 'Shaman', icon: '⚡', color: '#0070de',
      tagline: 'Commune directly with the elements.',
      fantasy: 'Totems, lightning, Windfury and Ghost Wolf. A hybrid battle-mage who makes everyone around them hit harder. And for the first time, Dwarves can be one.',
      vibe: ['Elemental', 'Totem master', 'Battle-mage'],
      roles: ['Healer', 'Ranged DPS', 'Melee DPS'],
      specs: [
        { name: 'Elemental', role: 'Ranged DPS', note: 'Lava Burst (a 21-point talent since October 15, 20% stronger on a Flame Shocked target), Lightning Overload, and Elemental Mastery back as the 31-point capstone. Icy Veins: "extremely high burst damage and AoE damage in short bursts."' },
        { name: 'Enhancement', role: 'Melee DPS', note: 'Maelstrom Weapon lets you cast spells without breaking melee. Rage of the Farseer is the 31-point capstone: +30% attack speed for 25 seconds. Stormstrike is a 16-point talent on an 8-second cooldown. Hit and crit were merged partly to help this spec.' },
        { name: 'Restoration', role: 'Healer', note: 'Riptide capstone (heal plus HoT, and Chain Heal heals 25% more on that target), Water Shield, Mana Tide moved mid-tree.' }
      ],
      whatsNew: [
        'Dwarf Shaman on Alliance, with its own totem quest chain starting at level 4 in Anvilmar.',
        'Totems last 5 minutes and weapon imbues an hour. Call of the Elements (level 20) drops four totems in one cast, Totemic Projection (22) moves them, Totemic Recall (20) refunds mana; more Call sets at 30 and 40.',
        'Riptide (Restoration) and Rage of the Farseer (Enhancement) are the new capstones. Elemental\'s capstone is Elemental Mastery again as of October 15, with Lava Burst moving down to 21 points.',
        'Skyborne Windshapers can be Shaman too, with their own totem models.'
      ],
      leveling: 'Steady and self-reliant. You heal yourself, Ghost Wolf between quests, and Windfury procs make Enhancement feel explosive. Reincarnation is a free death. Not the fastest leveler on any guide, but one of the most comfortable.',
      levelingEase: 3,
      mobility: 'Ghost Wolf. Frost Shock and Earthbind to keep enemies where you want them.',
      utility: 'Buff totems reach the whole raid since October 15: Grace of Air, Strength of Earth, Windfury and Flametongue. Mana Spring, Tremor, Purge, Reincarnation, water walking for the group.',
      knowGoingIn: ['Totem upkeep is lighter now: buff totems last 5 minutes, imbues an hour, Call of the Elements drops four at once. Still a job', 'Only one Alliance race (Dwarf) unless you buy the Skyborne', 'Raid leaders will ask for Restoration', 'Buff totems are raid-wide and do not stack between Shamans, so a raid wants one or two'],
      loveIt: ['Every totem drop makes five people stronger', 'Three roles and three completely different feels', 'Ghost Wolf is the best travel form on the Horde side', 'Dwarf Shaman: a wish granted after 22 years'],
      milestones: [['1', 'Lightning Bolt, Rockbiter Weapon'], ['4', 'Earth Totem quest'], ['10', 'Fire Totem quest'], ['20', 'Water Totem quest, Ghost Wolf, Call of the Elements, Totemic Recall'], ['30', 'Air Totem quest: Windfury Totem; Lava Burst (21 points)'], ['40', 'Riptide, Rage of the Farseer or Elemental Mastery (31 points); Dual Specialization'], ['60', 'Raid healer, Elemental burst or Enhancement melee']],
      professions: {
        forever: [
          { pair: 'Mining + Blacksmithing', why: 'Wowhead: Blacksmithing gave Enhancement "very easy-to-obtain item upgrades" in beta, with eleven new mail and plate sets.' },
          { pair: 'Skinning + Leatherworking', why: 'Wowhead and Warcraft Tavern both list Leatherworking: new Totemic and Stormrider mail sets plus a Camp Tent.' }
        ],
        alt: { pair: 'Herbalism + Alchemy', why: 'Warcraft Tavern: Alchemy for a potion-reliant class. Mana Well for Restoration.' }
      },
      camp: 'Lodestone (Mining, +melee attack power) for Enhancement, Incense Candle (Herbalism, +Intellect) for casters.',
      strength: { solo: 3, scaling: 4, utility: 5, flexibility: 4, control: 4, selfSufficiency: 4, burst: 5, aoe: 4, mobility: 3, demand: 5 },
      strengthNotes: {
        why: 'The highest burst in the game per Icy Veins, three roles, and totems that raise the whole party\'s output. Enhancement is the class Blizzard merged the hit and crit stats to fix. Windfury Totem alone gets a Shaman invited to every melee group.',
        risk: 'One Alliance race. Buff totems are raid-wide now and do not stack between Shamans, so a raid wants one or two, not five. Resto pressure from guilds is real.',
        powerRaces: { alliance: 'Dwarf, your only option: Earth Fury +2% crit damage and healing, Stoneform', horde: 'Orc (Blood Fury, Savage +1% crit) for Enhancement; Troll (Berserking) for Elemental; Skyborne (+3% haste) for either' },
        powerProfs: 'Blacksmithing or Leatherworking while leveling (Wowhead), Alchemy for flasks and burst potions.',
        pilot: ['Bind Call of the Elements and set your four totems before every dungeon', 'Enhancement: Windfury on your weapon from 30, Rockbiter before', 'Purge everything with a buff; it wins more fights than Lava Burst']
      }
    },

    mage: {
      key: 'mage', name: 'Mage', icon: '🔮', color: '#69ccf0',
      tagline: 'Frail, brilliant, and hurling fire from a distance.',
      fantasy: 'Portals, Polymorph, free food for the party and the biggest numbers on the AoE meter. Frost freezes the whole zone and walks away.',
      vibe: ['Pure caster', 'Crowd control', 'Party VIP'],
      roles: ['Ranged DPS'],
      specs: [
        { name: 'Arcane', role: 'Ranged DPS', note: 'Arcane Blast (redesigned October 15: a 1.5-second cast that stacks Intellect into spell damage) and the new 16-point Arcane Wrath give it a real rotation. Icy Veins: "one of the most important improvements" in the class.' },
        { name: 'Fire', role: 'Ranged DPS', note: 'Heating Up (renamed from Hot Streak on October 1): crits cut Pyroblast\'s cast time. Icy Veins: for players who "enjoy critical strikes and large bursts of damage."' },
        { name: 'Frost', role: 'Ranged DPS', note: 'Ice Lance and Fingers of Frost, plus a new Frost Blast at level 24. Frostfire Bolt is baseline at 40 for every Mage. Keeps the control that made it the leveling spec, with damage while moving.' }
      ],
      whatsNew: [
        'Orc Mage is a new Horde combo. Skyborne High Order can be Mages on Alliance.',
        'Arcane Blast, Arcane Wrath, Ice Lance, Frost Blast, Frostfire Bolt, Heating Up and Fingers of Frost are all in.',
        'Arcane Meditation now keeps 50% of your regen while casting.',
        'Gnome Eureka! was reworked twice (September 24, October 15) and is now a flat 8-second buff.'
      ],
      leveling: 'Frost is one of the fastest levelers in the game and Icy Veins still says so. Nova, Blizzard, Blink, drink. You carry your own food and water and you are the group VIP for portals. Squishy: if it reaches you, you are in trouble.',
      levelingEase: 4,
      mobility: 'Blink, Frost Nova, slows. You control the distance.',
      utility: 'Polymorph, portals and teleports, conjured food and water for everyone, Counterspell, and Comprehension, a Mage-only tradeskill for reading dropped scrolls.',
      knowGoingIn: ['Pure DPS with no other seat', 'Extremely squishy', 'Everyone expects free food and a portal home', 'Frost got a new spell (Frost Blast) and a Cone of Cold rework on October 15 after beta complaints; Ice Lance was trimmed'],
      loveIt: ['The best AoE in the game', 'Polymorph: the definitive crowd control', 'Portals make you the most popular person in the guild', 'Three specs that now play like three different classes'],
      milestones: [['1', 'Fireball, Frostbolt'], ['8', 'Polymorph'], ['10', 'Conjure Water for the party'], ['20', 'Blink, Blizzard, Teleport'], ['24', 'Frost Blast'], ['30', 'Cone of Cold, Counterspell era'], ['40', 'Portals, Frostfire Bolt; Dual Specialization'], ['60', 'Raid AoE king, Arcane single-target']],
      professions: {
        forever: [
          { pair: 'Tailoring + Enchanting', why: 'Warcraft Tavern: "undoubtedly the strongest" pairing for Mages. Cloth needs no gathering slot, and Forever\'s school-themed caster sets carry spell power from level 10.' },
          { pair: 'Mining + Engineering', why: 'Wowhead lists Engineering as the Frost Mage\'s top choice for "options and versatility": glider, Nitro Boosts and goggles.' }
        ],
        alt: { pair: 'Herbalism + Alchemy', why: 'Mana potions, Spellblasting burst potions, and Mixology for longer elixirs.' }
      },
      camp: 'Incense Candle (Herbalism, +Intellect) or Enchanted Lute (Enchanting, armor and stats).',
      strength: { solo: 4, scaling: 3, utility: 4, flexibility: 1, control: 5, selfSufficiency: 4, burst: 4, aoe: 5, mobility: 3, demand: 4 },
      strengthNotes: {
        why: 'The best AoE and the best crowd control in the game, on a class every dungeon wants for Polymorph, food and portals. Frost levels fast; Arcane finally has a real single-target rotation. Third-party beta lists rate Mage among the top levelers.',
        risk: 'One role and paper armor. Frost was on the beta forum\'s "not yet meeting the viability goal" list in late September; the October 15 build reworked its kit.',
        powerRaces: { alliance: 'Gnome (+5% mana, Escape Artist) or Skyborne (+3% haste, Read Leyline regen)', horde: 'Troll (Berserking cast speed) or Undead (Will of the Forsaken, Cannibalize mana)' },
        powerProfs: 'Tailoring plus Enchanting (Warcraft Tavern), Engineering for mobility and PvP (Wowhead).',
        pilot: ['Frost until 60: Nova, Blizzard, Blink is the leveling loop', 'Conjure a stack of water before every dungeon; it is why you were invited', 'Sheep first, damage second']
      }
    },

    warlock: {
      key: 'warlock', name: 'Warlock', icon: '💀', color: '#9482c9',
      tagline: 'The bane of all life.',
      fantasy: 'A demon that tanks for you, curses that tick while you drink, and Fear when things get close. The easiest solo leveling in the game, with the cruelest aesthetic.',
      vibe: ['Demon master', 'DoTs and drains', 'Menace'],
      roles: ['Ranged DPS'],
      specs: [
        { name: 'Affliction', role: 'Ranged DPS', note: 'Wrack is a new channelled filler that empowers your DoTs. DoTs can now crit. Grim Reach (more range) replaced Malediction and Shadow Mastery doubled on October 15.' },
        { name: 'Demonology', role: 'Ranged DPS', note: 'Demonic Pact lets you sacrifice one demon and keep another out. Icy Veins: "much more dependent on its active pet" than Classic.' },
        { name: 'Destruction', role: 'Ranged DPS', note: 'Incinerate capstone, Bane of Havoc mirrors 15% of your damage to a second target, deeper Conflagrate.' }
      ],
      whatsNew: [
        'Demons scale with your stats and gear. Icy Veins: "much more damage and much tankier."',
        'DoTs can crit. Wrack, Incinerate and Demonic Pact are the new capstones. Curse of Agony and Doom are now Banes, so you run one Curse and one Bane per target; Firestone and Spellstone are weapon imbues.',
        'Troll Warlock is a new Horde combo.',
        'Voidwalker Sacrifice now scales with your healing power.'
      ],
      leveling: 'Icy Veins: "exceptionally quick at solo leveling." Imp for the best kill speed from 1 to 10, then a Voidwalker that tanks for you all the way to 60. DoT, drain, Fear, Life Tap, repeat. Third-party beta lists put Warlock right behind Hunter for leveling speed.',
      levelingEase: 5,
      mobility: 'Low. Fear and your demon keep the distance for you.',
      utility: 'Summon the late guy, Healthstones for everyone, Soulstone a healer, a Curse and a Bane per target for the raid.',
      knowGoingIn: ['Pure DPS', 'Soul Shards are still a bag-space tax', 'Everyone wants a summon and a Healthstone before they want your damage', 'Five races; no Skyborne, no Tauren'],
      loveIt: ['Voidwalker: a free tank from level 10', 'Fear, the most annoying spell in PvP, is yours', 'Demons finally scale with you', 'Summoning portal makes you the reason the raid starts on time'],
      milestones: [['1', 'Shadow Bolt, Imp quest'], ['10', 'Voidwalker quest: your free tank'], ['20', 'Succubus, Bane of Agony leveling'], ['30', 'Felhunter, Ritual of Summoning'], ['40', 'Dual Specialization. Felsteed class quest in Classic; Forever changes unpublished. Soulstone rhythm'], ['60', 'Dreadsteed quest, raid DoT and curse duty']],
      professions: {
        forever: [
          { pair: 'Tailoring + Enchanting', why: 'Warcraft Tavern: the Tailoring Faction Banner\'s Spirit helps Life Tap, and cloth needs no gathering slot. Enchant your own wands.' },
          { pair: 'Herbalism + Alchemy', why: 'Warcraft Tavern lists Alchemy next: mana potions, Spellblasting potions and a Mana Well at camp.' }
        ],
        alt: { pair: 'Mining + Engineering', why: 'A glider and Nitro Boosts for a class with no mobility of its own.' }
      },
      camp: 'Faction Banner (Tailoring, +Spirit) or Incense Candle (Herbalism, +Intellect).',
      strength: { solo: 5, scaling: 4, utility: 4, flexibility: 1, control: 4, selfSufficiency: 5, burst: 2, aoe: 3, mobility: 1, demand: 4 },
      strengthNotes: {
        why: 'The most self-sufficient class in the game: a tank pet, self-healing drains, mana from health, and now demons that scale with your gear. Raid utility (summons, Healthstones, Soulstones) that no one else provides. Affliction sits at the top of several third-party beta DPS lists.',
        risk: 'One role and low mobility. Beta damage rankings are level-20 impressions, not level-60 fact.',
        powerRaces: { alliance: 'Gnome (+5% mana, Eureka!) or Human (+5% Spirit for Life Tap)', horde: 'Orc (Blood Fury spell power, shorter stuns) or Undead (Will of the Forsaken, Cannibalize mana)' },
        powerProfs: 'Tailoring plus Enchanting (Warcraft Tavern), Alchemy for mana and burst potions.',
        pilot: ['Voidwalker taunts, you DoT, you Drain Life; never pull with a Shadow Bolt', 'Life Tap then Drain Life is free mana; use it', 'Farm Soul Shards before the dungeon, not during']
      }
    },

    druid: {
      key: 'druid', name: 'Druid', icon: '🌿', color: '#ff7d0a',
      tagline: 'Unparalleled union with nature.',
      fantasy: 'Cat, bear, moonkin, tree, travel form. Every role in the game on one character. The Skyborne bring brand-new forms. Icy Veins: "by far the most flexible class in WoW Forever."',
      vibe: ['Shapeshifter', 'Every role', 'Nature spirit'],
      roles: ['Tank', 'Healer', 'Melee DPS', 'Ranged DPS'],
      specs: [
        { name: 'Balance', role: 'Ranged DPS', note: 'An Eclipse talent rewards Wrath then Starfire. Wrath damage was raised about 50% on September 24 and its ranks reflowed October 8. Moonkin Aura gives the whole raid +3% spell crit; Insect Swarm is a 16-point talent.' },
        { name: 'Feral', role: 'Melee DPS / Tank', note: 'Primal Bite (16 points, Bear) replaces Mangle, Lacerate arrives baseline at 42, Berserk at 31 points hits multiple targets. Tiger\'s Fury is gone; Shifting Power (16 points) is the sanctioned powershift. Bear is a real tank with a fuller rotation.' },
        { name: 'Restoration', role: 'Healer', note: 'Wild Growth arrives as an AoE HoT, Swiftmend is in, and Rejuvenation and Tranquility can crit. Icy Veins: reworked toward "what modern WoW plays like."' }
      ],
      whatsNew: [
        'Skyborne Druids on both factions, with race-specific forms.',
        'Wild Growth, Eclipse, Primal Bite and Berserk are new or reworked.',
        'Improved Mark of the Wild is baseline; Thorns scales with spell power.',
        'Wrath was buffed September 24 and its ranks reflowed October 8 after Balance was called weak at 20. Moonkin Aura went raid-wide October 15.'
      ],
      leveling: 'Bear at 10, cat at 20, travel form at 30. Middle of the pack for speed; Icy Veins notes both forms "lack tools" until later levels. What you get instead is never being stuck: heal yourself, tank a dungeon, stealth in cat, run in travel form.',
      levelingEase: 3,
      mobility: 'Travel Form, shapeshift out of roots and slows, Prowl in cat. Second only to Hunter.',
      utility: 'Innervate, Rebirth (the only combat resurrection), Mark of the Wild, raid-wide Moonkin spell-crit aura, Faerie Fire.',
      knowGoingIn: ['Four races total and two of them cost money (Skyborne)', 'Jack of all trades: each form arrives late and matures late', 'Bear is still the tank with no easy answer to crushing blows (Icy Veins)', 'Guild pressure to go Restoration is real'],
      loveIt: ['One character, every role, no alt needed', 'Rebirth turns a wipe into a kill', 'Travel Form and Prowl make the world yours', 'Skyborne forms are the coolest new thing in the beta'],
      milestones: [['1', 'Wrath, Healing Touch'], ['10', 'Bear Form quest'], ['12', 'Revive'], ['20', 'Cat Form, Prowl, Shred, Omen of Clarity'], ['30', 'Travel Form, Rebirth'], ['40', 'Berserk, Wild Growth or the Balance capstone (31 points); Dual Specialization'], ['42', 'Lacerate'], ['60', 'Wild Growth, raid flex slot']],
      professions: {
        forever: [
          { pair: 'Skinning + Leatherworking', why: 'Wowhead recommends it for Balance and lists it for Feral. Leather sets for every role plus a Camp Tent for rested XP.' },
          { pair: 'Mining + Engineering', why: 'Wowhead for Feral: Engineering is "at the top of the list for all of the utility." A glider on a class that already has Travel Form is absurd, in a good way.' }
        ],
        alt: { pair: 'Herbalism + Alchemy', why: 'Wowhead\'s Feral guide cites Mixology (+25% elixir and flask effect) as a beta standout. Tauren Cultivation grows bonus herbs.' }
      },
      camp: 'Camp Tent (Leatherworking, rested XP) or Camp Chair (Skinning, +2% crit).',
      strength: { solo: 3, scaling: 3, utility: 4, flexibility: 5, control: 4, selfSufficiency: 4, burst: 3, aoe: 2, mobility: 5, demand: 5 },
      strengthNotes: {
        why: 'The only class that covers all four roles, which means it is never the class a raid cannot use. Rebirth is exclusive and fight-saving, Innervate saves healers, and Wild Growth gives Restoration party-wide healing it never had in Classic.',
        risk: 'Beta forums and third-party lists rate Balance and Feral DPS low right now; Blizzard buffed Wrath September 24, reflowed its ranks October 8 and made Moonkin Aura raid-wide October 15. Bear lacks crush immunity. Strength here is versatility and utility, not the meter.',
        powerRaces: { alliance: 'Night Elf (Elune\'s Light +10% crit, Shadowmeld) or Skyborne (+3% haste)', horde: 'Tauren (+5% health, +2% crit damage and healing, War Stomp) or Skyborne (+3% haste, +10% run speed)' },
        powerProfs: 'Engineering and Alchemy first for Feral, Leatherworking for Balance (Wowhead).',
        pilot: ['Learn every form the level it unlocks; a Druid who stays in one form is a worse version of another class', 'Rebirth is once per 30 minutes; save it for the healer', 'Tank early dungeons in Bear: the queue-free path to gear']
      }
    }
  };

  // Strength dimension labels, shared by both strongest-class quizzes.
  var STRENGTH_DIMS = [
    { key: 'solo',            label: 'Solo leveling',        desc: 'How fast and safe 1 to 60 is alone' },
    { key: 'scaling',         label: 'Gear scaling',         desc: 'How much every upgrade shows up in your output' },
    { key: 'utility',         label: 'Group utility',        desc: 'Buffs, summons, CC and saves you bring for others' },
    { key: 'flexibility',     label: 'Role flexibility',     desc: 'How many roles one character can fill' },
    { key: 'control',         label: 'PvP control',          desc: 'Stuns, slows, escapes, fears and kiting' },
    { key: 'selfSufficiency', label: 'Self-sufficiency',     desc: 'Heals, pets, shields, food: how little you need others' },
    { key: 'burst',           label: 'Burst damage',         desc: 'Front-loaded damage in short windows' },
    { key: 'aoe',             label: 'AoE damage',           desc: 'Killing packs, not just one target' },
    { key: 'mobility',        label: 'Mobility',             desc: 'Travel speed, gap closers, escapes' },
    { key: 'demand',          label: 'Group demand',         desc: 'How quickly groups take you: tanks and healers first' }
  ];

  function racesFor(classKey) {
    var out = { alliance: [], horde: [] };
    Object.keys(RACES).forEach(function (rk) {
      var r = RACES[rk];
      if (r.classes.indexOf(classKey) === -1) return;
      out[r.faction].push({
        key: rk, name: r.name, paid: !!r.paid,
        isNew: !!NEW_COMBOS[rk + ':' + classKey] || !!r.paid,
        racials: r.racials
      });
    });
    return out;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    META: META,
    RACES: RACES,
    NEW_COMBOS: NEW_COMBOS,
    CLASSES: CLASSES,
    STRENGTH_DIMS: STRENGTH_DIMS,
    racesFor: racesFor,
    escapeHtml: escapeHtml,
    order: ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid']
  };
})();
