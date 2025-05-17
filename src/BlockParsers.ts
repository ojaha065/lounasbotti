import { Bits, BlockCollection, Blocks, Elements, HomeTab, Md, setIfTruthy, SlackBlockDto, user } from "slack-block-builder";

import type { LounasResponse } from "./model/dataProviders/LounasDataProvider.js";
import type { Settings } from "./model/Settings.js";
import { RestaurantNameMap } from "./model/Settings.js";

import * as WeatherAPI from "./WeatherAPI.js";
import { View } from "@slack/types";

export default class BlockParsers {
	private static limitVotesToOneOptionBit = Bits.Option({ text: "Salli käyttäjän äänestää vain yhtä vaihtoehtoa" });
	private static restaurantClosedRegExp = /suljettu|kiinni/;

	public static parseMainBlocks(data: LounasResponse[], header: string, settings: Settings, tomorrowRequest: boolean): Readonly<SlackBlockDto>[] {
		const lounasBlocks: SlackBlockDto[] = [];
		data.filter(lounasResponse => !lounasResponse.isAdditional)
			.forEach(lounasResponse => {
				lounasBlocks.push(...this.parseLounasBlock(lounasResponse, settings, !tomorrowRequest));
			});

		return [
			...BlockCollection(
				Blocks.Section().text(header).end(),
				setIfTruthy(settings.announcements?.length,
					Blocks.Section({ text: (settings.announcements ?? [""])[0] }).end()
				)
			),

			...lounasBlocks,

			...BlockCollection(setIfTruthy(!tomorrowRequest, [
				Blocks.Divider({ blockId: "refreshDivider" }).end(),
				Blocks.Actions().elements(Elements.Button({
					accessibilityLabel: "Hae lounaslistat uudelleen",
					actionId: "refreshMessage",
					text: `${Md.emoji("arrows_counterclockwise")} Hae uudelleen`
				})).end(),
			])),

			...BlockCollection(
				Blocks.Divider({ blockId: "additionalRestaurantsDivider" }).end(),
				setIfTruthy(settings.additionalRestaurants?.length && !tomorrowRequest, [
					Blocks.Section({ text: Md.bold("Jotakin aivan muuta? Napsauta hakeaksesi") }).end(),
					Blocks.Actions({ blockId: "additionalRestaurantsActions" }).elements(
						...(settings.additionalRestaurants ?? []).map(restaurant =>
							Elements.Button({
								actionId: `fetchAdditionalRestaurant-${restaurant}`,
								value: restaurant,
								text: RestaurantNameMap[restaurant]
							})))
						.end(),
					Blocks.Divider().end(),
				])
			),

			...BlockCollection(Blocks.Context().elements(`${Md.emoji("alarm_clock")} Tämä viesti poistetaan automaattisesti 6 tunnin kuluttua`))
		];
	}

