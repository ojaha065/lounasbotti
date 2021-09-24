import bolt, { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { ChatPostMessageResponse } from "@slack/web-api";

import { LounasDataProvider, LounasResponse } from "./model/LounasDataProvider.js";
import { RestaurantNameMap, Settings } from "./model/Settings.js";

const initEvents = (app: bolt.App): void => {
	app.action("githubButtonLinkAction", async ({ack}) => {
		console.debug("GitHub link opened!");
		ack();
	});

	app.action("upvoteButtonAction", async ({ack}) => {
		console.debug("Upvote registered!");
		ack();
	});
};

const handleLounas = async (args: SlackEventMiddlewareArgs<"message">, dataProvider: LounasDataProvider, settings: Settings): Promise<ChatPostMessageResponse | null> => {
	if (args.message.subtype) {
		return Promise.resolve(null);
	}
	
	const data: LounasResponse[] = await dataProvider.getData(settings.defaultRestaurants);
	const header = `Lounaslistat${data.length && data[0].date ? ` (${data[0].date})` : ""}`;

	return args.say({
		text: header, // Fallback for notifications
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: header
				}
			}, ...data.map(lounasResponse => {
				return {
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${RestaurantNameMap[lounasResponse.restaurant]}*\n${((lounasResponse .items || [lounasResponse .error]).map(item => `  * ${item}`).join("\n"))}`
					},
					accessory: {
						type: "button",
						text: {
							type: "plain_text",
							text: ":thumbsup:",
							emoji: true
						},
						value: `upvote-${lounasResponse.restaurant}`,
						action_id: "upvoteButtonAction"
					}
				};
			}),
			{
				type: "divider"
			},
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `Pyynnön lähetti <@${args.message.user}>\n_Ongelmia botin toiminnassa? Ping @Jani_`
					},
				]
			
			}
		]
	});
};

const handleHomeTab = async (args: SlackEventMiddlewareArgs<"app_home_opened"> & AllMiddlewareArgs, version: string) => {
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
				}
			]
		}
	});
};

export { initEvents, handleLounas, handleHomeTab };