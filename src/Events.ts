import bolt from "@slack/bolt";
import { Job } from "node-schedule";

import { LounasDataProvider, LounasResponse } from "./model/LounasDataProvider.js";
import { Restaurant, RestaurantNameMap, Settings } from "./model/Settings.js";

import * as LounasRepository from "./model/LounasRepository.js";

const AUTO_TRUNCATE_TIMEOUT = 1000 * 60 * 60 * 6; // 6 hrs

const voters: Record<string, Record<string, string[]>> = {};
const toBeTruncated: { channel: string, ts: string }[] = [];

const initEvents = (app: bolt.App, settings: Settings): void => {
	app.action("githubButtonLinkAction", async ({ack}) => {
		console.debug("GitHub link opened!");
		ack();
	});

	app.action({type: "block_actions", action_id: "upvoteButtonAction"}, async args => {
		try {
			const message = args.body.message;
			if (!message) {
				throw new Error("Message not found from action body");
			}
	
			const actionValue: string = (args.action as bolt.ButtonAction).value;
			if (!actionValue) {
				throw new Error("No actionValue!");
			}

			if (!args.body.channel) {
				throw new Error("Event is not from channel!");
			}

			console.debug(`Action "${actionValue}" received from "${args.body.user.name}"`);

			let lounasMessage: LounasRepository.LounasMessageEntry | undefined;
			try {
				if (settings.debug?.noDb) {
					throw new Error("Database connection is disabled by debug config");
				}

				lounasMessage = await LounasRepository.find(message.ts, args.body.channel.id);
			} catch (error) {
				console.error(error);
			}

			const blocks: (bolt.Block | bolt.KnownBlock)[] = message["blocks"];
			if (!blocks || !blocks.length) {
				throw new Error("No blocks found in message body");
			}

			if (lounasMessage) {
				if (lounasMessage.votes.find(vote => vote.userId === args.body.user.id && vote.action === actionValue)) {
					return handleAlreadyVoted(args, actionValue);
				}
			} else {
				if (voters[message.ts]?.[args.body.user.id || "notFound"]?.includes(actionValue)) {
					return handleAlreadyVoted(args, actionValue);
				}
			}

			if (lounasMessage) {
				try {
					lounasMessage = await LounasRepository.addVote(message.ts, args.body.user.id, actionValue);
					updateVoting(lounasMessage, blocks, settings.displayVoters);
				} catch (error) {
					console.error(error);
					updateVotingLegacy(blocks, actionValue, settings.displayVoters, args);
				}
			} else {
				updateVotingLegacy(blocks, actionValue, settings.displayVoters, args);
			}

			args.respond({
				response_type: "in_channel",
				replace_original: true,
				blocks: blocks
			});

			if (!voters[message.ts]) {
				voters[message.ts] = {};
			}
	
			if (voters[message.ts][args.body.user.id]) {
				voters[message.ts][args.body.user.id].push(actionValue);
			} else {
				voters[message.ts][args.body.user.id] = [actionValue];
			}
		} catch (error) {
			console.error(error);
		} finally {
			args.ack();
		}
	});
};

