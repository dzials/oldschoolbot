import { calcWhatPercent, percentChance, reduceNumByPercent, Time } from 'e';
import { CommandResponse } from 'mahoji/dist/lib/structures/ICommand';
import { Bank, Monsters } from 'oldschooljs';
import TzTokJad from 'oldschooljs/dist/simulation/monsters/special/TzTokJad';
import { itemID } from 'oldschooljs/dist/util';

import { getUsersCurrentSlayerInfo } from '../../../lib/slayer/slayerUtil';
import { FightCavesActivityTaskOptions } from '../../../lib/types/minions';
import { formatDuration, rand } from '../../../lib/util';
import addSubTaskToActivityTask from '../../../lib/util/addSubTaskToActivityTask';
import { newChatHeadImage } from '../../../lib/util/chatHeadImage';
import { updateBankSetting } from '../../mahojiSettings';

export const fightCavesCost = new Bank({
	'Prayer potion(4)': 10,
	'Saradomin brew(4)': 6,
	'Super restore(4)': 4
});

function determineDuration(user: MUser): [number, string] {
	let baseTime = Time.Hour * 2;
	const gear = user.gear.range;
	let debugStr = '';

	// Reduce time based on KC
	const jadKC = user.getKC(TzTokJad.id);
	const percentIncreaseFromKC = Math.min(50, jadKC);
	baseTime = reduceNumByPercent(baseTime, percentIncreaseFromKC);
	debugStr += `${percentIncreaseFromKC}% from KC`;

	// Reduce time based on Gear
	const usersRangeStats = gear.stats;
	const percentIncreaseFromRangeStats = Math.floor(calcWhatPercent(usersRangeStats.attack_ranged, 236)) / 2;
	baseTime = reduceNumByPercent(baseTime, percentIncreaseFromRangeStats);

	if (user.hasEquippedOrInBank('Twisted bow')) {
		debugStr += ', 15% from Twisted bow';
		baseTime = reduceNumByPercent(baseTime, 15);
	}

	debugStr += `, ${percentIncreaseFromRangeStats}% from Gear`;

	return [baseTime, debugStr];
}

function determineChanceOfDeathPreJad(user: MUser) {
	const attempts = user.user.stats_fightCavesAttempts;
	let deathChance = Math.max(14 - attempts * 2, 5);

	// -4% Chance of dying before Jad if you have SGS.
	if (user.hasEquipped(itemID('Saradomin godsword'))) {
		deathChance -= 4;
	}

	return deathChance;
}

function determineChanceOfDeathInJad(user: MUser) {
	const attempts = user.user.stats_fightCavesAttempts;
	const chance = Math.floor(100 - (Math.log(attempts) / Math.log(Math.sqrt(15))) * 50);

	// Chance of death cannot be 100% or <5%.
	return Math.max(Math.min(chance, 99), 5);
}

function checkGear(user: MUser): string | undefined {
	const gear = user.gear.range;
	const equippedWeapon = gear.equippedWeapon();

	const usersRangeStats = gear.stats;

	if (!equippedWeapon || !equippedWeapon.weapon || !['crossbow', 'bow'].includes(equippedWeapon.weapon.weapon_type)) {
		return 'JalYt, you not wearing ranged weapon?! TzTok-Jad stomp you to death if you get close, come back with a bow or a crossbow.';
	}

	if (usersRangeStats.attack_ranged < 160) {
		return 'JalYt, your ranged gear not strong enough! You die very quickly with your bad gear, come back with better range gear.';
	}

	if (!user.owns(fightCavesCost)) {
		return `JalYt, you need supplies to have a chance in the caves...come back with ${fightCavesCost}.`;
	}

	if (user.skillLevel('prayer') < 43) {
		return 'JalYt, come back when you have atleast 43 Prayer, TzTok-Jad annihilate you without protection from gods.';
	}
}

export async function fightCavesCommand(user: MUser, channelID: string): CommandResponse {
	const gearFailure = checkGear(user);
	if (gearFailure) {
		return {
			files: [
				{ attachment: await newChatHeadImage({ content: gearFailure, head: 'mejJal' }), name: 'fightcaves.jpg' }
			]
		};
	}

	let [duration, debugStr] = determineDuration(user);
	const jadDeathChance = determineChanceOfDeathInJad(user);
	const preJadDeathChance = determineChanceOfDeathPreJad(user);

	const attempts = user.user.stats_fightCavesAttempts;
	const usersRangeStats = user.gear.range.stats;
	const jadKC = user.getKC(TzTokJad.id);

	duration += (rand(1, 5) * duration) / 100;

	await user.removeItemsFromBank(fightCavesCost);

	// Add slayer
	const usersTask = await getUsersCurrentSlayerInfo(user.id);
	const isOnTask =
		usersTask.currentTask !== null &&
		usersTask.currentTask !== undefined &&
		usersTask.currentTask!.monster_id === Monsters.TzHaarKet.id &&
		usersTask.currentTask!.quantity_remaining === usersTask.currentTask!.quantity;

	// 15% boost for on task
	if (isOnTask && user.hasEquippedOrInBank('Black mask (i)')) {
		duration *= 0.85;
		debugStr += ', 15% on Task with Black mask (i)';
	}

	const diedPreJad = percentChance(preJadDeathChance);
	const fakeDuration = duration;
	duration = diedPreJad ? rand(Time.Minute * 20, duration) : duration;
	const preJadDeathTime = diedPreJad ? duration : null;

	await addSubTaskToActivityTask<FightCavesActivityTaskOptions>({
		userID: user.id,
		channelID: channelID.toString(),
		quantity: 1,
		duration,
		type: 'FightCaves',
		jadDeathChance,
		preJadDeathChance,
		preJadDeathTime,
		fakeDuration
	});

	updateBankSetting('economyStats_fightCavesCost', fightCavesCost);

	const totalDeathChance = (((100 - preJadDeathChance) * (100 - jadDeathChance)) / 100).toFixed(1);

	return {
		content: `**Duration:** ${formatDuration(fakeDuration)} (${(fakeDuration / 1000 / 60).toFixed(2)} minutes)
**Boosts:** ${debugStr}
**Range Attack Bonus:** ${usersRangeStats.attack_ranged}
**Jad KC:** ${jadKC}
**Attempts:** ${attempts}

**Removed from your bank:** ${fightCavesCost}`,
		files: [
			{
				attachment: await newChatHeadImage({
					content: `You're on your own now JalYt, prepare to fight for your life! I think you have ${totalDeathChance}% chance of survival.`,
					head: 'mejJal'
				}),
				name: 'fightcaves.jpg'
			}
		]
	};
}
