import { promises as fs } from "fs";

import { LounasDataProvider } from "./LounasDataProvider.js";
import * as Utils from "../Utils.js";
import RuokapaikkaFiDataProvider from "./RuokapaikkaFiDataProvider.js";
import MockDataProvider from "./MockDataProvider.js";
import * as SettingsRepository from "./SettingsRepository.js";

class Settings {
	public instanceId: string;
	public dataProvider: LounasDataProvider | "self" = "self";
	public triggerRegExp: RegExp;
	public defaultRestaurants: Restaurant[];
	public additionalRestaurants?: Restaurant[];
	public gitUrl: string;
	public displayVoters: boolean;
	public iconsEnabled: boolean;
	public overrideIconsUrl?: URL;
	public announcements?: string[];
	public adminUsers: string[] = [];
	public emojiRules?: Map<RegExp, string>;
	public configSource?: string;
	public debug?: {
		noDb?: boolean
	};

	// Instance settings
	public limitToOneVotePerUser = false;

	constructor(json: any, VERSION: string) {
		this.instanceId = Utils.requireNonNullOrUndefined(json.instanceId, "Parameter instanceId is required");

		switch (Utils.requireNonNullOrUndefined(json.dataProvider, "Parameter dataProvider is required")) {
			case "ruokapaikkaFi":
				this.dataProvider = new RuokapaikkaFiDataProvider(this, VERSION);
				break;
			case "mock":
				this.dataProvider = new MockDataProvider(this);
				break;
			default:
				throw new Error(`Unknown data provider ${json.dataProvider}`);
		}

		this.triggerRegExp = RegExp(Utils.requireNonNullOrUndefined(json.triggerRegExp, "Parameter triggerRegExp is required"), "i");

		const defaultRestaurantsValue = Utils.requireNonNullOrUndefined(json.defaultRestaurants, "Parameter defaultRestaurants is required");
		if (!Array.isArray(defaultRestaurantsValue)) {
			throw new Error("Error parsing defaultRestaurants");
		}
		this.defaultRestaurants = defaultRestaurantsValue
			.map(o => String(o))
			.filter(s => Object.values<string>(Restaurant).includes(s))
			.map(s => Restaurant[s as Restaurant]);

		if (json.additionalRestaurants && !Array.isArray(json.additionalRestaurants)) {
			throw new Error("Error parsing additionalRestaurants");
		}
		this.additionalRestaurants = (json.additionalRestaurants as unknown[] || [])
			.map(o => String(o))
			.filter(s => Object.values<string>(Restaurant).includes(s))
			.map(s => Restaurant[s as Restaurant]);

		this.gitUrl = String(Utils.requireNonNullOrUndefined(json.gitUrl, "Parameter gitUrl is required"));
		this.displayVoters = Utils.requireNonNullOrUndefined(json.displayVoters, "Parameter displayVoters is required");
		this.iconsEnabled = Utils.requireNonNullOrUndefined(json.iconsEnabled, "Parameter iconsEnabled is required");

		if (json.overrideIconsUrl) {
			this.overrideIconsUrl = new URL(json.overrideIconsUrl);
		}

		if (json.announcements?.length) {
			this.announcements = json.announcements;
		}

		if (json.adminUsers) {
			this.adminUsers.push(...json.adminUsers);
		}

		if (json.emojiRules) {
			this.emojiRules = new Map(json.emojiRules
				.filter(Array.isArray)
				.filter((arr: any[]) => arr.length === 2)
				.map((arr: any[]) => {
					arr[0] = RegExp(arr[0], "i");
					return arr;
				})
			);
		}

		if (json.configSource) {
			this.configSource = json.configSource;
		}

		if (json.debug) {
			console.warn("Current configuration has debug options");
			this.debug = json.debug;
		}
	}
}

type InstanceSettings = {
	instanceId: string,
	triggerRegExp?: RegExp | undefined,
	limitToOneVotePerUser?: boolean
};

enum Restaurant {
	savo = "savo",
	talli = "talli",
	rami = "rami",
	ramiVisulahti = "ramiVisulahti",
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
	ramiVisulahti: "Rami Visulahti",
	august: "Ravintola August",
	holvi: "Bistro Holvi",
	vino: "Ravintola Vino",
	fernando: "Ravintola Fernando",
	pormestari: "Vaiha Oy / Pormestari",
	lale: "Ravintola Lale"

};

const readAndParseSettings = async (VERSION: string, config?: string | undefined, configURLs?: URL[] | undefined): Promise<Settings> => {
	let json: any;
	
	if (configURLs?.length) {
		for (const url of configURLs) {
			json = await tryToReadSettingsFromURL(url, VERSION);
			if (json) {break;}
		}

		if (!json) {
			throw new Error("Could not read config from any URL");
		}
	} else {
		const configFile = config || "config";
		console.warn(`Using local configuration file "${configFile}"...`);
		json = await fs.readFile(`${process.cwd()}/${configFile}.json`, "utf-8");
		json = JSON.parse(json);
		json.configSource = json.configSource || "[Local configuration file]";
	}

	console.info(`Using configuration from ${json.configSource}`);

	return new Settings(json, VERSION);
};

const readInstanceSettings = (settings: Settings): void => {
	SettingsRepository.findOrCreate(settings.instanceId).then(instanceSettings => {
		settings.limitToOneVotePerUser = Boolean(instanceSettings.limitToOneVotePerUser);

		if (instanceSettings.triggerRegExp) {
			console.debug(`Custom trigger enabled for instance "${settings.instanceId}" (${instanceSettings.triggerRegExp.source})`);
			settings.triggerRegExp = instanceSettings.triggerRegExp;
		}
	}).catch(error => {
		console.error(error);
	});
};

export { Settings, InstanceSettings, Restaurant, RestaurantNameMap, readAndParseSettings, readInstanceSettings };

async function tryToReadSettingsFromURL(url: URL, VERSION: string): Promise<any> {
	try {
		const response = await Utils.fetchWithTimeout(url.toString(), {
			method: "GET",
			headers: {
				"User-Agent": `Mozilla/5.0 (compatible; Lounasbotti/${VERSION};)`,
				Accept: "application/json"
			}
		});

		if (response.ok) {
			const json: any = await response.json();
			json.configSource = json.configSource || response.url;
			return json;
		}
		throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
	} catch (error) {
		console.error(error);
		return null;
	}
}