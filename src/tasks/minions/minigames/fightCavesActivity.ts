import { calcPercentOfNum, calcWhatPercent } from 'e';
import { Bank, Monsters } from 'oldschooljs';
import TzTokJad from 'oldschooljs/dist/simulation/monsters/special/TzTokJad';

import { Emoji, Events } from '../../../lib/constants';
import { prisma } from '../../../lib/settings/prisma';
import { SkillsEnum } from '../../../lib/skilling/types';
import { calculateSlayerPoints, getUsersCurrentSlayerInfo } from '../../../lib/slayer/slayerUtil';
import { FightCavesActivityTaskOptions } from '../../../lib/types/minions';
import { formatDuration, percentChance, rand } from '../../../lib/util';
import chatHeadImage from '../../../lib/util/chatHeadImage';
import { formatOrdinal } from '../../../lib/util/formatOrdinal';
import { handleTripFinish } from '../../../lib/util/handleTripFinish';
import itemID from '../../../lib/util/itemID';
import { fightCavesCost } from '../../../mahoji/lib/abstracted_commands/fightCavesCommand';

const TokkulID = itemID('Tokkul');

export const fightCavesTask: MinionTask = {
	type: 'FightCaves',
	async run(data: FightCavesActivityTaskOptions) {
		const { userID, channelID, jadDeathChance, preJadDeathTime, duration, fakeDuration } = data;
		const user = await mUserFetch(userID);

		const tokkulReward = rand(2000, 6000);
		const diedToJad = percentChance(jadDeathChance);

		const { newUser } = await user.update({
			stats_fightCavesAttempts: {
				increment: 1
			}
		});

		const attemptsStr = `You have tried Fight caves ${newUser.stats_fightCavesAttempts}x times.`;

		// Add slayer
		const usersTask = await getUsersCurrentSlayerInfo(user.id);
		const isOnTask =
			usersTask.currentTask !== null &&
			usersTask.currentTask !== undefined &&
			usersTask.currentTask!.monster_id === Monsters.TzHaarKet.id &&
			usersTask.currentTask!.quantity_remaining === usersTask.currentTask!.quantity;

		if (preJadDeathTime) {
			let slayerMsg = '';
			if (isOnTask) {
				slayerMsg = ' **Task cancelled.**';

				await prisma.slayerTask.update({
					where: {
						id: usersTask.currentTask!.id
					},
					data: {
						quantity_remaining: 0,
						skipped: true
					}
				});
			}
			// Give back supplies based on how far in they died, for example if they
			// died 80% of the way through, give back approximately 20% of their supplies.
			const percSuppliesToRefund = 100 - calcWhatPercent(preJadDeathTime, fakeDuration);
			const itemLootBank = new Bank();

			for (const [item, qty] of fightCavesCost.items()) {
				const amount = Math.floor(calcPercentOfNum(percSuppliesToRefund, qty));
				if (amount > 0) {
					itemLootBank.add(item.id, amount);
				}
			}

			await transactItems({ userID: user.id, itemsToAdd: itemLootBank, collectionLog: false });

			return handleTripFinish(
				user,
				channelID,
				`${user} You died ${formatDuration(
					preJadDeathTime
				)} into your attempt.${slayerMsg} The following supplies were refunded back into your bank: ${itemLootBank}.`,
				await chatHeadImage({
					content: `You die before you even reach TzTok-Jad...atleast you tried, I give you ${tokkulReward}x Tokkul. ${attemptsStr}`,
					head: 'mejJal'
				}),
				data,
				itemLootBank
			);
		}

		if (diedToJad) {
			const failBank = new Bank({ [TokkulID]: tokkulReward });
			await transactItems({ userID: user.id, collectionLog: true, itemsToAdd: failBank });

			const rangeXP = await user.addXP({ skillName: SkillsEnum.Ranged, amount: 46_080, duration });
			const hpXP = await user.addXP({ skillName: SkillsEnum.Hitpoints, amount: 15_322, duration });

			let msg = `${rangeXP}. ${hpXP}.`;
			if (isOnTask) {
				const slayXP = await user.addXP({ skillName: SkillsEnum.Slayer, amount: 11_760, duration });
				msg = `**Slayer task cancelled.** \n${msg} ${slayXP}.`;

				await prisma.slayerTask.update({
					where: {
						id: usersTask.currentTask!.id
					},
					data: {
						quantity_remaining: 0,
						skipped: true
					}
				});
			}

			return handleTripFinish(
				user,
				channelID,
				`${user} ${msg}`,
				await chatHeadImage({
					content: `TzTok-Jad stomp you to death...nice try though JalYt, for your effort I give you ${tokkulReward}x Tokkul. ${attemptsStr}.`,
					head: 'mejJal'
				}),
				data,
				failBank
			);
		}

		await user.incrementKC(Monsters.TzTokJad.id, 1);
		const loot = Monsters.TzTokJad.kill(1, { onSlayerTask: isOnTask });

		if (loot.has('Tzrek-jad')) {
			globalClient.emit(
				Events.ServerNotification,
				`**${user.usernameOrMention}** just received their ${formatOrdinal(user.cl.amount('Tzrek-jad') + 1)} ${
					Emoji.TzRekJad
				} TzRek-jad pet by killing TzTok-Jad, on their ${formatOrdinal(user.getKC(TzTokJad.id))} kill!`
			);
		}

		if (user.cl.amount('Fire cape') === 0) {
			globalClient.emit(
				Events.ServerNotification,
				`**${user.usernameOrMention}** just received their first Fire cape on their ${formatOrdinal(
					newUser.stats_fightCavesAttempts
				)} attempt!`
			);
		}

		await transactItems({
			userID: user.id,
			collectionLog: true,
			itemsToAdd: loot
		});

		const rangeXP = await user.addXP({ skillName: SkillsEnum.Ranged, amount: 47_580, duration });
		const hpXP = await user.addXP({ skillName: SkillsEnum.Hitpoints, amount: 15_860, duration });

		let msg = `${rangeXP}. ${hpXP}.`;
		if (isOnTask) {
			const { newUser } = await user.update({
				slayer_task_streak: {
					increment: 1
				}
			});

			// 25,250 for Jad + 11,760 for waves.
			const slayerXP = 37_010;
			const currentStreak = newUser.slayer_task_streak;
			const points = await calculateSlayerPoints(currentStreak, usersTask.slayerMaster!, user);

			const secondNewUser = await user.update({
				slayer_points: {
					increment: points
				}
			});

			await prisma.slayerTask.update({
				where: {
					id: usersTask.currentTask!.id
				},
				data: {
					quantity_remaining: 0
				}
			});

			const slayXP = await user.addXP({ skillName: SkillsEnum.Slayer, amount: slayerXP, duration });
			const xpMessage = `${msg} ${slayXP}`;

			msg = `Jad task completed. ${xpMessage}. \n**You've completed ${currentStreak} tasks and received ${points} points; giving you a total of ${secondNewUser.newUser.slayer_points}; return to a Slayer master.**`;
			// End slayer code
		}

		handleTripFinish(
			user,
			channelID,
			`${user} ${msg}`,
			await chatHeadImage({
				content: `You defeated TzTok-Jad for the ${formatOrdinal(
					user.getKC(Monsters.TzTokJad.id)
				)} time! I am most impressed, I give you... ${loot}.`,
				head: 'mejJal'
			}),
			data,
			loot
		);
	}
};
