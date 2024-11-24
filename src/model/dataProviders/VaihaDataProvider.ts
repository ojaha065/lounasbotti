import * as cheerio from "cheerio";

import type { LounasDataProvider, LounasResponse } from "./LounasDataProvider.js";
import type { Settings } from "../Settings.js";
import { Restaurant } from "../Settings.js";
import * as Utils from "../../Utils.js";
import { decode } from "html-entities";

class VaihdaDataProvider implements LounasDataProvider {
	readonly id: string = "Savo";
	readonly baseUrl = null;

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

			const now = new Date();
			if (tomorrowRequest) { now.setDate(now.getDate() + 1); }

			const fetchUrl = this.settings.extraParams?.VAIHA_PATTERN
				?.replaceAll("${weekNumber}", Utils.getWeekNumber(now).toString());

			if (!fetchUrl) {
				throw new Error("VAIHA_PATTERN is missing");
			}
			console.debug(`VAIHA URL: ${fetchUrl}`);

			const response = await Utils.fetchWithTimeout(fetchUrl, {
				method: "GET"
			});

			if (!response.ok) {
				throw new Error(`Response ${response.status} from ${fetchUrl}`);
			}

			const responseHTML = await response.text();
			const $ = cheerio.load(responseHTML);


			const containerDiv = Utils.requireNonNullOrUndefined(
				$(".events-page__content"),
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
				items: Utils.takeUntil(
						items.map(s => s.trim()).filter(Boolean),
						item => item.startsWith("<strong>")
					)
					.map(item => decode(item))
					.filter(item => !(this.settings.stripRules?.some(rule => rule.test(item)))),
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