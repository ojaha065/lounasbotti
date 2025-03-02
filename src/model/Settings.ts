/* eslint-disable @typescript-eslint/no-explicit-any */

import { promises as fs } from "fs";

import type { LounasDataProvider } from "./dataProviders/LounasDataProvider.js";
import * as Utils from "../Utils.js";
import RuokapaikkaFiDataProvider from "./dataProviders/RuokapaikkaFiDataProvider.js";
import MockDataProvider from "./dataProviders/MockDataProvider.js";
import * as SettingsRepository from "./SettingsRepository.js";

type Remarks = [{ regExp: RegExp, message: string }];

class Settings {
	public instanceId: string;
	public latLon: {lat: number, lon: number};
	public defaultRestaurants: Restaurant[];
	public additionalRestaurants?: Restaurant[];
	public restaurantDisplayNames?: Map<Restaurant, string>;
	public customErrorMessages?: Map<Restaurant, string>;
	public gitUrl: string;
	public displayVoters: boolean;
	public iconsEnabled: boolean;
	public overrideIconsUrl?: URL;
	public announcements?: string[];
	public adminUsers: string[] = [];
	public emojiRules?: Map<RegExp, string>;
	public stripRules?: RegExp[];
	public openMeteoURL?: URL;
	public configSource?: string;
	public debug?: object;
	public extraParams?: Record<string, string>;

	// Instance settings
	public limitToOneVotePerUser = false;
	public subscribedChannels?: string[] | undefined;
	public remarks?: Remarks | undefined

	public _dataProvider: LounasDataProvider | "self" = "self";

	constructor(json: any) {
		this.instanceId = Utils.requireNonNullOrUndefined(json.instanceId, "Parameter instanceId is required");
		this.latLon = Utils.requireNonNullOrUndefined(json.latLon, "Parameter latLon is required");

		switch (Utils.requireNonNullOrUndefined(json.dataProvider, "Parameter dataProvider is required")) {
			case "ruokapaikkaFi":
				this._dataProvider = new RuokapaikkaFiDataProvider(this);
				break;
			case "mock":
				this._dataProvider = new MockDataProvider(this);
				break;
			default:
				throw new Error(`Unknown data provider ${json.dataProvider}`);
		}

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

		["restaurantDisplayNames", "customErrorMessages"].forEach(settingName => {
			if (json[settingName]) {
				this[settingName as "restaurantDisplayNames" | "customErrorMessages"] = new Map(json[settingName]
					.filter(Array.isArray)
					.filter((arr: any[]) => arr.length === 2)
					.map((arr: any[]) => {
						arr[0] = Restaurant[arr[0] as Restaurant];
						return arr;
					})
				);
			}
		});

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
				.filter((arr: string[] | RegExp[]) => arr.length === 2)
				.map((arr: string[] | RegExp[]) => {
					arr[0] = RegExp(arr[0], "i");
					return arr;
				})
			);
		}

		if (json.stripRules) {
			this.stripRules = json.stripRules
				.filter(Boolean)
				.map((s: string) => RegExp(s, "i"));
		}

		if (json.openMeteoURL) {
			this.openMeteoURL = new URL(json.openMeteoURL);
		}

		if (json.configSource) {
			this.configSource = json.configSource;
		}

		if (json.debug) {
			console.warn("Current configuration has debug options");
			this.debug = json.debug;
		}

		if (json.extraParams) {
			this.extraParams = json.extraParams;
		}
	}

	public get dataProvider(): LounasDataProvider {
		if (typeof this._dataProvider === "string") {
			throw new Error();
		}

		return this._dataProvider;
	}
}

type InstanceSettings = {
	instanceId: string,
	limitToOneVotePerUser?: boolean,
	subscribedChannels?: string[] | undefined,
	remarks?: [{ regExp: RegExp, message: string }] | undefined
};

enum Restaurant {
	savo = "savo",
	vaihaAsema = "vaihaAsema",
	rauha = "rauha",
	talli = "talli",
	rami = "rami",
	ramiVisulahti = "ramiVisulahti",
	august = "august",
	holvi = "holvi",
	vino = "vino",
	fernando = "fernando",
	pormestari = "pormestari",
	lale = "lale",
	lansiSavo = "lansiSavo",
	kotiherkku = "kotiherkku"
}

const RestaurantNameMap: Record<Restaurant, string> = {
	savo: "Vaiha Savo",
	vaihaAsema: "Vaiha Asema",
	rauha: "Kahvila-ravintola Rauha",
	talli: "Ravintola Talli",
	rami: "Ramin Konditoria Sammonkatu",
	ramiVisulahti: "Rami Visulahti",
	august: "Ravintola August",
	holvi: "Bistro Holvi",
	vino: "Ravintola Vino",
	fernando: "Ravintola Fernando",
	pormestari: "Vaiha Pormestari",
	lale: "Ravintola Lale",
	lansiSavo: "Ravintola Länsi-Savo",
	kotiherkku: "Serviini Oy / Kotiherkku Ruokapuoti"
};

const readAndParseSettings = async (config?: string | undefined, configURLs?: URL[] | undefined): Promise<Settings> => {
	let json: any;
	
	if (configURLs?.length) {
		for (const url of configURLs) {
			json = await tryToReadSettingsFromURL(url);
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

	return new Settings(json);
};

const readInstanceSettings = (settings: Settings): void => {
	SettingsRepository.findOrCreate(settings.instanceId).then(instanceSettings => {
		settings.limitToOneVotePerUser = Boolean(instanceSettings.limitToOneVotePerUser);
		settings.subscribedChannels = instanceSettings.subscribedChannels;
		settings.remarks = instanceSettings.remarks;
	}).catch(error => {
		console.error(error);
	});
};

export { Settings, InstanceSettings, Restaurant, RestaurantNameMap, readAndParseSettings, readInstanceSettings };

async function tryToReadSettingsFromURL(url: URL): Promise<any> {
	try {
		const response = await Utils.fetchWithTimeout(url.toString(), {
			method: "GET",
			headers: {
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