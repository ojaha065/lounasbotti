import dotenv from "dotenv";
dotenv.config();

import { AddressInfo } from "net";

import bolt from "@slack/bolt";

import mongoose from "mongoose";

import { readAndParseSettings, readInstanceSettings } from "./model/Settings.js";
import * as BotEvents from "./BotEvents.js";
import BotActions from "./BotActions.js";
import AdminEvents from "./AdminEvents.js";
import { decodeBase64 } from "./Utils.js";
import BotCommands from "./BotCommands.js";

const VERSION = process.env["npm_package_version"] ?? "1.7.4";
console.info(`Lounasbotti v${VERSION} server starting...`);

if (!process.env["SLACK_SECRET"]
	|| !process.env["SLACK_TOKEN"]
	|| (process.env["SLACK_SOCKET"] && !process.env["SLACK_APP_TOKEN"])
	|| !process.env["SLACK_MONGO_URL"]) {
	throw new Error("Missing required environment variable(s)");
}

const socketMode: boolean = process.env["SLACK_SOCKET"] as unknown as boolean || false;

const configURLs: URL[] | undefined = process.env["SLACK_CONFIG_URL"]?.split(";").map(s => new URL(s));
readAndParseSettings(VERSION, process.env["SLACK_CONFIG_NAME"], configURLs).then(settings => {
	const { App } = bolt;

	if (!settings.debug?.noDb) {
		mongoose.connect(decodeBase64(process.env["SLACK_MONGO_URL"] as string), {
			socketTimeoutMS: 10000
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

	appOptions.customRoutes = [
		// Health check
		{
			path: "/health-check",
			method: ["GET"],
			handler: (_req, res) => {
				res.writeHead(200);
				res.end("OK");
			}
		}
	];
	
	const app = new App(appOptions);
	
	if (typeof settings.dataProvider === "string") {
		throw new Error("Incorrect dataProvider");
	}

	BotCommands(app);
	BotEvents.initEvents(app, settings, settings.dataProvider, VERSION);
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
	});
});