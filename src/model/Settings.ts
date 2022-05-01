import { promises as fs } from "fs";

import { LounasDataProvider } from "./LounasDataProvider.js";
import * as Utils from "../Utils.js";
import RuokapaikkaFiDataProvider from "./RuokapaikkaFiDataProvider.js";
import MockDataProvider from "./MockDataProvider.js";
import * as SettingsRepository from "./SettingsRepository.js";

type Settings = {
	instanceId: string,
	dataProvider: LounasDataProvider | "self",
	triggerRegExp: RegExp,
	defaultRestaurants: Restaurant[],
	additionalRestaurants?: Restaurant[],
	gitUrl: string,
	displayVoters: boolean,
	iconsEnabled: boolean,
	overrideIconsUrl?: URL,
	announcements?: string[],
	emojiRules?: Map<RegExp, string>,
	configSource?: string,
	debug?: {
		noDb?: boolean
	}
};

type InstanceSettings = {
	instanceId: string,
	triggerRegExp?: RegExp | undefined,
};

enum Restaurant {
	savo = "savo",
	talli = "talli",
	rami = "rami",
	august = "august",
	holvi = "holvi",
	vino = "vino",
	fernando = "fernando",
	pormestari = "pormestari",
	lale = "lale"
}

const RestaurantNameMap: Record<Restaurant, string> = {
	savo: "Vaiha Savo",
	talli: "Ravintola Talli",
	rami: "Lounasravintola Rami",
	august: "Ravintola August",
	holvi: "Bistro Holvi",
	vino: "Ravintola Vino",
	fernando: "Ravintola Fernando",
	pormestari: "Vaiha Oy / Pormestari",
	lale: "Ravintola Lale"

};

const readAndParseSettings = async (VERSION: string, config?: string | undefined, configURL?: URL | undefined): Promise<Settings> => {
	let json: any;
	if (configURL) {
		try {
			const response = await Utils.fetchWithTimeout(configURL.toString(), {
				method: "GET",
				headers: {
					"User-Agent": `Mozilla/5.0 (compatible; Lounasbotti/${VERSION};)`,
					Accept: "application/json"
				}
			});
			
			if (response.ok) {
				json = await response.json();
				json.configSource = json.configSource || response.url;
			} else {
				console.warn(`HTTP error ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			console.error(error);
		}
	}

	if (!json) {
		const configFile = config || "config";
		console.info(`Using local configuration file "${configFile}"...`);
		json = await fs.readFile(`${process.cwd()}/${configFile}.json`, "utf-8");
		json = JSON.parse(json);
		json.configSource = json.configSource || "[Local configuration file]";
	}

	const defaultRestaurantsValue = Utils.requireNonNullOrUndefined(json.defaultRestaurants, "Parameter defaultRestaurants is required");
	if (!Array.isArray(defaultRestaurantsValue)) {
		return Promise.reject(Error("Error parsing defaultRestaurants"));
	}
	const defaultRestaurants: Restaurant[] = defaultRestaurantsValue
		.map(o => String(o))
		.filter(s => Object.values<string>(Restaurant).includes(s))
		.map(s => Restaurant[s as Restaurant]);

	if (json.additionalRestaurants && !Array.isArray(json.additionalRestaurants)) {
		return Promise.reject(Error("Error parsing additionalRestaurants"));
	}
	const additionalRestaurants: Restaurant[] = (json.additionalRestaurants as unknown[] || [])
		.map(o => String(o))
		.filter(s => Object.values<string>(Restaurant).includes(s))
		.map(s => Restaurant[s as Restaurant]);

	const settings: Settings = {
		instanceId: Utils.requireNonNullOrUndefined(json.instanceId, "Parameter instanceId is required"),
		dataProvider: "self",
		triggerRegExp: RegExp(Utils.requireNonNullOrUndefined(json.triggerRegExp, "Parameter triggerRegExp is required"), "i"),
		defaultRestaurants,
		additionalRestaurants,
		gitUrl: String(Utils.requireNonNullOrUndefined(json.gitUrl, "Parameter gitUrl is required")),
		displayVoters: Utils.requireNonNullOrUndefined(json.displayVoters, "Parameter displayVoters is required"),
		iconsEnabled: Utils.requireNonNullOrUndefined(json.iconsEnabled, "Parameter iconsEnabled is required")
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
			return Promise.reject(Error(`Unknown data provider ${json.dataProvider}`));
	}
	settings.dataProvider = dataProvider;

	// Override icons
	if (json.overrideIconsUrl) {
		settings.overrideIconsUrl = new URL(json.overrideIconsUrl);
	}

	// Announcements
	if (json.announcements?.length) {
		settings.announcements = json.announcements;
	}

	// Emoji rules
	if (json.emojiRules) {
		if (!Array.isArray(json.emojiRules)) {
			return Promise.reject(Error("Error parsing emojiRules"));
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

	// Config source
	if (json.configSource) {
		settings.configSource = json.configSource;
	}

	// Debug
	if (json.debug) {
		console.warn("Current configuration has debug options");
		settings.debug = json.debug;
	}

	return Promise.resolve(settings);
};

const readInstanceSettings = (settings: Settings): void => {
	SettingsRepository.findOrCreate(settings.instanceId).then(instanceSettings => {
		if (instanceSettings.triggerRegExp) {
			console.debug(`Custom trigger enabled for instance "${settings.instanceId}" (${instanceSettings.triggerRegExp.source})`);
			settings.triggerRegExp = instanceSettings.triggerRegExp;
		}
	}).catch(error => {
		console.error(error);
	});
};

export { Settings, InstanceSettings, Restaurant, RestaurantNameMap, readAndParseSettings, readInstanceSettings };