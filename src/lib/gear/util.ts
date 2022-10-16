import { EquipmentSlot } from 'oldschooljs/dist/meta/types';

import { Gear } from '../structures/Gear';
import { itemID } from '../util';
import { toTitleCase } from '../util/toTitleCase';
import { GearSetup } from '.';
import { GearPreset } from '.prisma/client';

export function readableStatName(slot: string) {
	return toTitleCase(slot.replace('_', ' '));
}

export type PartialGearSetup = Partial<{
	[key in EquipmentSlot]: string;
}>;
export function constructGearSetup(setup: PartialGearSetup): Gear {
	return new Gear({
		'2h': setup['2h'] ? { item: itemID(setup['2h']), quantity: 1 } : null,
		ammo: setup.ammo ? { item: itemID(setup.ammo), quantity: 1 } : null,
		body: setup.body ? { item: itemID(setup.body), quantity: 1 } : null,
		cape: setup.cape ? { item: itemID(setup.cape), quantity: 1 } : null,
		feet: setup.feet ? { item: itemID(setup.feet), quantity: 1 } : null,
		hands: setup.hands ? { item: itemID(setup.hands), quantity: 1 } : null,
		head: setup.head ? { item: itemID(setup.head), quantity: 1 } : null,
		legs: setup.legs ? { item: itemID(setup.legs), quantity: 1 } : null,
		neck: setup.neck ? { item: itemID(setup.neck), quantity: 1 } : null,
		ring: setup.ring ? { item: itemID(setup.ring), quantity: 1 } : null,
		shield: setup.shield ? { item: itemID(setup.shield), quantity: 1 } : null,
		weapon: setup.weapon ? { item: itemID(setup.weapon), quantity: 1 } : null
	});
}

export function hasGracefulEquipped(setup: Gear) {
	return setup.hasEquipped(
		['Graceful hood', 'Graceful top', 'Graceful legs', 'Graceful boots', 'Graceful gloves', 'Graceful cape'],
		true
	);
}

export function gearPresetToGear(gearPreset: GearPreset) {
	const gear: GearSetup = {} as GearSetup;
	for (const key of ['cape', 'feet', 'hands', 'head', 'legs', 'neck', 'ring', 'shield', 'weapon', 'body'] as const) {
		const val = gearPreset[key];
		gear[key] = val !== null ? { item: val, quantity: 1 } : null;
	}

	gear.ammo = gearPreset.ammo ? { item: gearPreset.ammo, quantity: gearPreset.ammo_qty ?? 1 } : null;
	gear['2h'] = gearPreset.two_handed ? { item: gearPreset.two_handed, quantity: 1 } : null;
	return new Gear(gear);
}
