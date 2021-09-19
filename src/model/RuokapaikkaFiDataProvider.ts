import fetch from "node-fetch";
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
		august: "august.php"
	};

	readonly settings: Settings;

	public constructor(settings: Settings) {
		this.settings = settings;
	}

	public async getData(restaurants: Restaurant[]): Promise<LounasResponse[]> {
		const result: LounasResponse[] = [];

		await Promise.all(restaurants.map(async restaurant => {
			const url = `${this.baseUrl}/${this.restaurantMap[restaurant]}`;
			try {
				const response = await fetch(url, {
					method: "GET",
					headers: {
						"User-Agent": this.settings.userAgent
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
						restaurant: restaurant,
						error: new Error(errorMessage)
					});
				} else {
					result.push({
						restaurant: restaurant,

						// TODO: Check that date is correct
						date: $lounasHTML.children("b").first().text().toLowerCase(),

						items: this.parseLounasHTML($lounasHTML)
					});
				}
			} catch (error) {
				console.error(error);
				result.push({
					restaurant: restaurant,
					error: new Error("Unspecified error. See logs for details")
				});
			}
		}));

		return result;
	}

	parseLounasHTML($: cheerio.Cheerio<cheerio.Element>): string[] {
		const html = $.html();
		if (!html) {
			throw new Error("Empty HTML!");
		}

		return Utils.splitByBrTag(html)
			.slice(1)
			.map(s => s.trim());
	}
}

export default RuokapaikkaFiDataProvider;