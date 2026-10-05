/**
 * Imports a curated selection of third-party CC0 sound packs into the Click library.
 *
 *   node scripts/samples/import-packs.ts [cacheDir]
 *
 * Downloads each pack's zip into `cacheDir` (default `.cache/packs`, git-ignored) unless it is
 * already there, unpacks it, and converts the selected files (below) with ffmpeg into mono
 * 48 kHz 16-bit WAVs under `public/samples/<category>/<sound>-<take>.wav`. Each file is trimmed
 * (leading and trailing silence), capped at MAX_SECONDS and peak-normalised to the same level as
 * the synthesised placeholders. Writes the manifest to `src/engines/click/packs.json`.
 *
 * Needs `curl`, `unzip` and `ffmpeg` on the PATH. Only packs whose licence allows redistribution
 * (CC0) may be added here: the repository and the site are public. `import-packs.test.ts` fails if
 * the committed manifest drifts from SELECTION, so re-run the script after changing it.
 *
 * This file has no relative imports so Node can run it directly (type stripping).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_RATE = 48000;
/** Same level as the placeholder library (-3 dBFS), so categories sit together. */
export const PEAK = 0.708;
export const MAX_SECONDS = 2.5;
/** The Click engine's Take control goes up to 8. */
export const MAX_TAKES = 8;

export interface Pack {
  title: string;
  author: string;
  /** Page that states the licence; stored as each sound's `source`. */
  url: string;
  zip: string;
  license: 'CC0-1.0';
}

export const PACKS = {
  'kenney-interface': {
    title: 'Interface Sounds',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/interface-sounds',
    zip: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
    license: 'CC0-1.0',
  },
  'kenney-ui': {
    title: 'UI Audio',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/ui-audio',
    zip: 'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip',
    license: 'CC0-1.0',
  },
  'kenney-impact': {
    title: 'Impact Sounds',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/impact-sounds',
    zip: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
    license: 'CC0-1.0',
  },
  'kenney-digital': {
    title: 'Digital Audio',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/digital-audio',
    zip: 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip',
    license: 'CC0-1.0',
  },
  'kenney-scifi': {
    title: 'Sci-fi Sounds',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/sci-fi-sounds',
    zip: 'https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip',
    license: 'CC0-1.0',
  },
  'kenney-rpg': {
    title: 'RPG Audio',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/rpg-audio',
    zip: 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
    license: 'CC0-1.0',
  },
  'kenney-casino': {
    title: 'Casino Audio',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/casino-audio',
    zip: 'https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip',
    license: 'CC0-1.0',
  },
  'junkala-512': {
    title: 'The Essential Retro Video Game Sound Effects Collection [512 sounds]',
    author: 'Juhani Junkala',
    url: 'https://opengameart.org/content/512-sound-effects-8-bit-style',
    zip: 'https://opengameart.org/sites/default/files/The%20Essential%20Retro%20Video%20Game%20Sound%20Effects%20Collection%20%5B512%20sounds%5D.zip',
    license: 'CC0-1.0',
  },
  'kenney-voiceover': {
    title: 'Voiceover Pack',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/voiceover-pack',
    zip: 'https://kenney.nl/media/pages/assets/voiceover-pack/3f7f168698-1677589897/kenney_voiceover-pack.zip',
    license: 'CC0-1.0',
  },
  'kenney-jingles': {
    title: 'Music Jingles',
    author: 'Kenney',
    url: 'https://kenney.nl/assets/music-jingles',
    zip: 'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
    license: 'CC0-1.0',
  },
} satisfies Record<string, Pack>;

export type PackId = keyof typeof PACKS;

export interface SelectedSound {
  id: string;
  name: string;
  pack: PackId;
  /** File basenames inside the pack, or `Folder/name` where a basename repeats, in take order. */
  files: string[];
}

/** `seq('click_00#.ogg', 1, 3)` -> click_001.ogg, click_002.ogg, click_003.ogg. */
export function seq(pattern: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(pattern.replace('#', String(i)));
  return out;
}