	public static parseHomeTabView(data: { settings: Settings, userId: string}): Readonly<View> {
		const debugInformation: string[] = [
			data.settings.configSource ? `Config loaded from ${data.settings.configSource}` : null,
			`Data provider: ${data.settings.dataProvider.id} (${data.settings.dataProvider.baseUrl})`,
			`[LounasEmoji] ${data.settings.emojiRules?.size ? `${data.settings.emojiRules?.size} regular expressions successfully loaded` : "No rules loaded"}`,
			data.settings.openMeteoURL ? `[WeatherEmoji] ${WeatherAPI.printAllEmoji()}` : null,
			global.LOUNASBOTTI_JOBS.cacheClearing ? `Cached data will be cleared at ${global.LOUNASBOTTI_JOBS.cacheClearing.nextInvocation().toLocaleString("en-US")}` : null,
			global.LOUNASBOTTI_JOBS.subscriptions ? `Automatic posting to subscribed channels will next occur at ${global.LOUNASBOTTI_JOBS.subscriptions.nextInvocation().toLocaleString("en-US")}` : null,
			global.LOUNASBOTTI_JOBS.truncateAll && global.LOUNASBOTTI_TO_BE_TRUNCATED.length ? `${global.LOUNASBOTTI_TO_BE_TRUNCATED.length} message(s) be will be forcefully truncated at ${global.LOUNASBOTTI_JOBS.truncateAll.nextInvocation().toLocaleString("en-US")}` : null,
			`${(data.settings.subscribedChannels || []).length} channel subscription(s)`
		].filter(Boolean) as string[];
	
		return HomeTab()
			.blocks(
				Blocks.Header({ text: `Lounasbotti ${global.LOUNASBOTTI_VERSION}` }).end(),
				Blocks.Section({ text: Md.italic("By <https://github.com/ojaha065|Jani Haiko>") }).end(),
				Blocks.Divider().end(),

				Blocks.Section({ text: `Tervehdys ${user(data.userId)}, nimeni on Lounasbotti. Kutsu minua millä tahansa kanavalla komennolla ${Md.codeInline("/lounas")} ja haen päivän lounaslistat! ${Md.italic("...tai ainakin yritän...")}` }).end(),
		
				// Commands
				Blocks.Section().text(
					Md.bold("Komennot") + "\n" +
					[
						["/lounas [<tyhjä> | tänään | huomenna]", "Aktivoi Lounasbotti ja hae lounaslistat"],
						["/lounasbotti subscribe", "Aktivoi automaattinen tila kanavalle (Arkispäivisin klo. 10:30)"],
						["/lounasbotti unsubscribe", "Poista automaattinen tila käytöstä"],
						["/lounasbotti cache", "Tyhjennä sovelluksen välimuisti"],
						["/lounasbotti restart", "Käynnistä sovellus uudelleen"],
						["/lounasbotti ping", "Pong!"]
					].map(command => `${Md.codeInline(command[0])} - ${command[1]}`).join("\n")
				).end(),

				setIfTruthy(data.settings.announcements?.length, [
					Blocks.Section({ text: `${Md.bold("Tiedotteet")}\n${data.settings.announcements?.join("\n\n")}` }).end(),
					Blocks.Divider().end()
				]),

				Blocks.Section({ text: `${Md.italic("Auta minua kehittymään paremmaksi")} ${Md.emoji("arrow_right")}` })
					.accessory(Elements.Button({ actionId: "githubButtonLinkAction", text: `${Md.emoji("link")} GitHub`, url: data.settings.gitUrl }))
					.end(),

				Blocks.Divider().end(),

				Blocks.Input({ label: "Asetukset: Äänestys", hint: "Jos tämä valinta on käytössä, jokainen käyttäjä voi äänestää vain yhtä vaihtoehtoa." })
					.dispatchAction(true)
					.element(Elements.Checkboxes()
						.actionId("lounasbotti-limitVotesToOne")
						.options(this.limitVotesToOneOptionBit)
						.initialOptions(setIfTruthy(data.settings.limitToOneVotePerUser, this.limitVotesToOneOptionBit))
						.focusOnLoad(false)
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

		const restaurantDisplayName = settings.restaurantDisplayNames?.has(lounasResponse.restaurant) ? settings.restaurantDisplayNames.get(lounasResponse.restaurant) : RestaurantNameMap[lounasResponse.restaurant];
		const text: string = lounasResponse.error
			? `${Md.emoji("warning")} ${lounasResponse.error.message}${settings.customErrorMessages?.has(lounasResponse.restaurant) ? `\n${settings.customErrorMessages.get(lounasResponse.restaurant)}` : ""}`
			: lounasResponse.items
				.map(item => `${BlockParsers.getEmojiForLounasItem(item?.toString(), settings)} ${item}`)
				.join("\n");

		arr.push(Blocks.Section()
			.text(`${Md.bold(restaurantDisplayName ?? "Error: No name")}\n${text}`)
			.accessory(setIfTruthy(lounasResponse.iconUrl && settings.iconsEnabled, Elements.Img({ imageUrl: lounasResponse.iconUrl?.toString() ?? "", altText: RestaurantNameMap[lounasResponse.restaurant] })))
			.blockId(`voters-${lounasResponse.restaurant}`)
			.end()
		);

		if (voting && lounasResponse.items?.every(item => !this.restaurantClosedRegExp.test(item))) {
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
	
		return ":knife_fork_plate:";
	}
}