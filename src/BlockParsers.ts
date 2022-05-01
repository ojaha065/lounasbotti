import { Job } from "node-schedule";
import { BlockCollection, Blocks, Elements, HomeTab, Md, setIfTruthy, user } from "slack-block-builder";
import { SlackBlockDto, SlackHomeTabDto } from "slack-block-builder/dist/internal";

import { LounasDataProvider, LounasResponse } from "./model/LounasDataProvider.js";
import { RestaurantNameMap, Settings } from "./model/Settings.js";

export default class BlockParsers {
	// eslint-disable-next-line max-params
	public static parseMainBlocks(data: LounasResponse[], header: string, settings: Settings, tomorrowRequest: boolean): Readonly<SlackBlockDto>[] {
		const lounasBlocks: SlackBlockDto[] = [];
		data.filter(lounasResponse => !lounasResponse.isAdditional).forEach(lounasResponse => {
			lounasBlocks.push(...this.parseLounasBlock(lounasResponse, settings, !tomorrowRequest));
		});

		return [
			...BlockCollection(
				Blocks.Header().text(header).end(),
				setIfTruthy(settings.announcements?.length,
					Blocks.Section({ text: (settings.announcements ?? [""])[0] }).end()
				)
			),
			...lounasBlocks,
			...BlockCollection(
				Blocks.Divider().end(),
				setIfTruthy(settings.additionalRestaurants?.length && !tomorrowRequest, [
					Blocks.Section({ text: Md.bold("Jotakin aivan muuta? Napsauta hakeaksesi") }).end(),
					Blocks.Actions().elements(
						...(settings.additionalRestaurants ?? []).map(restaurant =>
							Elements.Button({
								actionId: `fetchAdditionalRestaurant-${restaurant}`,
								value: restaurant,
								text: RestaurantNameMap[restaurant]
							})))
						.end(),
					Blocks.Divider().end(),
				])
			)
		];
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
				Blocks.Section({ text: `Tervehdys ${user(data.userId)}, nimeni on Lounasbotti. Kutsu minua millä tahansa kanavalla, jonne minut on kutsuttu ja haen päivän lounaslistat valonnopeudella! ${Md.italic("...tai ainakin yritän...")}` }).end(),
				Blocks.Section({ text: "Voit myös avata yksityisen chatin kanssani ja käyttää edellä mainittuja komentoja siellä." }).end(),
				Blocks.Section({ text: `UUTTA: Kokeile myös komentoa ${Md.bold("!ruokaa huomenna")}` }).end(),
				setIfTruthy(data.settings.announcements?.length, [
					Blocks.Section({ text: `${Md.bold("Tiedotteet")}\n${data.settings.announcements?.join("\n\n")}` }).end(),
					Blocks.Divider().end()
				]),
				Blocks.Section({ text: `${Md.italic("Auta minua kehittymään paremmaksi")} ${Md.emoji("arrow_right")}` })
					.accessory(Elements.Button({ actionId: "githubButtonLinkAction", text: `${Md.emoji("link")} GitHub`, url: data.settings.gitUrl }))
					.end(),
				Blocks.Divider().end(),
				Blocks.Input({ label: "Asetukset", hint: "Tätä säännöllistä lauseketta vastaavat viestit käynnistävät Lounasbotin. Syötettyä arvoa ei validoida, joten muokkaa tätä vain, jos tiedät mitä teet. Huomaa myös, että 'Ignore Casing' (i) ja 'Global' (g) liput ovat käytössä." })
					.dispatchAction(true)
					.element(Elements.TextInput({ initialValue: data.settings.triggerRegExp.source, minLength: 1, maxLength: 256, placeholder: "esim. '!lounas'" })
						.actionId("lounasbotti-updateRegExp")
						.dispatchActionOnCharacterEntered(false)
						.dispatchActionOnEnterPressed(true)
						.focusOnLoad(false)
						.multiline(false)
						.end()
					)
					.end(),
				Blocks.Divider().end(),
				setIfTruthy(debugInformation.length, Blocks.Context().elements(`Debug information:\n${debugInformation.join("\n")}`).end())
			)
			.buildToObject();
	}

	public static parseLounasBlock(lounasResponse: LounasResponse, settings: Settings, voting = true): Readonly<SlackBlockDto>[] {
		const arr = [];
		arr.push(Blocks.Section({ text: `${Md.bold(RestaurantNameMap[lounasResponse.restaurant])}\n${((lounasResponse.items || [lounasResponse.error]).map(item => `  ${BlockParsers.getEmojiForLounasItem(item?.toString(), settings)} ${item}`).join("\n"))}` })
			.accessory(setIfTruthy(lounasResponse.iconUrl && settings.iconsEnabled, Elements.Img({ imageUrl: lounasResponse.iconUrl?.toString() ?? "", altText: RestaurantNameMap[lounasResponse.restaurant] })))
			.end());

		if (voting && lounasResponse.items) {
			arr.push(Blocks.Actions().elements(Elements.Button({ actionId: "upvoteButtonAction", value: `upvote-${lounasResponse.restaurant}`, text: Md.emoji("thumbsup") })));
		}

		return BlockCollection(arr);
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