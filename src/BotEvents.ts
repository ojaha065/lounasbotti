import bolt, { SectionBlock } from "@slack/bolt";
import { Job, scheduleJob, Range } from "node-schedule";

import * as Utils from "./Utils.js";

import { LounasDataProvider, LounasResponse } from "./model/LounasDataProvider.js";
import { Restaurant, RestaurantNameMap, Settings } from "./model/Settings.js";

import * as LounasRepository from "./model/LounasRepository.js";
import BlockParsers from "./BlockParsers.js";
import { BlockCollection, Blocks, Md } from "slack-block-builder";

const AUTO_TRUNCATE_TIMEOUT = 1000 * 60 * 60 * 6; // 6 hrs
const TOMORROW_REQUEST_REGEXP = /huomenna|tomorrow/i;

const voters: Record<string, Record<string, string[]>> = {};
const toBeTruncated: { channel: string, ts: string }[] = [];

let prefetchJob: Job;
const lounasCache: Record<string, { data: LounasResponse[], blocks: (bolt.Block | bolt.KnownBlock)[] }> = {};

// eslint-disable-next-line max-params
const initEvents = (app: bolt.App, settings: Settings, dataProvider: LounasDataProvider, restartJob: Job | undefined, version: string): void => {
	prefetchJob = scheduleJob({
		second: 30,
		minute: 30,
		hour: 10,
		dayOfWeek: new Range(1, 5),
		tz: "Europe/Helsinki",

	}, () => {
		console.debug("Prefetching data...");
		getDataAndCache(dataProvider, settings);
	});

	app.message("!clearCache", async ({say}) => {
		Utils.clearObject(lounasCache);
		say("OK! Cache cleared");
	});

	app.action("githubButtonLinkAction", async ({ack}) => {
		console.debug("GitHub link opened!");
		ack();
	});

	app.event("app_home_opened", async args => {
		args.client.views.publish({
			user_id: args.event.user,
			view: BlockParsers.parseHomeTabView({settings, version, restartJob, prefetchJob, userId: args.event.user})
		});
	});

	if (settings.additionalRestaurants?.length) {
		app.action({type: "block_actions", action_id: RegExp(`fetchAdditionalRestaurant-(?:${settings.additionalRestaurants.join("|")})`)}, async args => {
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
	
				const blocks: (bolt.Block | bolt.KnownBlock)[] = message["blocks"];
				if (!blocks || !blocks.length) {
					throw new Error("No blocks found in message body");
				}
	
				const cachedData = await getDataAndCache(dataProvider, settings);
				const lounasResponse: LounasResponse | undefined = cachedData.data.find(lounasResponse => lounasResponse.restaurant === actionValue);
				if (!lounasResponse) {
					throw new Error(`Could not find data for restaurant ${actionValue}`);
				}
	
				// FIXME: There has to be a better way for this
				const firstDividerIndex: number = blocks.findIndex(block => block.type === "divider");
				if (firstDividerIndex < 1) {
					throw new Error("Error parsing blocks (divider)");
				}

				const newBlocks = BlockParsers.parseLounasBlock(lounasResponse, settings);
				const newIndex = firstDividerIndex + 2 + newBlocks.length;
				blocks.splice(firstDividerIndex, 0, ...newBlocks);

				if (blocks[newIndex].type !== "actions") {
					throw new Error("Error parsing blocks (actions)");
				}
				let elements = (blocks[newIndex] as bolt.ActionsBlock).elements;
				elements = elements.filter(element => (element as bolt.ButtonAction).value !== actionValue);
				if (elements.length) {
					(blocks[newIndex] as bolt.ActionsBlock).elements = elements;
				} else {
					blocks.splice(newIndex - 1, 3);
				}

				let lounasMessage: LounasRepository.LounasMessageEntry | undefined;
				try {
					if (settings.debug?.noDb) {
						throw new Error("Database connection is disabled by debug config");
					}
	
					lounasMessage = await LounasRepository.find(message.ts, args.body.channel.id);
				} catch (error) {
					console.error(error);
				}
				if (lounasMessage) {
					updateVoting(lounasMessage, blocks, settings.displayVoters);
				}
	
				args.respond({
					response_type: "in_channel",
					replace_original: true,
					blocks: blocks
				});
			} catch (error) {
				console.error(error);
			} finally {
				args.ack();
			}
		});
	}

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
				}
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

	app.message(/!(lounas|ruokaa|nälkä)/i, async args => {
		if (args.message.subtype) {
			return Promise.resolve();
		}

		const isTomorrowRequest = !!args.message.text && TOMORROW_REQUEST_REGEXP.test(args.message.text);
		if (isTomorrowRequest) {
			console.debug("Tomorrow request!");
		}
	
		const cachedData = await getDataAndCache(dataProvider, settings, isTomorrowRequest);
		cachedData.blocks.push(BlockCollection(Blocks.Context().elements(
			`${Md.emoji("alarm_clock")} Tämä viesti poistetaan automaattisesti 6 tunnin kuluttua\n${Md.emoji("robot_face")} Pyynnön lähetti ${Md.user(args.message.user)}`
		))[0]);

		const response = await args.say(cachedData);
	
		if (response.ok && response.ts) {
			if (!settings.debug?.noDb && !isTomorrowRequest) {
				LounasRepository.create({
					ts: response.ts,
					channel: response.channel || args.event.channel,
					menu: cachedData.data.map(lounasResponse => {
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
	
			// Something to think about: Is the reference to app always usable after 6 hrs? Should be as JS uses Call-by-Sharing and App is never reassigned.
			setTimeout(truncateMessage.bind(null, app), AUTO_TRUNCATE_TIMEOUT);
		} else {
			console.warn("Response not okay!");
			console.debug(response);
		}
	
		return Promise.resolve();
	});
};

export { initEvents };

function truncateMessage(app: bolt.App): void {
	const message = toBeTruncated.shift();
	if (!message) {
		return console.warn("Nothing to truncate!");
	}

	app.client.chat.update({
		channel: message.channel,
		ts: message.ts,
		blocks: [], // Remove all blocks
		text: Md.italic("Viesti poistettiin")
	});
}

async function getDataAndCache(dataProvider: LounasDataProvider, settings: Settings, tomorrowRequest = false): Promise<{ data: LounasResponse[], blocks: (bolt.Block | bolt.KnownBlock)[] }> {
	try {
		const now = new Date();
		const cacheIdentifier = `${now.getUTCDate()}${now.getUTCMonth()}${now.getUTCFullYear()}${tomorrowRequest}`;
	
		if (lounasCache[cacheIdentifier]) {
			return Promise.resolve(Utils.deepClone(lounasCache[cacheIdentifier]));
		}
	
		const data: LounasResponse[] = await dataProvider.getData(settings.defaultRestaurants, settings.additionalRestaurants, tomorrowRequest);
		const hasDate = data.filter(lounas => lounas.date);
		const header = `Lounaslistat${hasDate.length ? ` (${hasDate[0].date})` : ""}`;
	
		const parsedData: { data: LounasResponse[], text: string, blocks: (bolt.Block | bolt.KnownBlock)[] } = {
			data,
			text: header, // Slack recommends having this
			blocks: BlockParsers.parseMainBlocks(data, header, settings, tomorrowRequest)
		};

		if (data.filter(lounasResponse => lounasResponse.error).length) {
			console.warn("This result won't be cached as it contained errors");
			return Promise.resolve(parsedData);
		}
	
		lounasCache[cacheIdentifier] = parsedData;
		return Promise.resolve(Utils.deepClone(lounasCache[cacheIdentifier]));
	} catch (error) {
		return Promise.reject(error);
	}
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

	blocks.forEach((block, index) => {
		if (block.type === "actions" && (block as bolt.ActionsBlock).elements?.find(element => element.action_id === "upvoteButtonAction")) {
			const actionBlock: bolt.ActionsBlock = block as bolt.ActionsBlock;
			const voteButtonValue: string | undefined = (actionBlock.elements[0] as bolt.Button).value;

			const upvotes: number = allVotes.filter(vote => vote === voteButtonValue).length;

			(actionBlock.elements[0] as bolt.Button).text.text = `:thumbsup: ${upvotes || ""}`;

			if (displayVoters) {
				const sectionIndex = index - 1;
				const section: SectionBlock = blocks[sectionIndex] as SectionBlock;

				const currentText: string | undefined = section.text?.text;
				if (currentText) {
					const voters: string | undefined = lounasMessage?.votes
						.filter(vote => vote.action === voteButtonValue)
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
						blocks[sectionIndex] = section;
					}
				} else {
					console.error("Section without text?");
				}
			}
		}
	});
}