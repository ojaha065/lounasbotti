import * as Utils from "../Utils.js";
import { LounasDataProvider, LounasResponse } from "./LounasDataProvider.js";
import { Restaurant, RestaurantNameMap, Settings } from "./Settings.js";

class RuokapaikkaFiDataProvider implements LounasDataProvider {
	readonly id: string = "RuokapaikkaFi";
	readonly baseUrl: string = "https://www.ruokapaikka.fi/resources/lunch/pois";

	readonly settings: Settings;
	readonly VERSION: string;

	readonly HEADER_REGEXP = /Lounas\s\d\.\d\./;

	public constructor(settings: Settings, VERSION: string) {
		this.settings = settings;
		this.VERSION = VERSION;

		// this.restaurantMap.talli = new TalliDataProvider(settings, VERSION);
	}

	public async getData(restaurants: Restaurant[], additionalRestaurants?: Restaurant[], tomorrowRequest = false): Promise<LounasResponse[]> {
		try {
			console.debug("Fetching data from ruokapaikkaFi...");

			if (tomorrowRequest) {
				throw new Error("tomorrowRequest currently not supported");
			}
	
			const url = new URL(this.baseUrl);
			url.search = new URLSearchParams({
				// Disec Oy
				lat: "61.681",
				lon: "27.258",
				maxdist: "5000", // 5 km

				page: "0",

				// No idea how this parameter works. 5 returns zero result. 100 seems to work best
				size: "100",

				l: "fi",
				ts: Date.now().toString(),
				channel: "collections_ruokapaikka"
			}).toString();
			console.debug(url.toString());
	
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
					if (!correctAdBlock || !correctAdBlock["header"] || !correctAdBlock["lunchMenu"]) {
						return false;
					}
	
					return {
						name: item["name"],
						header: correctAdBlock["header"],
						lunchMenu: correctAdBlock["lunchMenu"]
					};
				}).filter(Boolean);
	
			if (!json) {
				throw new Error("No data received from Ruokapaikka.fi");
			}
	
			return [...restaurants, ...(additionalRestaurants || [])].map(restaurant => {
				const isAdditional = !!additionalRestaurants?.includes(restaurant);
	
				/* if (typeof this.restaurantMap[restaurant] === "object") {
					const customResult = await (this.restaurantMap[restaurant] as LounasDataProvider).getData([restaurant], undefined, tomorrowRequest);
					customResult[0].isAdditional = isAdditional;
					return customResult[0];
				} */
				
				// const dataBlock = json.find((_block, i) => i === 0);
				const dataBlock = json.find(block => block.name === RestaurantNameMap[restaurant]);
				if (!dataBlock) {
					return {
						isAdditional,
						restaurant,
						error: new Error(`Error scraping data for restaurant ${restaurant}: Data missing`)
					};
				}
	
				const now = new Date();
				const today = `${now.getUTCDate()}.${now.getUTCMonth() + 1}.`;
				if (!dataBlock.header.includes(today)) {
					return {
						isAdditional,
						restaurant,
						error: new Error(`Error scraping data for restaurant ${restaurant}: Today is ${today} but RuokapaikkaFi provided data for "${dataBlock.header}"`)
					};
				}
	
				return {
					isAdditional,
					restaurant,
					items: dataBlock.lunchMenu.map((menuItem: any) => menuItem.food),
					date: dataBlock.header
				};
			}).sort((a, b) => a.restaurant.localeCompare(b.restaurant));
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