import * as cheerio from "cheerio";

import { LounasDataProvider, LounasResponse } from "./LounasDataProvider.js";
import { Restaurant, Settings } from "./Settings.js";
import * as Utils from "../Utils.js";

class TalliDataProvider implements LounasDataProvider {
	readonly id: string = "Talli";
	readonly baseUrl: string = "https://www.xamkravintolat.fi/tallin-lounaslista/";

	readonly settings: Settings;
	readonly VERSION: string;

	public constructor(settings: Settings, VERSION: string) {
		this.settings = settings;
		this.VERSION = VERSION;
	}

	public async getData(restaurants: Restaurant[], additionalRestaurants?: Restaurant[], tomorrowRequest = false): Promise<LounasResponse[]> {
		try {
			console.debug("Fetching data from xamkravintolat.fi...");

			if (!restaurants.includes(Restaurant.talli) || restaurants.length > 1) {
				throw new Error("TalliDataProvider only supports Ravintola Talli");
			}
	
			if (additionalRestaurants?.length) {
				throw new Error("TalliDataProvider does not support additionalRestaurants");
			}
	
			const response = await Utils.fetchWithTimeout(this.baseUrl, {
				method: "GET",
				headers: {
					"User-Agent": `Mozilla/5.0 (compatible; Lounasbotti/${this.VERSION}; +${this.settings.gitUrl})`
				}
			});
	
			if (!response.ok) {
				throw new Error(`Response ${response.status} from ${this.baseUrl}`);
			}
	
			const responseHTML = await response.text();
			const $ = cheerio.load(responseHTML);
			const containerDiv = $("section.cols-1 > div.container:first-child");
			if (!containerDiv.length) {
				throw new Error("Error parsing HTML! Could not find proper container");
			}
	
			const expectedTitle = `${Utils.getCurrentWeekdayNameInFinnish(tomorrowRequest).substring(0, 2).toLowerCase()} `;

			const titleP = containerDiv
				.find("p")
				.filter((_i, el) => $(el).text()?.toLowerCase().startsWith(expectedTitle))
				.first();
			if (!titleP?.length) {
				throw new Error(`Error parsing HTML! Expected title: ${expectedTitle}`);
			}

			let items = Utils.splitByBrTag(titleP.html() ?? "");
			if (items.length <= 2) {
				items = Utils.splitByBrTag(titleP.next().html() ?? "");
			}
			if (!items?.length) {
				throw new Error("Error parsing HTML!");
			}

			return [{
				isAdditional: false,
				restaurant: Restaurant.talli,
				date: expectedTitle,
				items: items
					.map(s => s.trim())
					.filter(Boolean),
				iconUrl: this.settings.overrideIconsUrl ? new URL(`/lounas_logos/${Restaurant.talli}.png`, this.settings.overrideIconsUrl).toString() : undefined
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