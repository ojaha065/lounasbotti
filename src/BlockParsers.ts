import bolt from "@slack/bolt";
import { Job } from "node-schedule";
import { Blocks, Elements, HomeTab, Md, user } from "slack-block-builder";
import { SlackHomeTabDto } from "slack-block-builder/dist/internal";

import { LounasDataProvider, LounasResponse } from "./model/LounasDataProvider.js";
import { RestaurantNameMap, Settings } from "./model/Settings.js";

export default class BlockParsers {
	// TODO: Use slack-block-builder
	public static parseLounasBlock(lounasResponse: LounasResponse, settings: Settings, voting = true): bolt.Block | bolt.KnownBlock {
		const lounasBlock: (bolt.Block | bolt.KnownBlock) = {
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*${RestaurantNameMap[lounasResponse.restaurant]}*\n${((lounasResponse.items || [lounasResponse.error]).map(item => `  ${BlockParsers.getEmojiForLounasItem(item?.toString(), settings)} ${item}`).join("\n"))}`
			},
		};
	
		if (voting && lounasResponse.items) {
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
	
		return lounasBlock;
	}

	public static parseHomeTabView(data: { settings: Settings, version: string, userId: string, restartJob: Job | undefined, prefetchJob: Job | undefined }): Readonly<SlackHomeTabDto> {
		const debugInformation: string[] = [
			data.settings.configSource ? `Config loaded from ${data.settings.configSource}` : null,
			`Data provider: ${(data.settings.dataProvider as LounasDataProvider).id} (${(data.settings.dataProvider as LounasDataProvider).baseUrl})`,
			`[LounasEmoji] ${data.settings.emojiRules?.size ? `${data.settings.emojiRules?.size} regular expressions successfully loaded` : "No rules loaded"}`,
			data.restartJob ? `Next scheduled restart is at ${data.restartJob.nextInvocation().toLocaleString("en-US")}` : null,
			data.prefetchJob ? `Next data prefetching will occur at ${data.prefetchJob.nextInvocation().toLocaleString("en-US")}` : null
		].filter(Boolean) as string[];
	
		return HomeTab()
			.blocks(
				Blocks.Header({ text: `Lounasbotti V${data.version}` }).end(),
				Blocks.Section({ text: Md.italic("By <https://github.com/ojaha065|Jani Haiko>") }).end(),
				Blocks.Divider().end(),
				Blocks.Section({ text: `Tervehdys ${user(data.userId)}, nimeni on Lounasbotti. Kutsu minua komennoilla ${Md.bold("!lounas")} tai ${Md.bold("!ruokaa")} millä tahansa kanavalla, jonne minut on kutsuttu ja haen päivän lounaslistat valonnopeudella! ${Md.italic("...tai ainakin yritän...")}` }).end(),
				Blocks.Section({ text: "Voit myös avata yksityisen chatin kanssani ja käyttää edellä mainittuja komentoja siellä." }).end(),
				// Blocks.Section({ text: `UUTTA: Kokeile myös komentoa ${Md.bold("!ruokaa huomenna")}` }).end(),
				Blocks.Section({ text: `${Md.italic("Auta minua kehittymään paremmaksi")} ${Md.emoji("arrow_right")}` })
					.accessory(Elements.Button({ actionId: "githubButtonLinkAction", text: `${Md.emoji("link")} GitHub`, url: data.settings.gitUrl }))
					.end(),
				Blocks.Context().elements(debugInformation.length ? `Debug information:\n${debugInformation.join("\n")}` : "---").end()
			)
			.buildToObject();
	}

	private static getEmojiForLounasItem(lounasItem = "", settings: Settings) {
		if (settings.emojiRules) {
			for (const [key, value] of settings.emojiRules) {
				if (key.test(lounasItem)) {
					return value;
				}
			}
		}
	
		return ":grey_question:";
	}
}