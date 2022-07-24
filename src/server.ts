import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { AddressInfo } from "net";

import fetch from "node-fetch";
import bolt from "@slack/bolt";
import { Job, Range, scheduleJob } from "node-schedule";

import mongoose from "mongoose";

import { readAndParseSettings, readInstanceSettings } from "./model/Settings.js";
import * as BotEvents from "./BotEvents.js";
import BotActions from "./BotActions.js";
import AdminEvents from "./AdminEvents.js";

const VERSION = process.env["npm_package_version"] ?? "1.4.19";
console.info(`Lounasbotti v${VERSION} server starting...`);

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

const configURLs: URL[] | undefined = process.env["SLACK_CONFIG_URL"]?.split(";").map(s => new URL(s));
readAndParseSettings(VERSION, process.env["SLACK_CONFIG_NAME"], configURLs).then(settings => {
	const { App } = bolt;

	if (!settings.debug?.noDb) {
		mongoose.connect(process.env["SLACK_MONGO_URL"] as string, {
			socketTimeoutMS: 10000,
			keepAlive: true
		}).then(() => {
			console.debug("Connection to MongoDB opened successfully");
			readInstanceSettings(settings);
		});
	}
	
	const appOptions: bolt.AppOptions = {
		signingSecret: process.env["SLACK_SECRET"] || "",
		token: process.env["SLACK_TOKEN"] || ""
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

	app.message("!channel", async ({say, message}) => {
		if (!message.subtype) {
			say(message.channel);
		}
	});

	app.message("!restart lounasbotti", async ({say}) => {
		say("Okay! Restarting, BRB");
		console.info("Process will now exit due to restart command");
		setTimeout(() => process.exit(), 1000);
	});
	
	if (typeof settings.dataProvider === "string") {
		throw new Error("Incorrect dataProvider");
	}

	BotEvents.initEvents(app, settings, settings.dataProvider, restartJob, VERSION);
	AdminEvents(app, settings);
	BotActions(app, settings);
	
	const botPort = 3000;
	const webPort: number = (process.env["PORT"] || 8080) as unknown as number;
	const portToUse = socketMode ? botPort : webPort;
	app.start({
		port: portToUse,
		host: "0.0.0.0"
	}).then(server => {
		const address = server.address() as AddressInfo;
		console.info(`Lounasbotti server with instanceId "${settings.instanceId}" started on ${address.address}:${address.port} (Mode: ${socketMode ? "SocketMode" : "HTTP"})`);
	
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
});