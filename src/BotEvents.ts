import type {Button, GenericMessageEvent, SectionBlock, SlackCommandMiddlewareArgs } from "@slack/bolt";
import type bolt from "@slack/bolt";

import * as Utils from "./Utils.js";

import type { LounasResponse } from "./model/dataProviders/LounasDataProvider.js";
import type { Settings } from "./model/Settings.js";
import { Restaurant } from "./model/Settings.js";

import * as LounasRepository from "./model/LounasRepository.js";
import BlockParsers from "./BlockParsers.js";
import { BlockCollection, Blocks, Md } from "slack-block-builder";
import type { StringIndexed } from "@slack/bolt/dist/types/helpers.js";
import { Range, scheduleJob } from "node-schedule";
import Holidays from "date-holidays";

type MessageMiddlewareArgs = bolt.SlackEventMiddlewareArgs<"message"> & bolt.AllMiddlewareArgs<StringIndexed>;
type CommandMiddlewareArgs = SlackCommandMiddlewareArgs & bolt.AllMiddlewareArgs<StringIndexed>;

const hd = new Holidays("FI", {
	types: ["public", "bank", "optional"]
});

const AUTO_TRUNCATE_TIMEOUT = 1000 * 60 * 60 * 6; // 6 hrs
const TOMORROW_REQUEST_REGEXP = /huomenna|tomorrow/i;

const toBeTruncated: { channel: string, ts: string }[] = [];
const lounasCache: Record<string, { data: LounasResponse[], blocks: (bolt.Block | bolt.KnownBlock)[] }> = {};

