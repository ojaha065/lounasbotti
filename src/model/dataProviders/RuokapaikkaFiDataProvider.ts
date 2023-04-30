import * as Utils from "../../Utils.js";
import { LounasDataProvider, LounasResponse } from "./LounasDataProvider.js";
import { Restaurant, RestaurantNameMap, Settings } from "../Settings.js";
import TalliDataProvider from "./TalliDataProvider.js";
import VaihdaDataProvider from "./VaihaDataProvider.js";

class RuokapaikkaFiDataProvider implements LounasDataProvider {
	readonly id: string = "RuokapaikkaFi";
	readonly baseUrl: string = "https://www.ruokapaikka.fi/resources/lunch/pois";

	readonly settings: Settings;
	readonly VERSION: string;

	readonly HEADER_REGEXP = /Lounas\s\d{1,2}\.\d{1,2}\./;
	readonly EXTRA_SPACES_REGEXP = /\s{5,}/g;

	public constructor(settings: Settings, VERSION: string) {
		this.settings = settings;
		this.VERSION = VERSION;
	}

	public async getData(restaurants: Restaurant[], tomorrowRequest = false): Promise<LounasResponse[]> {
		try {
			console.debug("Fetching data from ruokapaikkaFi...");

			const now = new Date();
			now.setUTCHours(9);

			if (tomorrowRequest) {
				now.setDate(now.getDate() + 1);
			}
	
			const url = new URL(this.baseUrl);
			url.search = new URLSearchParams({
				// Disec Oy
				lat: "61.681",
				lon: "27.258",
				maxdist: "10000", // 10 km

				page: "0",

				// No idea how this parameter works. 5 returns zero result. 100 seems to work best
				size: "100",

				l: "fi",
				ts: now.getTime().toString(),
				channel: "collections_ruokapaikka"
			}).toString();
	
			const response = await Utils.fetchWithTimeout(url.toString(), {
				method: "GET",
				headers: {
					"User-Agent": `Mozilla/5.0 (compatible; Lounasbotti/${this.VERSION}; +${this.settings.gitUrl})`
				}
			});
	
			if (!response.ok) {
				throw new Error(`Response ${response.status} from ${url}`);
			}
	
			const jsonResponse = await response.json();
	
			const json: any[] = (jsonResponse as any)["items"]
				?.map((item: any) => {
					const correctAdBlock = item.ads?.map((elem: any) => elem["ad"] ?? {}).find((ad: any) => this.HEADER_REGEXP.test(ad["header"]));
					if (!correctAdBlock?.["header"]) {
						return false;
					}
	
					return {
						name: item["name"],
						icon: item["icon"] || item["hricon"],
						header: correctAdBlock["header"],
						lunchMenu: correctAdBlock["lunchMenu"],
						body: correctAdBlock["body"]
					};
				}).filter(Boolean);
	
			if (!json) {
				throw new Error("No data received from Ruokapaikka.fi");
			}
	
			return (await Promise.all(restaurants.map(async restaurant => {
				const isAdditional = !!this.settings.additionalRestaurants?.includes(restaurant);
				
				// const dataBlock = json.find((_block, i) => i === 0);
				const dataBlock = json.find(block => block.name === RestaurantNameMap[restaurant]);
				if (!dataBlock) {
					if (restaurant === Restaurant.talli) {
						const talliResponseArr = await new TalliDataProvider(this.settings, this.VERSION).getData([Restaurant.talli], tomorrowRequest);
						if (talliResponseArr[0]?.items?.length) {
							return talliResponseArr[0];
						}
					}
					else if (restaurant === Restaurant.savo) {
						const responseArr = await new VaihdaDataProvider(this.settings, this.VERSION).getData([Restaurant.savo], tomorrowRequest);
						if (responseArr[0]?.items?.length) {
							return responseArr[0];
						}
					}

					return {
						isAdditional,
						restaurant,
						error: new Error("Ravintolalla ei ole voimassaolevaa lounaslistaa.")
					};
				}

				// eslint-disable-next-line no-undef-init
				let iconUrl: string | undefined = undefined;
				if (this.settings.overrideIconsUrl) {
					iconUrl = new URL(`/lounas_icons/${restaurant}.png`, this.settings.overrideIconsUrl).toString();
				} else if (dataBlock.icon) {
					try {
						iconUrl = new URL(dataBlock.icon, "https://kuvat.tassa.fi").toString();
					} catch (urlError) {
						console.warn(urlError);
					}
				}
	
				const today = `${now.getUTCDate()}.${now.getUTCMonth() + 1}.`;
				if (!dataBlock.header.includes(today)) {
					return {
						isAdditional,
						restaurant,
						error: new Error(`Error scraping data for restaurant ${restaurant}: Today is ${today} but RuokapaikkaFi provided data for "${dataBlock.header}"`),
						iconUrl
					};
				}

				let items: string[];
				if (dataBlock.lunchMenu) {
					items = dataBlock.lunchMenu.map((menuItem: any) => menuItem.food);
				} else if (dataBlock.body) {
					if (restaurant === Restaurant.rami || restaurant === Restaurant.lansiSavo || restaurant === Restaurant.kivijalka) {
						dataBlock.body = dataBlock.body.split("<br><br>")[0]
							.replaceAll(this.EXTRA_SPACES_REGEXP, "<br>");
					}

					const split = Utils.splitByBrTag(dataBlock.body);
					const spliceEndIndex = split.findIndex(s => s === "Lounas tarjolla");
					if (spliceEndIndex >= 0) {
						split.splice(spliceEndIndex);
					}
					items = split;
				} else {
					return {
						isAdditional,
						restaurant,
						error: new Error(`Error scraping data for restaurant ${restaurant}: Data block is missing both lunchMenu and body`),
						iconUrl
					};
				}
	
				const weekdayName = Utils.getCurrentWeekdayNameInFinnish(tomorrowRequest);
				return {
					isAdditional,
					restaurant,
					items: items
						.map(s => s.trim())
						.filter(Boolean)
						.filter(s => !new RegExp(`^${weekdayName}\\s*(?:\\.|[0-9])*$`, "i").test(s))
						.map(s => s.replaceAll(new RegExp(`${weekdayName}:?`, "gi"), ""))
						.map(s => s.trim())
						.filter(Boolean),
					date: dataBlock.header.replace("Lounas", weekdayName).trim(),
					iconUrl
				};
			}))).sort((a, b) => a.restaurant.localeCompare(b.restaurant));
		} catch (error) {
			console.error(error);
			return restaurants.map(restaurant => {
				return {
					isAdditional: false,
					restaurant,
					error: new Error("Unspecified error. See logs for details")
				};
			});
		}
	}
}

export default RuokapaikkaFiDataProvider;