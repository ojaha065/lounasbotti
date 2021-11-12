import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { AddressInfo } from "net";

import fetch from "node-fetch";
import bolt from "@slack/bolt";
import { Job, Range, scheduleJob } from "node-schedule";

import { LounasDataProvider } from "model/LounasDataProvider.js";
import RuokapaikkaFiDataProvider from "./model/RuokapaikkaFiDataProvider.js";
import MockDataProvider from "./model/MockDataProvider.js";

import { Restaurant, Settings } from "./model/Settings.js";
import * as BotEvents from "./BotEvents.js";

import * as LounasRepository from "./model/LounasRepository.js";

const VERSION = "1.3.0";
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
	restartJob = scheduleJob({
		second: 30,
		minute: 0,
		hour: 3,
		dayOfWeek: new Range(1, 5),
		tz: "Europe/Helsinki"
	}, () => {
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
	additionalRestaurants: [Restaurant.holvi, Restaurant.vino],
	gitUrl: "https://github.com/ojaha065/lounasbotti",
	displayVoters: true,
	emojiRules: new Map([
		[/(?<!kur)pi(?:zz|ts)a/i, ":pizza:"],
		[/keitto/i, ":bowl_with_spoon:"],
		[/((?<!pork)kana(?!nmun))|(broileri)/i, ":chicken:"],
		[/(loh(i|ta){1})|(kala)|(mui(kut|kkuja){1})|sei(ti|tä)/i, ":fish:"],
		[/(?:liha(?:pul|pyöry))|falafel/i, ":falafel:"],
		[/(?:po(?:rsa|ss))|(?:si(?:an|ka))/i, ":pig2:"],
		[/(?:pekoni)|(?:bacon)/i, ":bacon:"],
		[/(?:spagetti)|(?:bolognese)/i, ":spaghetti:"],
		[/pannukak|ohukai/i, ":pancakes:"],
		[/riisi/i, ":rice:"],
		[/porkkan/i, ":carrot:"],
		[/(?:kasvi(?:s|k))|(?:juurek)/i, ":tomato:"],
		[/salaat{1,2}(?:i|eja)/i, ":green_salad:"],
		[/(?:jälkiru(?:u|o))|(?:leipurin\s*mak)|(?:vispipuur)|(?:vanuk)|(?:kiisseli)/i, ":yum:"],
		[/peru(?:na|no)/i, ":potato:"],
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

app.message("!ping", async ({say}) => {
	say("Pong!");
});

app.message("!whoami", async ({say, message}) => {
	if (!message.subtype) {
		say(message.user);
	}
});

BotEvents.initEvents(app, settings, dataProvider, restartJob, VERSION);

const botPort = 3000;
const webPort: number = (process.env["PORT"] || 8080) as unknown as number;
const portToUse = socketMode ? botPort : webPort;
app.start({
	port: portToUse,
	host: "0.0.0.0"
}).then(server => {
	const address = server.address() as AddressInfo;
	console.info(`Lounasbotti server started on ${address.address}:${address.port} (Mode: ${socketMode ? "SocketMode" : "HTTP"})`);

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