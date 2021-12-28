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
		console.debug("Fetching data from xamkravintolat.fi...");

		if (!restaurants.includes(Restaurant.talli) || restaurants.length > 1) {
			throw new Error("TalliDataProvider only supports Ravintola Talli");
		}

		if (additionalRestaurants?.length) {
			throw new Error("TalliDataProvider does not support additionalRestaurants");
		}

		return [{
			isAdditional: false,
			restaurant: Restaurant.talli,
			date: Utils.getCurrentWeekdayNameInFinnish(tomorrowRequest),
			items: ["Tulossa pian"]
		}];
	}
}

export default TalliDataProvider;