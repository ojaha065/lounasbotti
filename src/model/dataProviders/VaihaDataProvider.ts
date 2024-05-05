import * as cheerio from "cheerio";

import type { LounasDataProvider, LounasResponse } from "./LounasDataProvider";
import type { Settings } from "../Settings.js";
import { Restaurant } from "../Settings.js";
import * as Utils from "../../Utils.js";
import { decode } from "html-entities";

class VaihdaDataProvider implements LounasDataProvider {
	readonly id: string = "Savo";
	readonly baseUrl: string = "https://www.vaiha.fi/kaikki-uutiset/vaiha-lounas";

	readonly settings: Settings;

	readonly supportedRestaurants = [
		Restaurant.savo
	];

	public constructor(settings: Settings) {
		this.settings = settings;
	}

	public async getData(restaurants: Restaurant[], tomorrowRequest = false): Promise<LounasResponse[]> {
		try {
			console.debug("Fetching data from vaiha.fi...");

			if (restaurants.some(restaurant => !this.supportedRestaurants.includes(restaurant))) {
				throw new Error(`This data provider only supports ${this.supportedRestaurants}`);
			}

			const response = await Utils.fetchWithTimeout(this.baseUrl, {
				method: "GET",
				headers: {
					"User-Agent": `Mozilla/5.0 (compatible; Lounasbotti/${global.LOUNASBOTTI_VERSION}; +${this.settings.gitUrl})`
				}
			});

			if (!response.ok) {
				throw new Error(`Response ${response.status} from ${this.baseUrl}`);
			}

			const responseHTML = await response.text();
			const $ = cheerio.load(responseHTML);


			const containerDiv = Utils.requireNonNullOrUndefined(
				$(".news-item-single-text"),
				"Error parsing HTML! Could not find proper container"
			);

			const expectedTitle = `${Utils.getCurrentWeekdayNameInFinnish(tomorrowRequest).toLowerCase()} `;
			const pForToday = containerDiv
				.find("p")
				.filter((_i, el) => $(el).children(":first").text()?.toLowerCase().startsWith(expectedTitle))
				.first();
			if (!pForToday?.length) {
				throw new Error("Error parsing HTML! Could not find <p> element for today");
			}

			const items = Utils.splitByBrTag(pForToday.html() ?? "");
			if (!items.length) {
				throw new Error("Error parsing HTML! Empty items list.");
			}

			const date = cheerio.load(items.shift() ?? "").text();

			return [{
				isAdditional: false,
				restaurant: Restaurant.savo,
				date: date,
				items: items.map(s => s.trim()).filter(Boolean).map(item => decode(item)).filter(item => !(this.settings.stripRules?.some(rule => rule.test(item)))),
				iconUrl: this.settings.overrideIconsUrl ? new URL(`/lounas_icons/${Restaurant.savo}.png`, this.settings.overrideIconsUrl).toString() : undefined
			}];
		} catch(error) {
			console.error(error);

			return [{
				isAdditional: false,
				restaurant: Restaurant.savo,
				error: error as Error
			}];
		}
	}
}

export default VaihdaDataProvider;