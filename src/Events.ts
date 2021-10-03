import bolt, { AllMiddlewareArgs, ButtonAction, SlackEventMiddlewareArgs } from "@slack/bolt";
import { Job } from "node-schedule";

import { LounasDataProvider, LounasResponse } from "./model/LounasDataProvider.js";
import { RestaurantNameMap, Settings } from "./model/Settings.js";

const AUTO_TRUNCATE_TIMEOUT = 1000 * 60 * 60 * 8; // 8 hrs

const voters: Record<string, Record<string, string[]>> = {};
const toBeTruncated: { channel: string, ts: string }[] = [];

const initEvents = (app: bolt.App): void => {
	app.action("githubButtonLinkAction", async ({ack}) => {
		console.debug("GitHub link opened!");
		ack();
	});

	app.action({type: "block_actions", action_id: "upvoteButtonAction"}, async args => {
		console.debug("Upvote registered!");

		try {
			const message = args.body.message;
			if (!message) {
				throw new Error("Message not found from action body");
			}
	
			const actionValue: string = (args.action as ButtonAction).value;
			if (!actionValue) {
				throw new Error("No actionValue!");
			}
	
			if (voters[message.ts]?.[args.body.user.id || "notFound"]?.includes(actionValue)) {
				console.debug(`User ${args.body.user.id} has already voted`);
				return;
			}
			
			const blocks: (bolt.Block | bolt.KnownBlock)[] = message["blocks"];
			if (!blocks || !blocks.length) {
				throw new Error("No blocks found in message body");
			}
	
			// There has to be an easier way
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
			await args.respond({
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
const handleLounas = async (args: SlackEventMiddlewareArgs<"message">, dataProvider: LounasDataProvider, settings: Settings, appRef: bolt.App): Promise<null> => {
	if (args.message.subtype) {
		return Promise.resolve(null);
	}
	
	const data: LounasResponse[] = await dataProvider.getData(settings.defaultRestaurants);
	const hasDate = data.filter(lounas => lounas.date);
	const header = `Lounaslistat${hasDate.length ? ` (${hasDate[0].date})` : ""}`;

	const response = await args.say({
		text: header, // Fallback for notifications
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: header
				}
			}, ...data.map(lounasResponse => {
				const result: (bolt.Block | bolt.KnownBlock) = {
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${RestaurantNameMap[lounasResponse.restaurant]}*\n${((lounasResponse .items || [lounasResponse .error]).map(item => `  * ${item}`).join("\n"))}`
					},
				};

				if (lounasResponse.items) {
					result.accessory = {
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

				return result;
			}),
			{
				type: "divider"
			},
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `:alarm_clock: Tämä viesti poistetaan automaattisesti 8 tunnin kuluttua\nPyynnön lähetti <@${args.message.user}>\n_Ongelmia botin toiminnassa? Ping @Jani_\n`
					},
				]
			
			}
		]
	});

	if (response.ok && response.ts) {
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

const handleHomeTab = async (args: SlackEventMiddlewareArgs<"app_home_opened"> & AllMiddlewareArgs, version: string, restartJob: Job | undefined) => {
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