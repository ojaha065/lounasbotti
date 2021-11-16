import * as cheerio from "cheerio";
import htmlparser2 from "htmlparser2";

import * as Utils from "../Utils.js";
import { LounasDataProvider, LounasResponse } from "./LounasDataProvider.js";
import { Restaurant, Settings } from "./Settings.js";

class RuokapaikkaFiDataProvider implements LounasDataProvider {
	readonly id: string = "RuokapaikkaFi";
	readonly baseUrl: string = "https://www.ruokapaikka.fi/";
	readonly restaurantMap: Record<Restaurant, string> = {
		savo: "ravintolasavo.php",
		talli: "ravintolatalli.php",
		rami: "lounasravintola_rami.php",
		august: "august.php",
		holvi: "bistroholvi.php",
		vino: "vino.php"
	};

	readonly settings: Settings;
	readonly VERSION: string;

	public constructor(settings: Settings, VERSION: string) {
		this.settings = settings;
		this.VERSION = VERSION;
	}

	public async getData(restaurants: Restaurant[], additionalRestaurants?: Restaurant[]): Promise<LounasResponse[]> {
		console.debug("Fetching data from ruokapaikkaFi...");

		const result: LounasResponse[] = [];

		await Promise.all([...restaurants, ...(additionalRestaurants || [])].map(async restaurant => {
			const url = `${this.baseUrl}/${this.restaurantMap[restaurant]}`;
			const isAdditional = !!additionalRestaurants?.includes(restaurant);

			try {
				const response = await Utils.fetchWithTimeout(url, {
					method: "GET",
					headers: {
						"User-Agent": `Mozilla/5.0 (compatible; Lounasbotti/${this.VERSION};)`
					}
				});

				if (!response.ok) {
					throw new Error(`Response ${response.status} from ${url}`);
				}

				const html = await response.text();
				const dom = htmlparser2.parseDocument(html);
				const $ = cheerio.load(dom);

				const $lounasHTML = $(".tekstit2 > p:nth-child(3)").first();
				if (!$lounasHTML.length) {
					const errorMessage = `Error scraping data for restaurant ${restaurant}`;
					console.warn(errorMessage);
					result.push({
						isAdditional,
						restaurant: restaurant,
						error: new Error(errorMessage)
					});
				} else {
					const today = Utils.getCurrentWeekdayNameInFinnish();
					const date = $lounasHTML.children("b").first().text().toLowerCase();
					if (date.includes(today)) {
						result.push({
							isAdditional,
							restaurant: restaurant,
							date: date,
							items: this.parseLounasHTML($lounasHTML)
						});
					} else {
						const errorMessage = `Error scraping data for restaurant ${restaurant}: Today is ${today} but RuokapaikkaFi provided data for "${date}"`;
						console.warn(errorMessage);
						result.push({
							isAdditional,
							restaurant: restaurant,
							error: new Error(errorMessage)
						});
					}
				}
			} catch (error) {
				console.error(error);
				result.push({
					isAdditional,
					restaurant: restaurant,
					error: new Error("Unspecified error. See logs for details")
				});
			}
		}));

		return result.sort((a, b) => a.restaurant.localeCompare(b.restaurant));
	}

	parseLounasHTML($: cheerio.Cheerio<cheerio.Element>): string[] {
		const html = $.html();
		if (!html) {
			throw new Error("Empty HTML!");
		}

		return Utils.splitByBrTag(html)
			.slice(1)
			.map(s => s.trim())
			.filter(Boolean);
	}
}

export default RuokapaikkaFiDataProvider;