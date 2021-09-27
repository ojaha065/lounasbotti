import dotenv from "dotenv";
dotenv.config();

import http from "http";

import fetch from "node-fetch";
import bolt from "@slack/bolt";
import { Job, scheduleJob } from "node-schedule";

import { LounasDataProvider } from "model/LounasDataProvider.js";
import RuokapaikkaFiDataProvider from "./model/RuokapaikkaFiDataProvider.js";
import { Restaurant, Settings } from "./model/Settings.js";
import * as BotEvents from "./Events.js";

const VERSION = "1.1.1";
console.info(`Lounasbotti v${VERSION} server starting...`);

process.on("unhandledRejection", error => {
	throw error;
});

if (!process.env["SLACK_SECRET"] || !process.env["SLACK_TOKEN"]) {
	throw new Error("Missing required parameter(s)");
}

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
	gitUrl: "https://github.com/ojaha065/lounasbotti"
};

let dataProvider: LounasDataProvider;

switch (settings.dataProvider) {
	case "ruokapaikkaFi":
		dataProvider = new RuokapaikkaFiDataProvider(settings);
		break;
	default:
		throw new Error(`Unknown data provider ${settings.dataProvider}`);
}

const app = new App({
	signingSecret: process.env["SLACK_SECRET"],
	token: process.env["SLACK_TOKEN"],
	socketMode: process.env["SLACK_SOCKET"] as unknown as boolean || false,
	appToken: process.env["SLACK_APP_TOKEN"] || ""
});

BotEvents.initEvents(app);

app.message("!ping", async ({say}) => {
	say("Pong!");
});

app.message("!whoami", async ({say, message}) => {
	if (!message.subtype) {
		say(message.user);
	}
});

app.message(/!(lounas|ruokaa)/, async args => {
	await BotEvents.handleLounas(args, dataProvider, settings);
});

// Home tab
app.event("app_home_opened", async args => {
	await BotEvents.handleHomeTab(args, VERSION, restartJob);
});

const botPort = 3000;
const webPort: number = (process.env["PORT"] || 8080) as unknown as number;
app.start(botPort).then(() => {
	console.info(`Lounasbotti server started on port ${botPort}`);

	// Keep Heroku free Dyno running
	if (process.env["HEROKU_INSTANCE_URL"]) {
		http.createServer((_req, res) => {
			res.writeHead(204).end();
		}).listen(webPort, () => {
			console.info(`Web server started on port ${webPort}`);
			setInterval(() => {
				fetch(process.env["HEROKU_INSTANCE_URL"] || "", {
					method: "GET"
				});
			}, 1000 * 60 * 10);
		});
	}
});