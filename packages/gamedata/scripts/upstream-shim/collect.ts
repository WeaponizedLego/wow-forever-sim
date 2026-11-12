// Bundled by extract-presets.ts together with one upstream `ui/specs/<class>/<spec>/spec.ts`. Turns the spec's
// `defaults` and `presets` into the committed preset JSON (see src/presets.ts for the shape). Runs inside the
// bundle so it can use the same generated proto types the upstream config was built with.
import { Player } from '@generated/proto/api';
import { APLRotation, APLRotation_Type as APLRotationType } from '@generated/proto/apl';
import { Debuffs, IndividualBuffs, PartyBuffs, RaidBuffs } from '@generated/proto/buffs';
import {
  ConsumesSpec,
  Encounter,
  EquipmentSpec,
  ItemSwap,
  Profession,
  Race,
  type ItemSpec,
} from '@generated/proto/common';

type Obj = Record<string, unknown>;

export interface SpecInfo {
  id: string;
  oneofKind: string;
  slots: readonly string[];
  races: Record<string, number>;
  /** The class's first race, upstream's default when a spec names none. */
  firstRace: string;
}

const isStub = (v: unknown): boolean =>
  (typeof v === 'object' || typeof v === 'function') && v !== null && (v as Obj)['__isStub'] === true;
const real = <T>(v: T): T | undefined => (v === undefined || v === null || isStub(v) ? undefined : v);
// A deep copy without the stubbed parts (values UI code computes, which the extraction cannot run).
const clean = (v: unknown): unknown => {
  if (isStub(v)) return undefined;
  if (Array.isArray(v)) return v.map(clean).filter((x) => x !== undefined);
  if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
    return Object.fromEntries(
      Object.entries(v)
        .map(([k, x]) => [k, clean(x)] as const)
        .filter(([, x]) => x !== undefined),
    );
  }
  return v;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const stable = (v: unknown) => JSON.stringify(v);

const gearOf = (eq: EquipmentSpec, slots: readonly string[]) => {
  const gear: Obj = {};
  eq.items.forEach((it: ItemSpec, i: number) => {
    if (!it?.id) return;
    const slot = slots[i];
    if (!slot) return;
    gear[slot] = {
      itemId: it.id,
      ...(it.enchant ? { enchantId: it.enchant } : {}),
      ...(it.randomSuffix ? { randomSuffix: it.randomSuffix } : {}),
    };
  });
  return gear;
};

const professionName = (p: unknown) => (typeof p === 'number' && p > 0 ? Profession[p] : undefined);

