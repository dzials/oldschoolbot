import { activity_type_enum } from '@prisma/client';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, MessageCollector } from 'discord.js';
import { Bank } from 'oldschooljs';

import { calculateBirdhouseDetails } from '../../mahoji/lib/abstracted_commands/birdhousesCommand';
import { handleTriggerShootingStar } from '../../mahoji/lib/abstracted_commands/shootingStarsCommand';
import { updateGPTrackSetting, userStatsBankUpdate } from '../../mahoji/mahojiSettings';
import { ClueTiers } from '../clues/clueTiers';
import { BitField, COINS_ID, Emoji, PerkTier } from '../constants';
import { handleGrowablePetGrowth } from '../growablePets';
import { handlePassiveImplings } from '../implings';
import { triggerRandomEvent } from '../randomEvents';
import { getUsersCurrentSlayerInfo } from '../slayer/slayerUtil';
import { ActivityTaskOptions } from '../types/minions';
import { channelIsSendable } from '../util';
import {
	makeBirdHouseTripButton,
	makeDoClueButton,
	makeNewSlayerTaskButton,
	makeOpenCasketButton,
	makeRepeatTripButton
} from './globalInteractions';
import { sendToChannelID } from './webhook';

export const collectors = new Map<string, MessageCollector>();

const activitiesToTrackAsPVMGPSource: activity_type_enum[] = [
	'GroupMonsterKilling',
	'MonsterKilling',
	'Raids',
	'ClueCompletion'
];

const tripFinishEffects: {
	name: string;
	fn: (options: { data: ActivityTaskOptions; user: MUser; loot: Bank | null; messages: string[] }) => unknown;
}[] = [
	{
		name: 'Track GP Analytics',
		fn: ({ data, loot }) => {
			if (loot && activitiesToTrackAsPVMGPSource.includes(data.type)) {
				const GP = loot.amount(COINS_ID);
				if (typeof GP === 'number') {
					updateGPTrackSetting('gp_pvm', GP);
				}
			}
		}
	},
	{
		name: 'Implings',
		fn: async ({ data, messages, user }) => {
			const imp = handlePassiveImplings(user, data);
			if (imp && imp.bank.length > 0) {
				const many = imp.bank.length > 1;
				messages.push(`Caught ${many ? 'some' : 'an'} impling${many ? 's' : ''}, you received: ${imp.bank}`);
				userStatsBankUpdate(user.id, 'passive_implings_bank', imp.bank);
				await transactItems({ userID: user.id, itemsToAdd: imp.bank, collectionLog: true });
			}
		}
	},
	{
		name: 'Growable Pets',
		fn: async ({ data, messages, user }) => {
			await handleGrowablePetGrowth(user, data, messages);
		}
	},
	{
		name: 'Random Events',
		fn: async ({ data, messages, user }) => {
			await triggerRandomEvent(user, data.duration, messages);
		}
	}
];

export async function handleTripFinish(
	user: MUser,
	channelID: string,
	message: string,
	attachment: AttachmentBuilder | Buffer | undefined,
	data: ActivityTaskOptions,
	loot: Bank | null,
	_messages?: string[]
) {
	const { perkTier } = user;
	const messages: string[] = [];
	for (const effect of tripFinishEffects) await effect.fn({ data, user, loot, messages });

	const clueReceived = loot ? ClueTiers.find(tier => loot.amount(tier.scrollID) > 0) : undefined;

	if (_messages) messages.push(..._messages);
	if (messages.length > 0) {
		message += `\n**Messages:** ${messages.join(', ')}`;
	}

	if (clueReceived && perkTier < PerkTier.Two) {
		message += `\n${Emoji.Casket} **You got a ${clueReceived.name} clue scroll** in your loot.`;
	}

	const existingCollector = collectors.get(user.id);

	if (existingCollector) {
		existingCollector.stop();
		collectors.delete(user.id);
	}

	const channel = globalClient.channels.cache.get(channelID);
	if (!channelIsSendable(channel)) return;

	const components = new ActionRowBuilder<ButtonBuilder>();
	components.addComponents(makeRepeatTripButton());
	const casketReceived = loot ? ClueTiers.find(i => loot?.has(i.id)) : undefined;
	if (casketReceived) components.addComponents(makeOpenCasketButton(casketReceived));
	if (perkTier > PerkTier.One) {
		if (clueReceived) components.addComponents(makeDoClueButton(clueReceived));
		const birdHousedetails = await calculateBirdhouseDetails(user.id);
		if (birdHousedetails.isReady && !user.bitfield.includes(BitField.DisableBirdhouseRunButton))
			components.addComponents(makeBirdHouseTripButton());
		const { currentTask } = await getUsersCurrentSlayerInfo(user.id);
		if ((currentTask === null || currentTask.quantity_remaining <= 0) && data.type === 'MonsterKilling') {
			components.addComponents(makeNewSlayerTaskButton());
		}
	}
	handleTriggerShootingStar(user, data, components);

	sendToChannelID(channelID, {
		content: message,
		image: attachment,
		components: components.components.length > 0 ? [components] : undefined
	});
}
