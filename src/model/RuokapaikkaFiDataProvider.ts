import * as cheerio from "cheerio";
import htmlparser2 from "htmlparser2";

import * as Utils from "../Utils.js";
import { LounasDataProvider, LounasResponse } from "./LounasDataProvider.js";
import TalliDataProvider from "./TalliDataProvider.js";
import { Restaurant, Settings } from "./Settings.js";

class RuokapaikkaFiDataProvider implements LounasDataProvider {
	readonly id: string = "RuokapaikkaFi";
	readonly baseUrl: string = "https://www.ruokapaikka.fi/";
	readonly restaurantMap: Record<Restaurant, string | LounasDataProvider> = {
		savo: "ravintolasavo.php",
		talli: "CUSTOM",
		rami: "lounasravintola_rami.php",
		august: "august.php",
		holvi: "bistroholvi.php",
		vino: "vino.php",
		fernando: "fernando.php"
	};

	readonly settings: Settings;
	readonly VERSION: string;

	public constructor(settings: Settings, VERSION: string) {
		this.settings = settings;
		this.VERSION = VERSION;

		this.restaurantMap.talli = new TalliDataProvider(settings, VERSION);
	}

	public async getData(restaurants: Restaurant[], additionalRestaurants?: Restaurant[], tomorrowRequest = false): Promise<LounasResponse[]> {
		console.debug("Fetching data from ruokapaikkaFi...");

		const result: LounasResponse[] = [];

		await Promise.all([...restaurants, ...(additionalRestaurants || [])].map(async restaurant => {
			const isAdditional = !!additionalRestaurants?.includes(restaurant);

			try {
				if (typeof this.restaurantMap[restaurant] === "object") {
					const customResult = await (this.restaurantMap[restaurant] as LounasDataProvider).getData([restaurant], undefined, tomorrowRequest);
					customResult[0].isAdditional = isAdditional;
					result.push(customResult[0]);
					return;
				}
	
				const url = `${this.baseUrl}/${this.restaurantMap[restaurant]}`;

				const response = await Utils.fetchWithTimeout(url, {
					method: "GET",
					headers: {
						"User-Agent": `Mozilla/5.0 (compatible; Lounasbotti/${this.VERSION}; +${this.settings.gitUrl})`
					}
				});

				if (!response.ok) {
					throw new Error(`Response ${response.status} from ${url}`);
				}

				const html = await response.text();
				const dom = htmlparser2.parseDocument(html);
				const $ = cheerio.load(dom);

				const $lounasHTML = $(`.tekstit2 > p:nth-child(${tomorrowRequest ? 4 : 3})`).first();
				if (!$lounasHTML.length) {
					const errorMessage = `Error scraping data for restaurant ${restaurant}`;
					console.warn(errorMessage);
					result.push({
						isAdditional,
						restaurant: restaurant,
						error: new Error(errorMessage)
					});
				} else {
					const today = Utils.getCurrentWeekdayNameInFinnish(tomorrowRequest);
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

						let isOK = false;
						if (restaurant === Restaurant.fernando) {
							const fernandoResult = this.fernandoSpecialHandling($);
							if (fernandoResult) {
								result.push(fernandoResult);
								isOK = true;
							}
						}

						if (!isOK) {
							result.push({
								isAdditional,
								restaurant: restaurant,
								error: new Error(errorMessage)
							});
						}
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

		const parsedList = Utils.splitByBrTag(html)
			.slice(1)
			.map(s => s.trim())
			.filter(Boolean);
		
		if (!parsedList.length) {
			parsedList.push("Tätä ruokalistaa ei juuri nyt ole saatavilla. Tämä johtuu todennäköisesti siitä, että ravintola ei ole auki.");
		}

		return parsedList;
	}

	private fernandoSpecialHandling($: cheerio.CheerioAPI): LounasResponse | false {
		console.debug("Special handling for Fernando...");
		const $fernandoHTML = $(`.tekstit2 > p:nth-child(${3 + (Math.max(new Date().getUTCDay() - 1, 0))})`).first();
		if ($fernandoHTML.length) {
			const fernandoDate = $fernandoHTML.children("b").first().text().toLowerCase();
			if (fernandoDate.includes(Utils.getCurrentWeekdayNameInFinnish())) {
				return {
					isAdditional: true,
					restaurant: Restaurant.fernando,
					date: $fernandoHTML.children("b").first().text().toLowerCase(),
					items: this.parseLounasHTML($fernandoHTML)
				};
			} else {
				console.debug(`RuokapaikkaFi provided data for ${fernandoDate}`);
			}
		}

		console.error("Fernando special handling failed");
		return false;
	}
}

export default RuokapaikkaFiDataProvider;