import dotenv from "dotenv";
dotenv.config();

import http from "http";

import fetch from "node-fetch";
import bolt from "@slack/bolt";
import { Job, scheduleJob } from "node-schedule";

import { LounasDataProvider } from "model/LounasDataProvider.js";
import RuokapaikkaFiDataProvider from "./model/RuokapaikkaFiDataProvider.js";
import MockDataProvider from "./model/MockDataProvider.js";

import { Restaurant, Settings } from "./model/Settings.js";
import * as BotEvents from "./Events.js";

import * as LounasRepository from "./model/LounasRepository.js";

const VERSION = "1.2.3";
console.info(`Lounasbotti v${VERSION} server starting...`);

process.on("unhandledRejection", error => {
	console.error(error);
});

if (!process.env["SLACK_SECRET"]
	|| !process.env["SLACK_TOKEN"]
	|| (process.env["SLACK_SOCKET"] && !process.env["SLACK_APP_TOKEN"])
	|| !process.env["SLACK_MONGO_URL"]) {
	throw new Error("Missing required environment variable(s)");
}

const socketMode: boolean = process.env["SLACK_SOCKET"] as unknown as boolean || false;

let restartJob: Job | undefined;
if (process.env["HEROKU_INSTANCE_URL"]) {
	// We'll restart at 3 AM every weekday night to reset the Heroku automatic restart timer that could get triggered at a bad time
	restartJob = scheduleJob("30 0 3 * * 1-5", () => {
		console.info("Process will now exit for the daily automatic restart");
		process.exit();
	});
}

const { App } = bolt;

// TODO: Read settings from JSON file
const settings: Settings = {
	dataProvider: "ruokapaikkaFi",
	userAgent: `Mozilla/5.0 (compatible; Lounasbotti/${VERSION};)`,
	defaultRestaurants: [Restaurant.savo, Restaurant.talli, Restaurant.rami, Restaurant.august],
	gitUrl: "https://github.com/ojaha065/lounasbotti",
	displayVoters: true,
	emojiRules: new Map([
		[/((?<!pork)kana)|(broileri)/i, ":chicken:"],
		[/(loh(i|ta){1})|(kala)|(mui(kut|kkuja){1})|sei(ti|tä)/i, ":fish:"]
	])
};

if (!settings.debug?.noDb) {
	LounasRepository.init(process.env["SLACK_MONGO_URL"] as string);
}

let dataProvider: LounasDataProvider;

switch (settings.dataProvider) {
	case "ruokapaikkaFi":
		dataProvider = new RuokapaikkaFiDataProvider(settings);
		break;
	case "mock":
		dataProvider = new MockDataProvider(settings);
		break;
	default:
		throw new Error(`Unknown data provider ${settings.dataProvider}`);
}

const appOptions: bolt.AppOptions = {
	signingSecret: process.env["SLACK_SECRET"],
	token: process.env["SLACK_TOKEN"]
};
if (socketMode) {
	appOptions.appToken = process.env["SLACK_APP_TOKEN"] || "";
	appOptions.socketMode = true;
}

const app = new App(appOptions);

BotEvents.initEvents(app, settings);

app.message("!ping", async ({say}) => {
	say("Pong!");
});

app.message("!whoami", async ({say, message}) => {
	if (!message.subtype) {
		say(message.user);
	}
});

app.message(/!(lounas|ruokaa)/, async args => {
	await BotEvents.handleLounas(args, dataProvider, settings, app);
});

// Home tab
app.event("app_home_opened", async args => {
	await BotEvents.handleHomeTab(args, VERSION, restartJob);
});

const botPort = 3000;
const webPort: number = (process.env["PORT"] || 8080) as unknown as number;
const portToUse = socketMode ? botPort : webPort;
app.start(portToUse).then(() => {
	console.info(`Lounasbotti server started on port ${portToUse} (Mode: ${socketMode ? "SocketMode" : "HTTP"})`);

	// Keep Heroku free Dyno running
	if (process.env["HEROKU_INSTANCE_URL"]) {
		if (socketMode) {
			http.createServer((_req, res) => {
				res.writeHead(204).end();
			}).listen(webPort, () => {
				console.info(`Web server started on port ${webPort}`);
			});
		}

		setInterval(() => {
			fetch(process.env["HEROKU_INSTANCE_URL"] || "", {
				method: "GET"
			});
		}, 1000 * 60 * 10);
	}
});