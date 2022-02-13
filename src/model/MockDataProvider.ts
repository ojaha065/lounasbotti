import { LounasDataProvider, LounasResponse } from "./LounasDataProvider";
import { Restaurant, Settings } from "./Settings";
import * as Utils from "../Utils.js";

class MockDataProvider implements LounasDataProvider {
	readonly id: string = "mock";
	readonly baseUrl: string = "";

	readonly settings: Settings;

	private mockItems: string[] = [
		"Päärynä-puolukkavihersalaattia (M,G)",
		"Savoijkaali-porkkanasalaattia (M,G) *luomuhunaja",
		"Kanaa carrykastikkeessa",
		"Jotakin aivan muuta ja kanaa",
		"Kananmunia lisukkeeksi (sis. kananmuna)",
		"Rapeaa crispykanaa, tuoretomaattisalsaa ja kasviksia",
		"Välimerellistä kasvispaistosta (M,G)",
		"Pekoni-perunasalaattia (M,G)",
		"Kahden kalan keittoa",
		"Lohta bearnaisekastikkeella",
		"Broilerin paistikkeita",
		"Seitipyörykät",
		"Voilla terästettyä perunamuusia",
		"Isoäidin jauhelihapullat riisipedillä",
		"Lihaa riisipedillä",
		"Riistakäristystä",
		"Pannupizzaa",
		"Perunasalaattia ja kurpitsaa"
	];

	public constructor(settings: Settings) {
		this.settings = settings;
	}

	public getData(restaurants: Restaurant[]): Promise<LounasResponse[]> {
		const today = Utils.getCurrentWeekdayNameInFinnish();

		const result: LounasResponse[] = [];
		for (let i = 0; i < restaurants.length; i++) {
			if (i === 0) {
				result.push({
					restaurant: restaurants[i],
					isAdditional: false,
					date: today,
					error: new Error("Mock error")
				});
			} else if (i === restaurants.length - 1) {
				result.push({
					restaurant: restaurants[i],
					isAdditional: false,
					date: today,
					items: this.mockItems,
					iconUrl: new URL("https://www.kissakala.fi/test_image.jpg")
				});
			} else {
				result.push({
					restaurant: restaurants[i],
					isAdditional: false,
					date: today,
					items: [],
					iconUrl: new URL("https://www.kissakala.fi/test_image.jpg")
				});
			}
		}

		return new Promise(resolve => {
			setTimeout(resolve.bind(null, result), 100);
		});
	}
}

export default MockDataProvider;