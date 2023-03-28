import * as cheerio from "cheerio";

import { LounasDataProvider, LounasResponse } from "./LounasDataProvider";
import { Restaurant, Settings } from "../Settings.js";
import * as Utils from "../../Utils.js";

class VaihdaDataProvider implements LounasDataProvider {
	readonly id: string = "Savo";
	readonly baseUrl: string = "https://www.vaiha.fi/savo-lounas";

	readonly settings: Settings;
	readonly VERSION: string;

	readonly supportedRestaurants = [
		Restaurant.savo
	];

	public constructor(settings: Settings, VERSION: string) {
		this.settings = settings;
		this.VERSION = VERSION;
	}

	public async getData(restaurants: Restaurant[], additionalRestaurants?: Restaurant[], tomorrowRequest = false): Promise<LounasResponse[]> {
		try {
			console.debug("Fetching data from vaiha.fi...");

			if (restaurants.some(restaurant => !this.supportedRestaurants.includes(restaurant))) {
				throw new Error(`This data provider only supports ${this.supportedRestaurants}`);
			}

			if (additionalRestaurants?.length) {
				throw new Error("This data provider does not support additional restaurants!");
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


			const containerDiv = Utils.requireNonNullOrUndefined(
				$(".previewevents_2010"),
				"Error parsing HTML! Could not find proper container"
			);

			const expectedTitle = `${Utils.getCurrentWeekdayNameInFinnish(tomorrowRequest).toLowerCase()} `;
			const pForToday = containerDiv
				.find("p")
				.filter((_i, el) => $(el).text()?.toLowerCase().startsWith(expectedTitle))
				.first();
			if (!pForToday?.length) {
				throw new Error("Error parsing HTML! Could not find <p> element for today");
			}

			const items = Utils.splitByBrTag(pForToday.html() ?? "");
			if (!items.length) {
				throw new Error("Error parsing HTML! Empty items list.");
			}

			const date = items[0];
			items[0] = "Beta-ominaisuus! Tarkasta tietojen oikeellisuus: https://www.vaiha.fi/savo-lounas";

			return [{
				isAdditional: false,
				restaurant: Restaurant.savo,
				date: date,
				items: items.map(s => s.trim()).filter(Boolean),
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