// eslint-disable-next-line max-params
const handleLounas = async (args: bolt.SlackEventMiddlewareArgs<"message">, dataProvider: LounasDataProvider, settings: Settings, appRef: bolt.App): Promise<null> => {
	if (args.message.subtype) {
		return Promise.resolve(null);
	}
	
	const data: LounasResponse[] = await dataProvider.getData(settings.defaultRestaurants);
	const hasDate = data.filter(lounas => lounas.date);
	const header = `Lounaslistat${hasDate.length ? ` (${hasDate[0].date})` : ""}`;

	const lounasBlocks: (bolt.Block | bolt.KnownBlock)[] = [];
	data.forEach(lounasResponse => {
		const lounasBlock: (bolt.Block | bolt.KnownBlock) = {
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*${RestaurantNameMap[lounasResponse.restaurant]}*\n${((lounasResponse.items || [lounasResponse.error]).map(item => `  ${getEmojiForLounasItem(item?.toString(), settings)} ${item}`).join("\n"))}`
			},
		};

		if (lounasResponse.items) {
			lounasBlock.accessory = {
				type: "button",
				text: {
					type: "plain_text",
					text: ":thumbsup:",
					emoji: true
				},
				value: `upvote-${lounasResponse.restaurant}`,
				action_id: "upvoteButtonAction"
			};
		}

		lounasBlocks.push(lounasBlock);
	});

	const response = await args.say({
		text: header, // Fallback for notifications
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: header
				}
			},
			...lounasBlocks,
			{
				type: "divider"
			},
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `:alarm_clock: Tämä viesti poistetaan automaattisesti 6 tunnin kuluttua\n:robot_face: Pyynnön lähetti <@${args.message.user}>`
					},
				]
			
			}
		]
	});

	if (response.ok && response.ts) {
		if (!settings.debug?.noDb) {
			LounasRepository.create({
				ts: response.ts,
				channel: response.channel || args.event.channel,
				menu: data.map(lounasResponse => {
					return {restaurant: lounasResponse.restaurant, items: lounasResponse.items || null};
				}),
				date: new Date(),
				votes: []
			}).catch(error => {
				console.error(error);
			});
		}

		toBeTruncated.push({
			channel: args.event.channel,
			ts: response.ts
		});

		// Something to think about: Is the reference to app always usable after 8 hrs? Should be as JS uses Call-by-Sharing and App is never reassigned.
		setTimeout(truncateMessage.bind(null, appRef), AUTO_TRUNCATE_TIMEOUT);
	} else {
		console.warn("Response not okay!");
		console.debug(response);
	}

	return Promise.resolve(null);
};

const handleHomeTab = async (args: bolt.SlackEventMiddlewareArgs<"app_home_opened"> & bolt.AllMiddlewareArgs, version: string, restartJob: Job | undefined) => {
	return args.client.views.publish({
		user_id: args.event.user,
		view: {
			type: "home",
			blocks: [
				{
					type: "header",
					text: {
						type: "plain_text",
						text: `Lounasbotti V${version}`
					}
				},
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "_By @Jani_"
					}
				},
				{
					type: "divider"
				},
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `Tervehdys <@${args.event.user}>, nimeni on Lounasbotti. Kutsu minua komennoilla *!lounas* tai *!ruokaa* millä tahansa kanavalla, jonne minut on kutsuttu ja haen päivän lounaslistat valonnopeudella! _...tai ainakin yritän..._`
					}
				},
				{
					type: "section",
					text: {
						type: "plain_text",
						text: "Voit myös avata yksityisen chatin kanssani ja käyttää edellä mainittuja komentoja siellä."
					}
				},
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "_Olen vielä beta-versio, mutta voit auttaa minua kehittymään paremmaksi_ -->"
					},
					accessory: {
						type: "button",
						text: {
							type: "plain_text",
							text: ":link: GitHub",
							emoji: true
						},
						url: "https://github.com/ojaha065/lounasbotti",
						action_id: "githubButtonLinkAction"
					}
				},
				{
					type: "context",
					elements: [
						{
							type: "plain_text",
							text: restartJob ? `Debug information: Next scheduled restart is at ${restartJob.nextInvocation().toLocaleString("en-US")}` : "---"
						}
					]
				
				}
			]
		}
	});
};

export { initEvents, handleLounas, handleHomeTab };

function truncateMessage(app: bolt.App): void {
	const message = toBeTruncated.shift();
	if (!message) {
		return console.warn("Nothing to truncate!");
	}

	app.client.chat.update({
		channel: message.channel,
		ts: message.ts,
		blocks: [], // Remove all blocks
		text: "_Viesti poistettiin_"
	});
}

function handleAlreadyVoted(args: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.BlockElementAction>> & bolt.AllMiddlewareArgs, actionValue: string) {
	console.debug(`User ${args.body.user.name} has already voted`);
	args.respond({
		response_type: "ephemeral",
		replace_original: false,
		delete_original: false,
		text: `Hei, <@${args.body.user.id}>! Olet jo äänestänyt vaihtoehtoa ${RestaurantNameMap[Restaurant[actionValue.replace("upvote-", "") as Restaurant]] || "tuntematon"}. Voit äänestää kutakin vaihtoehtoa vain kerran.`
	});
	return;
}

// eslint-disable-next-line max-params
function updateVoting(lounasMessage: LounasRepository.LounasMessageEntry, blocks: (bolt.Block | bolt.KnownBlock)[], displayVoters: boolean) {
	const allVotes: string[] = lounasMessage.votes.map(vote => vote.action);

	blocks.forEach(block => {
		if (block.type === "section" && (block as bolt.SectionBlock).accessory?.type === "button") {
			const section: bolt.SectionBlock = block as bolt.SectionBlock;
			const sectionVoteAction: string | undefined = (section.accessory as bolt.Button).value;

			const upvotes: number = allVotes.filter(vote => vote === sectionVoteAction).length;

			(section.accessory as bolt.Button).text.text = `:thumbsup: ${upvotes || ""}`;

			if (displayVoters) {
				const currentText: string | undefined = section.text?.text;
				if (currentText) {
					const voters: string | undefined = lounasMessage?.votes
						.filter(vote => vote.action === sectionVoteAction)
						.map(vote => vote.userId)
						.map(id => `<@${id}>`)
						.join(" ");

					const split = currentText.split("\n");
					if (split[1].includes("<@")) {
						split[1] = voters || "";
					} else if (voters) {
						split.splice(1, 0, voters);
					}

					if (section.text) {
						section.text.text = split.join("\n");
					}
				} else {
					console.error("Section without text?");
				}
			}
		}
	});
}

function getEmojiForLounasItem(lounasItem = "", settings: Settings): string {
	if (settings.emojiRules) {
		for (const [key, value] of settings.emojiRules) {
			if (key.test(lounasItem)) {
				return value;
			}
		}
	}

	return "*";
}

/**
 * @deprecated
 */
// eslint-disable-next-line max-params
function updateVotingLegacy(blocks: (bolt.Block | bolt.KnownBlock)[], actionValue: string, displayVoters: boolean, args: bolt.SlackActionMiddlewareArgs<bolt.BlockAction<bolt.BlockElementAction>> & bolt.AllMiddlewareArgs) {
	const sections: any[] = blocks.filter(b => b.type === "section");
	const votedSectionIndex = sections.findIndex(s => s.accessory?.value === actionValue);

	if (votedSectionIndex < 0) {
		throw new Error(`Block with value ${actionValue} not found`);
	}

	const split: string[] | undefined = sections[votedSectionIndex].accessory.text?.text?.split(" ");
	if (!split) {
		throw new Error("Could not find text in button");
	}

	const currentNumberOfUpvotes: number = split.length === 2 ? Number(split[1]) : 0;

	sections[votedSectionIndex].accessory.text.text = `:thumbsup: ${currentNumberOfUpvotes + 1}`;

	if (displayVoters) {
		const currentText: string | undefined = sections[votedSectionIndex].text?.text;
		if (currentText) {
			const split = currentText.split("\n");

			if (split[1].includes("<@")) {
				split[1] += ` <@${args.body.user.id}>`;
			} else {
				split.splice(1, 0, `<@${args.body.user.id}>`);
			}

			sections[votedSectionIndex].text.text = split.join("\n");
		} else {
			console.error("Section without text?");
		}
	}
}