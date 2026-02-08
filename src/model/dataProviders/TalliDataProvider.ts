import * as cheerio from "cheerio";
import {decode} from "html-entities";

import type { LounasDataProvider, LounasResponse } from "./LounasDataProvider.js";
import type { Settings } from "../Settings.js";
import { Restaurant } from "../Settings.js";
import * as Utils from "../../Utils.js";

class TalliDataProvider implements LounasDataProvider {
	readonly id: string = "Talli";
	readonly baseUrl: string = "https://www.xamk.fi/kampukset/mikkeli/tilat-ja-ravintolat/ravintola-talli/tallin-lounasmenu/";

	readonly settings: Settings;

	public constructor(settings: Settings) {
		this.settings = settings;
	}

	public async getData(restaurants: Restaurant[], tomorrowRequest = false): Promise<LounasResponse[]> {
		try {
			console.debug("Fetching data from xamkravintolat.fi...");

			if (!restaurants.includes(Restaurant.talli) || restaurants.length > 1) {
				throw new Error("TalliDataProvider only supports Ravintola Talli");
			}
	
			const response = await Utils.fetchWithTimeout(this.baseUrl, {
				method: "GET"
			});
	
			if (!response.ok) {
				throw new Error(`Response ${response.status} from ${this.baseUrl}`);
			}

			const responseHTML = await response.text();
			const $ = cheerio.load(responseHTML);
			const lounasmenu = $("#main-content");

			const expectedWeekday = Utils.getCurrentWeekdayNameInFinnish(tomorrowRequest).substring(0, 2).toLowerCase();
			const weekDayRegExp = new RegExp(`^${Utils.getWeekdayNameInFinnish(new Date(), tomorrowRequest ? 2 : 1).substring(0, 2)} \\d{1,2}\\.\\d{1,2}\\.?$`, "i");

			const p = lounasmenu
				.find("p.has-text-align-center")
				.filter((_i, el) => $(el).text()?.toLowerCase().startsWith(expectedWeekday))
				.first();
			if (!p?.length) {
				throw new Error(`Error parsing HTML! Expected title: ${expectedWeekday}`);
			}

			const items = Utils.takeUntil(Utils.splitByBrTag(p.html() ?? ""), item => weekDayRegExp.test(item));
			if (!items?.length) {
				throw new Error("Error parsing HTML!");
			}

			return [{
				isAdditional: false,
				restaurant: Restaurant.talli,
				date: expectedWeekday,
				items: items.slice(1)
					.map(s => s.trim())
					.filter(Boolean)
					.map(item => decode(item))
					.filter(item => !(this.settings.stripRules?.some(rule => rule.test(item)))),
				iconUrl: this.settings.overrideIconsUrl ? new URL(`/lounas_icons/${Restaurant.talli}.png`, this.settings.overrideIconsUrl).toString() : undefined
			}];
		} catch(error) {
			console.error(error);

			return [{
				isAdditional: false,
				restaurant: Restaurant.talli,
				error: error as Error
			}];
		}
	}
}

export default TalliDataProvider;