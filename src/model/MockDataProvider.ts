import { LounasDataProvider, LounasResponse } from "./LounasDataProvider";
import { Restaurant, Settings } from "./Settings";
import * as Utils from "../Utils.js";

class MockDataProvider implements LounasDataProvider {
	readonly id: string = "mock";
	readonly baseUrl: string = "";
	readonly restaurantMap: Record<Restaurant, string> = {
		savo: "",
		talli: "",
		rami: "",
		august: "",
		holvi: ""
	};

	readonly settings: Settings;

	private mockItems: string[] = [
		"Päärynä-puolukkavihersalaattia (M,G)",
		"Savoijkaali-porkkanasalaattia (M,G) *luomuhunaja",
		"Pekoni-perunasalaattia (M,G)"
	];

	public constructor(settings: Settings) {
		this.settings = settings;
	}

	public getData(restaurants: Restaurant[]): Promise<LounasResponse[]> {
		const today = Utils.getCurrentWeekdayNameInFinnish();
		const result: LounasResponse[] = restaurants.map(restaurant => {
			return {
				restaurant,
				date: today,
				items: this.mockItems
			};
		});

		return new Promise(resolve => {
			setTimeout(resolve.bind(null, result), 100);
		});
	}
}

export default MockDataProvider;