const s = (id: string, name: string, pack: PackId, files: string[]): SelectedSound => ({
  id,
  name,
  pack,
  files,
});
const v = (id: string, name: string, file: string): SelectedSound =>
  s(id, name, 'kenney-voiceover', [`Male/${file}.ogg`, `Female/${file}.ogg`]);

/**
 * What goes into the library. Category and sound names form the `Category/Name` keys presets
 * store, so keep them stable once presets use them.
 */
export const SELECTION: { id: string; name: string; sounds: SelectedSound[] }[] = [
  {
    id: 'ui',
    name: 'UI',
    sounds: [
      s('click', 'Click', 'kenney-interface', seq('click_00#.ogg', 1, 5)),
      s('mouse-click', 'Mouse click', 'kenney-ui', [...seq('click#.ogg', 1, 5), 'mouseclick1.ogg']),
      s('tick', 'Tick', 'kenney-interface', ['tick_001.ogg', 'tick_002.ogg', 'tick_004.ogg']),
      s('toggle', 'Toggle', 'kenney-interface', seq('toggle_00#.ogg', 1, 4)),
      s('switch', 'Switch', 'kenney-ui', seq('switch#.ogg', 1, 8)),
      s('hover', 'Hover', 'kenney-ui', seq('rollover#.ogg', 1, 6)),
      s('select', 'Select', 'kenney-interface', seq('select_00#.ogg', 1, 8)),
      s('confirm', 'Confirm', 'kenney-interface', seq('confirmation_00#.ogg', 1, 4)),
      s('error', 'Error', 'kenney-interface', seq('error_00#.ogg', 1, 8)),
      s('back', 'Back', 'kenney-interface', seq('back_00#.ogg', 1, 4)),
      s('open', 'Open', 'kenney-interface', seq('open_00#.ogg', 1, 4)),
      s('close', 'Close', 'kenney-interface', seq('close_00#.ogg', 1, 4)),
      s('pop-up', 'Pop up', 'kenney-interface', seq('maximize_00#.ogg', 1, 6)),
      s('pop-down', 'Pop down', 'kenney-interface', seq('minimize_00#.ogg', 1, 6)),
      s('scroll', 'Scroll', 'kenney-interface', seq('scroll_00#.ogg', 1, 5)),
      s('glass', 'Glass', 'kenney-interface', seq('glass_00#.ogg', 1, 6)),
      s('drop', 'Drop', 'kenney-interface', seq('drop_00#.ogg', 1, 4)),
      s('question', 'Question', 'kenney-interface', seq('question_00#.ogg', 1, 4)),
      s('pluck', 'Pluck', 'kenney-interface', seq('pluck_00#.ogg', 1, 2)),
      s('glitch', 'Glitch', 'kenney-interface', seq('glitch_00#.ogg', 1, 4)),
    ],
  },
  {
    id: 'retro',
    name: 'Retro',
    sounds: [
      s('jump', 'Jump', 'junkala-512', seq('sfx_movement_jump#.wav', 1, 8)),
      s('land', 'Land', 'junkala-512', seq('sfx_movement_jump#_landing.wav', 9, 16)),
      s('coin', 'Coin', 'junkala-512', seq('sfx_coin_single#.wav', 1, 6)),
      s('coin-double', 'Coin double', 'junkala-512', seq('sfx_coin_double#.wav', 1, 7)),
      s('coin-cluster', 'Coin cluster', 'junkala-512', seq('sfx_coin_cluster#.wav', 1, 5)),
      s('power-up', 'Power-up', 'junkala-512', seq('sfx_sounds_powerup#.wav', 1, 8)),
      s('power-up-2', 'Power-up 2', 'junkala-512', seq('sfx_sounds_powerup#.wav', 9, 16)),
      s('fanfare', 'Fanfare', 'junkala-512', seq('sfx_sounds_fanfare#.wav', 1, 3)),
      s('menu-move', 'Menu move', 'junkala-512', seq('sfx_menu_move#.wav', 1, 5)),
      s('menu-select', 'Menu select', 'junkala-512', seq('sfx_menu_select#.wav', 1, 5)),
      s('button', 'Button', 'junkala-512', seq('sfx_sounds_button#.wav', 1, 8)),
      s('blip', 'Blip', 'junkala-512', seq('sfx_sounds_Blip#.wav', 1, 8)),
      s('pause', 'Pause', 'junkala-512', seq('sfx_sounds_pause#_in.wav', 1, 7)),
      s('unpause', 'Unpause', 'junkala-512', seq('sfx_sounds_pause#_out.wav', 1, 7)),
      s('interact', 'Interact', 'junkala-512', seq('sfx_sounds_interaction#.wav', 1, 6)),
      s('error', 'Error', 'junkala-512', seq('sfx_sounds_error#.wav', 1, 8)),
      s('damage', 'Damage', 'junkala-512', seq('sfx_damage_hit#.wav', 1, 8)),
      s('impact', 'Impact', 'junkala-512', seq('sfx_sounds_impact#.wav', 1, 8)),
      s('punch', 'Punch', 'junkala-512', seq('sfx_wpn_punch#.wav', 1, 4)),
      s('sword', 'Sword', 'junkala-512', [...seq('sfx_wpn_sword#.wav', 1, 3), 'sfx_wpn_dagger.wav']),
      s('laser', 'Laser', 'junkala-512', seq('sfx_wpn_laser#.wav', 1, 8)),
      s('shot', 'Shot', 'junkala-512', seq('sfx_weapon_singleshot#.wav', 1, 8)),
      s('no-ammo', 'No ammo', 'junkala-512', [...seq('sfx_wpn_noammo#.wav', 1, 3), 'sfx_wpn_reload.wav']),
      s('explosion-small', 'Explosion small', 'junkala-512', seq('sfx_exp_shortest_hard#.wav', 1, 8)),
      s('explosion', 'Explosion', 'junkala-512', seq('sfx_exp_short_hard#.wav', 1, 6)),
      s('explosion-big', 'Explosion big', 'junkala-512', seq('sfx_exp_medium#.wav', 1, 4)),
      s('portal', 'Portal', 'junkala-512', seq('sfx_movement_portal#.wav', 1, 4)),
      s('fall', 'Fall', 'junkala-512', seq('sfx_sounds_falling#.wav', 1, 4)),
      s('door', 'Door', 'junkala-512', seq('sfx_movement_dooropen#.wav', 1, 4)),
      s('death', 'Death', 'junkala-512', seq('sfx_deathscream_human#.wav', 1, 8)),
      s('robot-death', 'Robot death', 'junkala-512', seq('sfx_deathscream_robot#.wav', 1, 4)),
      s('alien-death', 'Alien death', 'junkala-512', seq('sfx_deathscream_alien#.wav', 1, 6)),
      s('defeat', 'Defeat', 'junkala-512', [
        'sfx_sounds_negative1.wav',
        'sfx_sounds_negative2.wav',
        ...seq('sfx_sounds_damage#.wav', 1, 3),
      ]),
      s(
        'ladder',
        'Ladder',
        'junkala-512',
        ['1a', '1b', '2a', '2b', '3a', '3b'].map((n) => `sfx_movement_ladder${n}.wav`),
      ),
      s(
        'stairs',
        'Stairs',
        'junkala-512',
        ['1a', '1b', '2a', '2b', '3a', '3b'].map((n) => `sfx_movement_stairs${n}.wav`),
      ),
      s('low-health', 'Low health', 'junkala-512', seq('sfx_lowhealth_alarmloop#.wav', 1, 4)),
      s('alarm', 'Alarm', 'junkala-512', seq('sfx_alarm_loop#.wav', 1, 4)),
      s('whistle', 'Whistle', 'junkala-512', ['sfx_sound_refereewhistle.wav']),
      s('shotgun', 'Shotgun', 'junkala-512', seq('sfx_weapon_shotgun#.wav', 1, 3)),
      s('machine-gun', 'Machine gun', 'junkala-512', seq('sfx_wpn_machinegun_loop#.wav', 1, 4)),
      s('cannon', 'Cannon', 'junkala-512', seq('sfx_wpn_cannon#.wav', 1, 6)),
      s('missile', 'Missile', 'junkala-512', [
        'sfx_wpn_missilelaunch.wav',
        'sfx_wpn_grenadewhistle1.wav',
        'sfx_wpn_grenadewhistle2.wav',
      ]),
      s('explosion-cluster', 'Explosion cluster', 'junkala-512', seq('sfx_exp_cluster#.wav', 1, 5)),
      s('power-on', 'Power on', 'junkala-512', ['sfx_sound_poweron.wav', 'sfx_sound_bling.wav']),
      s('power-down', 'Power down', 'junkala-512', seq('sfx_sound_shutdown#.wav', 1, 2)),
      s('vaporize', 'Vaporize', 'junkala-512', ['sfx_sound_vaporizing.wav', 'sfx_sound_depressurizing.wav']),
    ],
  },
  {
    id: 'impacts',
    name: 'Impacts',
    sounds: [
      s('punch', 'Punch', 'kenney-impact', seq('impactPunch_medium_00#.ogg', 0, 4)),
      s('punch-heavy', 'Punch heavy', 'kenney-impact', seq('impactPunch_heavy_00#.ogg', 0, 4)),
      s('soft', 'Soft', 'kenney-impact', seq('impactSoft_medium_00#.ogg', 0, 4)),
      s('soft-heavy', 'Soft heavy', 'kenney-impact', seq('impactSoft_heavy_00#.ogg', 0, 4)),
      s('wood-light', 'Wood light', 'kenney-impact', seq('impactWood_light_00#.ogg', 0, 4)),
      s('wood', 'Wood', 'kenney-impact', seq('impactWood_medium_00#.ogg', 0, 4)),
      s('wood-heavy', 'Wood heavy', 'kenney-impact', seq('impactWood_heavy_00#.ogg', 0, 4)),
      s('plank', 'Plank', 'kenney-impact', seq('impactPlank_medium_00#.ogg', 0, 4)),
      s('metal-light', 'Metal light', 'kenney-impact', seq('impactMetal_light_00#.ogg', 0, 4)),
      s('metal', 'Metal', 'kenney-impact', seq('impactMetal_medium_00#.ogg', 0, 4)),
      s('metal-heavy', 'Metal heavy', 'kenney-impact', seq('impactMetal_heavy_00#.ogg', 0, 4)),
      s('plate', 'Plate', 'kenney-impact', seq('impactPlate_medium_00#.ogg', 0, 4)),
      s('tin', 'Tin', 'kenney-impact', seq('impactTin_medium_00#.ogg', 0, 4)),
      s('glass-light', 'Glass light', 'kenney-impact', seq('impactGlass_light_00#.ogg', 0, 4)),
      s('glass', 'Glass', 'kenney-impact', seq('impactGlass_medium_00#.ogg', 0, 4)),
      s('glass-heavy', 'Glass heavy', 'kenney-impact', seq('impactGlass_heavy_00#.ogg', 0, 4)),
      s('bell', 'Bell', 'kenney-impact', seq('impactBell_heavy_00#.ogg', 0, 4)),
      s('mining', 'Mining', 'kenney-impact', seq('impactMining_00#.ogg', 0, 4)),
      s('generic', 'Generic', 'kenney-impact', seq('impactGeneric_light_00#.ogg', 0, 4)),
    ],
  },
  {
    id: 'footsteps',
    name: 'Footsteps',
    sounds: [
      s('grass', 'Grass', 'kenney-impact', seq('footstep_grass_00#.ogg', 0, 4)),
      s('wood', 'Wood', 'kenney-impact', seq('footstep_wood_00#.ogg', 0, 4)),
      s('concrete', 'Concrete', 'kenney-impact', seq('footstep_concrete_00#.ogg', 0, 4)),
      s('carpet', 'Carpet', 'kenney-impact', seq('footstep_carpet_00#.ogg', 0, 4)),
      s('snow', 'Snow', 'kenney-impact', seq('footstep_snow_00#.ogg', 0, 4)),
      s('boots', 'Boots', 'kenney-rpg', seq('footstep0#.ogg', 0, 7)),
    ],
  },
  {
    id: 'sci-fi',
    name: 'Sci-fi',
    sounds: [
      s('laser-small', 'Laser small', 'kenney-scifi', seq('laserSmall_00#.ogg', 0, 4)),
      s('laser-large', 'Laser large', 'kenney-scifi', seq('laserLarge_00#.ogg', 0, 4)),
      s('laser-retro', 'Laser retro', 'kenney-scifi', seq('laserRetro_00#.ogg', 0, 4)),
      s('blaster', 'Blaster', 'kenney-digital', seq('laser#.ogg', 1, 8)),
      s('zap', 'Zap', 'kenney-digital', ['zap1.ogg', 'zap2.ogg', 'zapTwoTone.ogg', 'zapTwoTone2.ogg']),
      s('phaser-up', 'Phaser up', 'kenney-digital', seq('phaserUp#.ogg', 1, 7)),
      s('phaser-down', 'Phaser down', 'kenney-digital', seq('phaserDown#.ogg', 1, 3)),
      s('power-up', 'Power-up', 'kenney-digital', seq('powerUp#.ogg', 1, 8)),
      s('phase-jump', 'Phase jump', 'kenney-digital', seq('phaseJump#.ogg', 1, 5)),
      s('pep', 'Pep', 'kenney-digital', seq('pepSound#.ogg', 1, 5)),
      s('tones', 'Tones', 'kenney-digital', [
        'twoTone1.ogg',
        'twoTone2.ogg',
        'threeTone1.ogg',
        'threeTone2.ogg',
        'zapThreeToneUp.ogg',
        'zapThreeToneDown.ogg',
      ]),
      s('force-field', 'Force field', 'kenney-scifi', seq('forceField_00#.ogg', 0, 4)),
      s('explosion', 'Explosion', 'kenney-scifi', seq('explosionCrunch_00#.ogg', 0, 4)),
      s('explosion-low', 'Explosion low', 'kenney-scifi', seq('lowFrequency_explosion_00#.ogg', 0, 1)),
      s('metal-hit', 'Metal hit', 'kenney-scifi', seq('impactMetal_00#.ogg', 0, 4)),
      s('door-open', 'Door open', 'kenney-scifi', seq('doorOpen_00#.ogg', 0, 2)),
      s('door-close', 'Door close', 'kenney-scifi', seq('doorClose_00#.ogg', 0, 2)),
      s('slime', 'Slime', 'kenney-scifi', seq('slime_00#.ogg', 0, 1)),
    ],
  },
  {
    id: 'items',
    name: 'Items',
    sounds: [
      s('coins', 'Coins', 'kenney-rpg', ['handleCoins.ogg', 'handleCoins2.ogg']),
      s('chips', 'Chips', 'kenney-casino', seq('chips-stack-#.ogg', 1, 6)),
      s('chip-lay', 'Chip lay', 'kenney-casino', seq('chip-lay-#.ogg', 1, 3)),
      s('dice', 'Dice', 'kenney-casino', [...seq('dice-throw-#.ogg', 1, 3), ...seq('die-throw-#.ogg', 1, 4)]),
      s('card', 'Card', 'kenney-casino', seq('card-place-#.ogg', 1, 4)),
      s('card-slide', 'Card slide', 'kenney-casino', seq('card-slide-#.ogg', 1, 8)),
      s('door-open', 'Door open', 'kenney-rpg', seq('doorOpen_#.ogg', 1, 2)),
      s('door-close', 'Door close', 'kenney-rpg', seq('doorClose_#.ogg', 1, 4)),
      s('creak', 'Creak', 'kenney-rpg', seq('creak#.ogg', 1, 3)),
      s('latch', 'Latch', 'kenney-rpg', ['metalLatch.ogg', 'metalClick.ogg']),
      s('book', 'Book', 'kenney-rpg', [...seq('bookFlip#.ogg', 1, 3), 'bookOpen.ogg', 'bookClose.ogg']),
      s('draw-knife', 'Draw knife', 'kenney-rpg', seq('drawKnife#.ogg', 1, 3)),
      s('slice', 'Slice', 'kenney-rpg', ['knifeSlice.ogg', 'knifeSlice2.ogg', 'chop.ogg']),
      s('cloth', 'Cloth', 'kenney-rpg', seq('cloth#.ogg', 1, 4)),
      s('leather', 'Leather', 'kenney-rpg', [
        'handleSmallLeather.ogg',
        'handleSmallLeather2.ogg',
        'dropLeather.ogg',
        'beltHandle1.ogg',
        'beltHandle2.ogg',
      ]),
      s('pot', 'Pot', 'kenney-rpg', seq('metalPot#.ogg', 1, 3)),
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    sounds: [
      // Take 1 is the male announcer, take 2 the female one.
      v('go', 'Go', 'go'),
      v('ready', 'Ready', 'ready'),
      v('set', 'Set', 'set'),
      v('round', 'Round', 'round'),
      v('final-round', 'Final round', 'final_round'),
      v('you-win', 'You win', 'you_win'),
      v('you-lose', 'You lose', 'you_lose'),
      v('game-over', 'Game over', 'game_over'),
      v('its-a-tie', 'Its a tie', 'its_a_tie'),
      v('level-up', 'Level up', 'level_up'),
      v('power-up', 'Power up', 'power_up'),
      v('congratulations', 'Congratulations', 'congratulations'),
      v('new-highscore', 'New highscore', 'new_highscore'),
      v('mission-completed', 'Mission completed', 'mission_completed'),
      v('mission-failed', 'Mission failed', 'mission_failed'),
      v('objective-achieved', 'Objective achieved', 'objective_achieved'),
      v('time-over', 'Time over', 'time_over'),
      v('hurry-up', 'Hurry up', 'hurry_up'),
      v('correct', 'Correct', 'correct'),
      v('wrong', 'Wrong', 'wrong'),
      s('countdown', 'Countdown', 'kenney-voiceover', [
        'Male/3.ogg',
        'Male/2.ogg',
        'Male/1.ogg',
        'Male/go.ogg',
      ]),
      s('numbers', 'Numbers', 'kenney-voiceover', seq('Male/#.ogg', 1, 8)),
    ],
  },
  {
    id: 'jingles',
    name: 'Jingles',
    sounds: [
      s('8-bit', '8-bit', 'kenney-jingles', seq('jingles_NES0#.ogg', 0, 7)),
      s('hit', 'Hit', 'kenney-jingles', seq('jingles_HIT0#.ogg', 0, 7)),
      s('pizzicato', 'Pizzicato', 'kenney-jingles', seq('jingles_PIZZI0#.ogg', 0, 7)),
      s('sax', 'Sax', 'kenney-jingles', seq('jingles_SAX0#.ogg', 0, 7)),
      s('steel', 'Steel drum', 'kenney-jingles', seq('jingles_STEEL0#.ogg', 0, 7)),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Manifest (same format as src/engines/click/manifest.json; see src/engines/click/library.ts)

export interface PackManifest {
  format: 'openclick-samples';
  version: 1;
  name: string;
  placeholder: false;
  license: 'CC0-1.0';
  categories: {
    id: string;
    name: string;
    sounds: {
      id: string;
      name: string;
      placeholder: false;
      source: string;
      license: string;
      /** Credit and original file names, for anyone tracing a sound back. */
      credit: string;
      files: string[];
    }[];
  }[];
}

export const outPath = (cat: string, sound: string, take: number) => `${cat}/${sound}-${take}.wav`;

export function buildManifest(): PackManifest {
  return {
    format: 'openclick-samples',
    version: 1,
    name: 'CC0 sound packs by Kenney and Juhani Junkala',
    placeholder: false,
    license: 'CC0-1.0',
    categories: SELECTION.map((cat) => ({
      id: cat.id,
      name: cat.name,
      sounds: cat.sounds.map((snd) => {
        const pack: Pack = PACKS[snd.pack];
        return {
          id: snd.id,
          name: snd.name,
          placeholder: false,
          source: pack.url,
          license: pack.license,
          credit: `${pack.author}, ${pack.title}: ${snd.files.join(', ')}`,
          files: snd.files.map((_, i) => outPath(cat.id, snd.id, i + 1)),
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// DSP

/** Trim silence, cap length, short fades, peak-normalise to PEAK. */
export function prepareSample(input: Float32Array, sampleRate = SAMPLE_RATE): Float32Array {
  let peak = 0;
  for (const v of input) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) throw new Error('silent sample');
  const startThreshold = peak * Math.pow(10, -40 / 20);
  const endThreshold = peak * Math.pow(10, -54 / 20);
  let first = 0;
  while (first < input.length && Math.abs(input[first]!) < startThreshold) first++;
  let last = input.length - 1;
  while (last > first && Math.abs(input[last]!) < endThreshold) last--;
  const start = Math.max(0, first - Math.floor(0.001 * sampleRate));
  let end = Math.min(input.length, last + Math.floor(0.01 * sampleRate) + 1);
  const maxLen = Math.floor(MAX_SECONDS * sampleRate);
  const capped = end - start > maxLen;
  if (capped) end = start + maxLen;
  const out = input.slice(start, end);
  // Fade in over the pre-roll only, so a transient at the very start keeps its attack.
  const fadeIn = first - start;
  for (let i = 0; i < fadeIn; i++) out[i]! *= i / fadeIn;
  const fadeOut = Math.min(out.length, Math.floor((capped ? 0.15 : 0.003) * sampleRate));
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i]! *= i / fadeOut;
  // Normalise last: a few source files end on a stray spike, which the fade-out removes.
  let outPeak = 0;
  for (const v of out) outPeak = Math.max(outPeak, Math.abs(v));
  const scale = PEAK / outPeak;
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  return out;
}

/** Mono 16-bit PCM WAV (same encoder as generate.ts). */
export function encodeWav16(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return bytes;
}

// ---------------------------------------------------------------------------------------------
// Import

/** Index audio files by basename and by `Folder/basename` (for packs that repeat basenames). */
function findFiles(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) findFiles(path, out);
    else if (/\.(ogg|wav)$/i.test(name)) {
      if (!out.has(name)) out.set(name, path);
      out.set(`${basename(dir)}/${name}`, path);
    }
  }
  return out;
}

function decode(path: string): Float32Array {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
}

export function importPacks(cacheDir: string, outDir: string, manifestPath: string) {
  const index = new Map<PackId, Map<string, string>>();
  for (const [id, pack] of Object.entries(PACKS) as [PackId, Pack][]) {
    const zip = join(cacheDir, `${id}.zip`);
    const dir = join(cacheDir, id);
    if (!existsSync(zip)) {
      mkdirSync(cacheDir, { recursive: true });
      console.log(`Downloading ${pack.zip}`);
      execFileSync('curl', ['-sSfL', '-o', zip, pack.zip], { stdio: 'inherit' });
    }
    if (!existsSync(dir)) execFileSync('unzip', ['-qo', zip, '-d', dir]);
    index.set(id, findFiles(dir));
  }
  const manifest = buildManifest();
  let files = 0;
  let bytes = 0;
  for (const cat of SELECTION) {
    rmSync(join(outDir, cat.id), { recursive: true, force: true });
    mkdirSync(join(outDir, cat.id), { recursive: true });
    for (const snd of cat.sounds) {
      if (snd.files.length > MAX_TAKES) throw new Error(`${cat.id}/${snd.id}: more than ${MAX_TAKES} takes`);
      snd.files.forEach((name, i) => {
        const src = index.get(snd.pack)!.get(name);
        if (!src) throw new Error(`${snd.pack}: no file named ${name}`);
        const wav = encodeWav16(prepareSample(decode(src)));
        writeFileSync(join(outDir, outPath(cat.id, snd.id, i + 1)), wav);
        files++;
        bytes += wav.length;
      });
    }
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { files, bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const cacheDir = resolve(process.argv[2] ?? join(root, '.cache/packs'));
  const manifestPath = join(root, 'src/engines/click/packs.json');
  const { files, bytes } = importPacks(cacheDir, join(root, 'public/samples'), manifestPath);
  const prettier = await import('prettier');
  const options = await prettier.resolveConfig(manifestPath);
  const json = readFileSync(manifestPath, 'utf8');
  writeFileSync(manifestPath, await prettier.format(json, { ...options, filepath: manifestPath }));
  console.log(`Wrote ${files} samples (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Wrote ${manifestPath}`);
}
