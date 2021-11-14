import { readFileSync } from "fs";

import { LounasDataProvider } from "./LounasDataProvider.js";
import * as Utils from "../Utils.js";
import RuokapaikkaFiDataProvider from "./RuokapaikkaFiDataProvider.js";
import MockDataProvider from "./MockDataProvider.js";

type Settings = {
	dataProvider: LounasDataProvider | "self",
	defaultRestaurants: Restaurant[],
	additionalRestaurants?: Restaurant[],
	gitUrl: string,
	displayVoters: boolean,
	emojiRules?: Map<RegExp, string>
	debug?: {
		noDb?: boolean
	}
};

enum Restaurant {
	savo = "savo",
	talli = "talli",
	rami = "rami",
	august = "august",
	holvi = "holvi",
	vino = "vino"
}

const RestaurantNameMap: Record<Restaurant, string> = {
	savo: "Ravintola Savo",
	talli: "Ravintola Talli",
	rami: "Lounasravintola Rami",
	august: "Ravintola August",
	holvi: "Bistro Holvi",
	vino: "Ravintola Vino"

};

/**
 * @throws If any error is encountered
 */
const readAndParseSettings = (VERSION: string, config?: string | undefined): Settings => {
	const json = JSON.parse(readFileSync(`${process.cwd()}/${config || "config"}.json`, "utf-8"));

	const defaultRestaurantsValue = Utils.requireNonNullOrUndefined(json.defaultRestaurants, "Parameter defaultRestaurants is required");
	if (!Array.isArray(defaultRestaurantsValue)) {
		throw new Error("Error parsing defaultRestaurants");
	}
	const defaultRestaurants: Restaurant[] = defaultRestaurantsValue
		.map(o => String(o))
		.filter(s => Object.values<string>(Restaurant).includes(s))
		.map(s => Restaurant[s as Restaurant]);

	if (json.additionalRestaurants && !Array.isArray(json.additionalRestaurants)) {
		throw new Error("Error parsing additionalRestaurants");
	}
	const additionalRestaurants: Restaurant[] = (json.additionalRestaurants as unknown[] || [])
		.map(o => String(o))
		.filter(s => Object.values<string>(Restaurant).includes(s))
		.map(s => Restaurant[s as Restaurant]);

	const settings: Settings = {
		dataProvider: "self",
		defaultRestaurants,
		additionalRestaurants,
		gitUrl: String(Utils.requireNonNullOrUndefined(json.gitUrl, "Parameter gitUrl is required")),
		displayVoters: Utils.requireNonNullOrUndefined(json.displayVoters, "Parameter displayVoters is required")
	};

	// Data provider
	let dataProvider: LounasDataProvider;
	switch (Utils.requireNonNullOrUndefined(json.dataProvider, "Parameter dataProvider is required")) {
		case "ruokapaikkaFi":
			dataProvider = new RuokapaikkaFiDataProvider(settings, VERSION);
			break;
		case "mock":
			dataProvider = new MockDataProvider(settings);
			break;
		default:
			throw new Error(`Unknown data provider ${json.dataProvider}`);
	}
	settings.dataProvider = dataProvider;

	// Emoji rules
	if (json.emojiRules) {
		if (!Array.isArray(json.emojiRules)) {
			throw new Error("Error parsing emojiRules");
		}

		settings.emojiRules = new Map(json.emojiRules
			.filter(Array.isArray)
			.filter((arr: any[]) => arr.length === 2)
			.map((arr: any[]) => {
				arr[0] = RegExp(arr[0], "i");
				return arr;
			})
		);
	}

	// Debug
	if (json.debug) {
		console.warn("Current configuration has debug options");
		settings.debug = json.debug;
	}

	return settings;
};

export { Settings, Restaurant, RestaurantNameMap, readAndParseSettings };