// eslint-disable-next-line max-params
const initEvents = (app: bolt.App, settings: Settings): void => {
	global.LOUNASBOTTI_JOBS.subscriptions = scheduleJob({
		second: 30,
		minute: 30,
		hour: 10,
		dayOfWeek: new Range(1, 5),
		tz: "Europe/Helsinki",

	}, () => {
		console.debug("Handling subscriptions...");
		if (!hd.isHoliday(new Date())) {
			mainTrigger(false);
		}
	});

	// Automatic cache clearing
	global.LOUNASBOTTI_JOBS.cacheClearing = scheduleJob({
		second: 15,
		minute: 15,
		hour: 0,
		dayOfWeek: 0,
		tz: "Europe/Helsinki"
	}, () => Utils.clearObject(lounasCache));

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
			view: BlockParsers.parseHomeTabView({settings, userId: args.event.user})
		});
	});

	// Fetch additional
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
				if (!blocks?.length) {
					throw new Error("No blocks found in message body");
				}
	
				const cachedData = await getDataAndCache(settings, false, false, Restaurant[actionValue as Restaurant]);
				const lounasResponse: LounasResponse | undefined = cachedData.data.find(lounasResponse => lounasResponse.restaurant === actionValue);
				if (!lounasResponse) {
					throw new Error(`Could not find data for restaurant ${actionValue}`);
				}

				const dividerIndex: number = blocks.findIndex(block => block.block_id === "additionalRestaurantsDivider");
				if (dividerIndex < 1) {
					throw new Error("Error parsing blocks (divider)");
				}

				// Append above the divider
				blocks.splice(dividerIndex, 0, ...BlockParsers.parseLounasBlock(lounasResponse, settings));

				// Remove the button
				const actionsBlock = blocks.find(block => block.block_id === "additionalRestaurantsActions") as bolt.ActionsBlock;
				if (!actionsBlock) {
					throw new Error("Error parsing blocks (actionsBlock)");
				}
				actionsBlock.elements = actionsBlock.elements.filter(element => (element as bolt.Button).value !== actionValue);

				// If all buttons are now removed, remove the whole actions block. Fixes invalid_blocks error
				if (actionsBlock.elements.length === 0) {
					blocks.splice(blocks.indexOf(actionsBlock) - 1, 3);
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

	// Voting
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

			if (settings.debug?.noDb) {
				throw new Error("Database connection is disabled by debug config");
			}

			const lounasMessage: LounasRepository.LounasMessageEntry = await LounasRepository.find(message.ts, args.body.channel.id);

			const blocks: (bolt.Block | bolt.KnownBlock)[] = message["blocks"];
			if (!blocks?.length) {
				throw new Error("No blocks found in message body");
			}

			const duplicateVote = lounasMessage.votes.find(vote =>
				vote.userId === args.body.user.id
					&& (settings.limitToOneVotePerUser || vote.action === actionValue)
			);
			if (duplicateVote) {
				console.debug("Duplicate vote! Removing vote...");
			}

			try {
				const updated = await LounasRepository.addOrRemoveVote(
					message.ts,
					{userId: args.body.user.id, action: actionValue},
					duplicateVote ? LounasRepository.OperationType.REMOVE : LounasRepository.OperationType.ADD);
				updateVoting(updated, blocks, settings.displayVoters);
			} catch (error) {
				console.error(error);
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

	// Trigger by command
	app.command("/lounas", async args => {
		args.ack();

		const isTomorrowRequest = TOMORROW_REQUEST_REGEXP.test(args.command.text);
		return mainTrigger(isTomorrowRequest, args);
	});

	// Trigger by message
	app.message(async args => {
		if (args.message.subtype || !args.message.text) {
			return Promise.resolve();
		}

		if (!settings.triggerRegExp.test(args.message.text)) {
			return Promise.resolve();
		}

		const isTomorrowRequest = TOMORROW_REQUEST_REGEXP.test(args.message.text);
		return mainTrigger(isTomorrowRequest, args);
	});

	// The main business logic
	async function mainTrigger(isTomorrowRequest: boolean, args?: MessageMiddlewareArgs | CommandMiddlewareArgs): Promise<void> {
		if (isTomorrowRequest) {
			console.debug("Tomorrow request!");
		}

		const isAutomatic = !args;
		const isMessage = args?.payload?.type === "message";

		// Add hourglass reaction
		if (isMessage) {
			args.client.reactions.add({
				channel: (args as MessageMiddlewareArgs).message.channel,
				name: "hourglass",
				timestamp: (args as MessageMiddlewareArgs).message.ts,

			}).catch(error => {
				console.error(error);
			});
		}

		const cachedData = await getDataAndCache(settings, true, isTomorrowRequest);

		let requester: string;
		if (isAutomatic) {
			requester = Md.italic("Subscription");
		}
		else if (isMessage) {
			requester = Md.user(((args as MessageMiddlewareArgs).message as GenericMessageEvent).user);
		}
		else {
			requester = Md.user(args.body.user_id);
		}

		cachedData.blocks.push(BlockCollection(Blocks.Context().elements(
			`${Md.emoji("alarm_clock")} Tämä viesti poistetaan automaattisesti 6 tunnin kuluttua\n`
			+ `${Md.emoji("robot_face")} Pyynnön lähetti ${requester}`
		))[0]);

		if (isAutomatic) {
			settings.subscribedChannels?.forEach(async channel => {
				const response = await app.client.chat.postMessage({
					channel,
					blocks: cachedData.blocks,
					text: "Lounaslistat",
					unfurl_links: false,
					unfurl_media: false
				});

				handleMainTriggerResponse(response, settings, channel, cachedData.data, isTomorrowRequest);

				setTimeout(truncateMessage.bind(null, app), AUTO_TRUNCATE_TIMEOUT);
			});
		}
		else {
			const response = await args.say({
				blocks: cachedData.blocks,
				text: "Lounaslistat",
				unfurl_links: false,
				unfurl_media: false
			});

			handleMainTriggerResponse(response, settings, response.channel ?? args.payload.channel, cachedData.data, isTomorrowRequest);

			if (response.channel && response.ts) {
				args.client.reactions.add({
					channel: response.channel,
					name: "thumbsup",
					timestamp: response.ts,
		
				}).catch(error => {
					// Do not log not_in_channel errors
					if (error.data?.error !== "not_in_channel") {
						console.warn(error);
					}
				});
			}

			setTimeout(truncateMessage.bind(null, app), AUTO_TRUNCATE_TIMEOUT);
		}
	
		return Promise.resolve();
	}
};

export { initEvents };

// eslint-disable-next-line max-params
function handleMainTriggerResponse(response: any, settings: Settings, channel: string, cachedData: LounasResponse[], isTomorrowRequest: boolean) {
	if (response.ok && response.ts) {
		if (!settings.debug?.noDb && !isTomorrowRequest) {
			LounasRepository.create({
				instanceId: settings.instanceId,
				ts: response.ts,
				channel: response.channel ?? channel,
				menu: cachedData.map(lounasResponse => {
					return {restaurant: lounasResponse.restaurant, items: lounasResponse.items || null};
				}),
				date: new Date(),
				votes: []
			}).catch(error => {
				console.error(error);
			});
		}

		toBeTruncated.push({
			channel: response.channel ?? channel,
			ts: response.ts
		});
	} else {
		console.warn("Response not okay!");
		console.debug(response);
	}
}

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

// eslint-disable-next-line max-params
async function getDataAndCache(settings: Settings, defaultOnly: boolean, tomorrowRequest = false, singleRestaurant: Restaurant | null = null): Promise<{ data: LounasResponse[], blocks: (bolt.Block | bolt.KnownBlock)[] }> {
	try {
		const now = new Date();
		const cacheIdentifier = `${now.getUTCDate()}${now.getUTCMonth()}${now.getUTCFullYear()}${tomorrowRequest}`;

		const allRestaurants: Restaurant[] = [];
		if (singleRestaurant) {
			allRestaurants.push(singleRestaurant);
		} else if (defaultOnly) {
			allRestaurants.push(...settings.defaultRestaurants);
		} else {
			allRestaurants.push(...settings.defaultRestaurants, ...(settings.additionalRestaurants ?? []));
		}

		const allData: LounasResponse[] = [];
	
		if (lounasCache[cacheIdentifier]) {
			const cachedData = structuredClone(lounasCache[cacheIdentifier]);

			// If cache contains every requested restaurant, we can short circuit here
			if (allRestaurants.every(restaurant => cachedData.data.find(data => data.restaurant === restaurant))) {
				console.debug("All requested restaurants found from cache!");
				return Promise.resolve(cachedData);
			}

			allData.push(...cachedData.data);
			console.debug(`${allData.length} restaurants found from cache!`);
		}
	
		// Fetch restaurants that are missing from the cache
		allData.push(...(await settings.dataProvider.getData(allRestaurants.filter(restaurant => !allData.find(data => data.restaurant === restaurant)), tomorrowRequest)));

		const hasDate = allData.filter(lounas => lounas.date);
		const header = `Lounaslistat${hasDate.length ? ` (${hasDate[0].date})` : ""}`;
	
		const parsedData: { data: LounasResponse[], text: string, blocks: (bolt.Block | bolt.KnownBlock)[] } = {
			data: allData,
			text: header, // Slack recommends having this
			blocks: BlockParsers.parseMainBlocks(allData, header, settings, tomorrowRequest) // FIXME: Avoid unnecessary parsing in singleRestaurant mode
		};

		// Save non-errored to cache
		const cacheObject = structuredClone(parsedData);
		cacheObject.data = cacheObject.data.filter(data => !data.error);
		if (cacheObject.data.length !== parsedData.data.length) {
			console.warn(`Could not cache ${parsedData.data.length - cacheObject.data.length} restaurant(s) as the result contained errors`);
		}
		lounasCache[cacheIdentifier] = cacheObject;

		return Promise.resolve(parsedData);
	} catch (error) {
		return Promise.reject(error);
	}
}

// eslint-disable-next-line max-params
function updateVoting(lounasMessage: LounasRepository.LounasMessageEntry, blocks: (bolt.Block | bolt.KnownBlock)[], displayVoters: boolean) {
	const allVotes: string[] = lounasMessage.votes.map(vote => vote.action);

	blocks.forEach((block, index) => {
		if (block.type === "actions" && (block as bolt.ActionsBlock).elements?.find(element => (element as Button).action_id === "upvoteButtonAction")) {
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
						.map(Md.user)
						.join(" ");

					const split = currentText.split("\n"); // [titleRow, ...other stuff]
					split[0] = `${split[0].split("<@", 2)[0].trim()} ${voters}`;

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