export function collect(config: Obj, info: SpecInfo) {
  const notes: string[] = [];
  const missing: string[] = [];
  const defaults = (real(config['defaults']) ?? {}) as Obj;
  const presets = (real(config['presets']) ?? {}) as Obj;
  const list = (k: string) =>
    ((real(presets[k]) as unknown[] | undefined) ?? []).filter((x) => !isStub(x)) as Obj[];

  const specOptionsJson = (options: unknown): Obj => {
    if (!real(options)) return {};
    const json = Player.toJson(
      Player.create({
        spec: { oneofKind: info.oneofKind, [info.oneofKind]: { options: clean(options) } } as never,
      }),
    ) as Obj;
    return ((json[info.oneofKind] as Obj | undefined)?.['options'] as Obj | undefined) ?? {};
  };

  // Gear sets, deduped by content.
  const gearSets: Obj[] = [];
  const gearIdByContent = new Map<string, string>();
  const addGear = (name: string, eq: EquipmentSpec, extra: Obj = {}): string => {
    const gear = gearOf(eq, info.slots);
    const key = stable(gear);
    const known = gearIdByContent.get(key);
    if (known) return known;
    let id = slug([extra['group'], name].filter(Boolean).join(' ')) || 'gear';
    while (gearSets.some((g) => g['id'] === id)) id += '-2';
    gearIdByContent.set(key, id);
    gearSets.push({ id, name, ...extra, gear });
    return id;
  };
  for (const g of list('gear')) {
    addGear(g['name'] as string, g['gear'] as EquipmentSpec, {
      ...(g['group'] ? { group: g['group'] } : {}),
      ...(g['phase'] !== undefined ? { phase: g['phase'] } : {}),
    });
  }

  // Talents.
  const talents: Obj[] = [];
  const addTalents = (name: string, talentsString: string) => {
    if (talents.some((t) => t['talents'] === talentsString)) return;
    let id = slug(name) || 'talents';
    while (talents.some((t) => t['id'] === id)) id += '-2';
    talents.push({ id, name, talents: talentsString });
  };
  for (const t of list('talents')) {
    const s = (t['data'] as Obj | undefined)?.['talentsString'];
    if (typeof s === 'string' && s) addTalents(t['name'] as string, s);
  }

  // Rotations: APL ones carry the engine APLRotation JSON. Simple ones are recorded but cannot be simmed as is: the
  // site turns them into an APL in the browser with spec code we do not port.
  const rotations: Obj[] = [];
  const rotationIdByContent = new Map<string, string>();
  const addApl = (name: string, apl: APLRotation, extra: Obj = {}): string => {
    const json = APLRotation.toJson(apl) as Obj;
    const key = stable(json);
    const known = rotationIdByContent.get(key);
    if (known) return known;
    let id = slug(name) || 'rotation';
    while (rotations.some((r) => r['id'] === id)) id += '-2';
    rotationIdByContent.set(key, id);
    rotations.push({ id, name, kind: 'apl', ...extra, rotation: json });
    return id;
  };
  for (const r of list('rotations')) {
    const apl = ((r['rotation'] as Obj | undefined)?.['rotation'] as APLRotation | undefined) ?? undefined;
    if (r['simple'] || !apl || apl.type !== APLRotationType.TypeAPL) {
      let id = slug(r['name'] as string) || 'simple';
      while (rotations.some((x) => x['id'] === id)) id += '-2';
      rotations.push({ id, name: r['name'], kind: 'simple' });
      continue;
    }
    addApl(r['name'] as string, apl);
  }
  const firstApl = () => rotations.find((r) => r['kind'] === 'apl')?.['id'] as string | undefined;

  // The defaults, as upstream applyIndividualDefaults sets them.
  const other = (real(defaults['other']) ?? {}) as Obj;
  const raceProto = (real(other['race']) as number | undefined) || 0;
  let raceId = Object.entries(info.races).find(([, v]) => v === raceProto)?.[0];
  if (!raceId) {
    raceId = info.firstRace;
    notes.push(`No default race upstream; the class's first race (${raceId}) is used, as the site does.`);
  }

  const defaultGear = real(defaults['gear']) as EquipmentSpec | undefined;
  let defaultGearId: string | undefined;
  if (defaultGear && defaultGear.items?.some((i) => i?.id)) defaultGearId = addGear('Default', defaultGear);
  else missing.push('gear');

  const talentsString = ((real(defaults['talents']) as Obj | undefined)?.['talentsString'] as string) || '';
  if (talentsString) addTalents('Default', talentsString);
  else missing.push('talents');

  const rotationType = (real(defaults['rotationType']) as number | undefined) || APLRotationType.TypeAuto;
  let defaultRotationId: string | undefined;
  const defaultApl = real(defaults['aplRotation']) as APLRotation | undefined;
  if (rotationType === APLRotationType.TypeAPL && defaultApl) {
    defaultRotationId = addApl('Default', APLRotation.create(defaultApl));
  } else {
    defaultRotationId = firstApl();
    if (defaultRotationId) {
      notes.push(
        `Upstream defaults to the ${APLRotationType[rotationType]} rotation, which the site builds into an APL in the browser; the defaults here use the APL preset "${defaultRotationId}" instead.`,
      );
    }
  }
  if (!defaultRotationId) missing.push('rotation');

  const consumables = real(defaults['consumables']) as ConsumesSpec | undefined;
  if (!consumables) missing.push('consumables');
  const specOptions = real(defaults['specOptions']);
  if (!specOptions) missing.push('specOptions');

  const json = <T extends object>(
    type: { toJson(m: T): unknown; create(v?: unknown): T },
    v: unknown,
  ): Obj => (real(v) ? (type.toJson(type.create(clean(v) as never)) as Obj) : {});

  const itemSwap = real(defaults['itemSwap']) as ItemSwap | undefined;
  const encounterOf = (preset: unknown): Encounter | undefined => {
    const e = (real(preset) as Obj | undefined)?.['encounter'];
    if (e === undefined || e === null) return undefined;
    if (isStub(e)) {
      notes.push(`Encounter "${(preset as Obj)['name']}" is built by UI code upstream and is not extracted.`);
      return undefined;
    }
    return clean(e) as Encounter;
  };
  const encounter = encounterOf(defaults['encounter']);
  const setup: Obj = {
    race: raceId,
    professions: [
      professionName(other['profession1']) ?? 'Engineering',
      professionName(other['profession2']),
    ].filter(Boolean),
    talents: talentsString,
    gearSetId: defaultGearId ?? null,
    ...(itemSwap ? { itemSwap: ItemSwap.toJson(ItemSwap.create(clean(itemSwap) as ItemSwap)) } : {}),
    rotationId: defaultRotationId ?? null,
    consumables: json(ConsumesSpec, consumables),
    specOptions: specOptionsJson(specOptions),
    individualBuffs: json(IndividualBuffs, defaults['individualBuffs']),
    partyBuffs: json(PartyBuffs, defaults['partyBuffs']),
    raidBuffs: json(RaidBuffs, defaults['raidBuffs']),
    debuffs: json(Debuffs, defaults['debuffs']),
    playerOptions: {
      distanceFromTarget: (other['distanceFromTarget'] as number) || 0,
      channelClipDelayMs: (other['channelClipDelay'] as number) || 0,
      reactionTimeMs: (other['reactionTime'] as number) || 100,
      reactionTimeMaxMs: (other['reactionTimeMax'] as number) || 0,
      inFrontOfTarget: !!real(defaults['settings']) && !!other['inFrontOfTarget'],
    },
    ...(encounter ? { encounter: Encounter.toJson(Encounter.create(encounter)) } : {}),
  };

  // Builds: the defaults with the build applied, as upstream applyBuild does.
  const builds: Obj[] = [];
  for (const b of list('builds')) {
    const name = b['name'] as string;
    const group = b['group'] as string | undefined;
    const s: Obj = structuredClone(setup);
    const pOpts = s['playerOptions'] as Obj;
    const gear = real(b['gear']) as Obj | undefined;
    if (gear) s['gearSetId'] = addGear(name, gear['gear'] as EquipmentSpec, group ? { group } : {});
    const t = ((real(b['talents']) as Obj | undefined)?.['data'] as Obj | undefined)?.['talentsString'];
    if (typeof t === 'string' && t) {
      s['talents'] = t;
      addTalents(name, t);
    }
    const r = ((real(b['rotation']) as Obj | undefined)?.['rotation'] as Obj | undefined)?.['rotation'] as
      APLRotation | undefined;
    if (r && r.type === APLRotationType.TypeAPL) s['rotationId'] = addApl(name, r, group ? { group } : {});
    else if (r || b['rotationType']) {
      // The site builds a simple or auto rotation into an APL in the browser. Take the APL preset named like the
      // build or its group (Arms build -> "Arms" APL), else keep the default one.
      const wanted = [slug(name), group ? slug(group) : '', group ? slug(`${group} ${name}`) : ''].filter(
        Boolean,
      );
      const match = rotations.find((x) => x['kind'] === 'apl' && wanted.includes(x['id'] as string));
      if (match) s['rotationId'] = match['id'];
      notes.push(
        `Build "${[group, name].filter(Boolean).join(' ')}" uses a simple/auto rotation upstream; here it uses the APL preset "${s['rotationId']}".`,
      );
    }
    const st = real(b['settings']) as Obj | undefined;
    if (st) {
      const race = real(st['race']) as number | undefined;
      if (race) s['race'] = Object.entries(info.races).find(([, v]) => v === race)?.[0] ?? s['race'];
      const po = (real(st['playerOptions']) ?? {}) as Obj;
      if (real(st['consumables'])) s['consumables'] = json(ConsumesSpec, st['consumables']);
      const profs = s['professions'] as (string | undefined)[];
      if (po['profession1']) profs[0] = professionName(po['profession1']);
      if (po['profession2']) profs[1] = professionName(po['profession2']);
      s['professions'] = profs.filter(Boolean);
      if (typeof po['distanceFromTarget'] === 'number')
        pOpts['distanceFromTarget'] = po['distanceFromTarget'];
      if (typeof po['reactionTimeMs'] === 'number') {
        pOpts['reactionTimeMs'] = po['reactionTimeMs'];
        pOpts['reactionTimeMaxMs'] = (po['reactionTimeMaxMs'] as number | undefined) ?? 0;
      }
      if (typeof po['channelClipDelayMs'] === 'number')
        pOpts['channelClipDelayMs'] = po['channelClipDelayMs'];
      if (typeof po['inFrontOfTarget'] === 'boolean') pOpts['inFrontOfTarget'] = po['inFrontOfTarget'];
      if (real(st['specOptions'])) {
        // Upstream spreads the build's options over the current ones; with whole proto messages that is a replace.
        s['specOptions'] = specOptionsJson(st['specOptions']);
      }
      if (real(st['raidBuffs'])) s['raidBuffs'] = json(RaidBuffs, st['raidBuffs']);
      if (real(st['partyBuffs'])) s['partyBuffs'] = json(PartyBuffs, st['partyBuffs']);
      if (real(st['buffs'])) s['individualBuffs'] = json(IndividualBuffs, st['buffs']);
      if (real(st['debuffs'])) s['debuffs'] = json(Debuffs, st['debuffs']);
    }
    const enc = encounterOf(b['encounter']);
    if (enc) s['encounter'] = Encounter.toJson(Encounter.create(enc));
    let id = slug([group, name].filter(Boolean).join(' ')) || 'build';
    while (builds.some((x) => x['id'] === id)) id += '-2';
    builds.push({ id, name, ...(group ? { group } : {}), setup: s });
  }

  if (!list('builds').length) missing.push('builds');
  if (!rotations.some((r) => r['kind'] === 'apl')) missing.push('apl-rotation');

  return { gearSets, talents, rotations, defaults: setup, builds, notes, missing };
}

export const raceProto = Race;
